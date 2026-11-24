/**
 * Caso de Uso: Confirmar el registro del colaborador en una transacción (HU6-9 / EQ-59)
 *
 * Todo o nada:
 *   1. Valida la solicitud (mismos códigos que la vista previa de EQ-64).
 *   2. Consulta el perfil en el directorio (EQ-55).
 *   3. Dentro de `repositorio.transaccion`:
 *        a. vuelve a revisar que el ID no esté registrado (evita dobles altas simultáneas),
 *        b. guarda al colaborador activo con su campus y carreras (usuarios),
 *        c. pide a Monitoreo que le asigne los aspirantes de esas carreras (cartera),
 *        d. deja cada cambio en la bitácora de transferencias (motivo "alta").
 *   4. Si algo falla en 3 (incluido el COMMIT), se revierte lo de `usuarios` y se
 *      compensa la cartera con `deshacer()`. No se publica ningún evento.
 *   5. Solo después de confirmar: borra el borrador y publica
 *      `colaboradores.registro.confirmado` en el bus (lo consume EQ-61 para el correo).
 *
 * La cartera es de otro módulo (esquema aspirantes), por eso no entra en la misma
 * transacción de BD: se usa compensación, como en una saga.
 */
import { randomBytes } from "node:crypto";
import { ErrorColaboradores } from "../dominio/errores.js";
import { validarIdInstitucional, validarSolicitudRegistro } from "../dominio/validaciones-registro.js";

export const EVENTO_REGISTRO_CONFIRMADO = "colaboradores.registro.confirmado";

export class ConfirmarRegistroCasoUso {
  /**
   * @param {Object} dependencias
   * @param {Object} dependencias.repositorioColaboradores
   * @param {import('./consultar-colaborador.caso-uso.js').ConsultarColaboradorCasoUso} dependencias.consultarColaborador
   * @param {Object} dependencias.cartera - moduloMonitoreo.cartera
   * @param {Object} dependencias.catalogo
   * @param {{ publicar(routingKey: string, evento: any): Promise<void> }} dependencias.bus
   * @param {{ eliminarBorrador?(id: string): void }} [dependencias.borradores]
   * @param {() => Date} [dependencias.reloj]
   * @param {(error: unknown) => void} [dependencias.registrarError]
   */
  constructor({ repositorioColaboradores, consultarColaborador, cartera, catalogo, bus, borradores, reloj, registrarError }) {
    this.repositorio = repositorioColaboradores;
    this.consultar = consultarColaborador;
    this.cartera = cartera;
    this.catalogo = catalogo;
    this.bus = bus;
    this.borradores = borradores;
    this.reloj = reloj ?? (() => new Date());
    this.registrarError = registrarError ?? ((error) => console.error("[colaboradores]", error));
  }

  /**
   * @param {{ idInstitucional: string, campus: string, carreras: string[] }} solicitud
   * @param {{ administradorId?: string|null }} [contexto]
   */
  async ejecutar(solicitud = {}, { administradorId = null } = {}) {
    const id = validarIdInstitucional(solicitud.idInstitucional);
    if (await this.repositorio.existe(id)) {
      throw new ErrorColaboradores(409, "YA_REGISTRADO", "Este colaborador ya está registrado.");
    }
    const { campus, carreras } = validarSolicitudRegistro(solicitud, this.catalogo);
    const perfil = await this.consultar.buscarEnDirectorio(id);
    const fechaConfirmacion = this.reloj().toISOString();

    let asignacion = null;
    let colaborador;
    try {
      colaborador = await this.repositorio.transaccion(async (tx) => {
        if (await tx.existe(id)) {
          throw new ErrorColaboradores(409, "YA_REGISTRADO", "Este colaborador ya está registrado.");
        }
        const guardado = await tx.guardar({
          idInstitucional: id,
          rol: "colaborador",
          estado: "activo",
          campus,
          carreras,
          fechaRegistro: fechaConfirmacion,
          registradoPor: administradorId,
        });

        asignacion = await this.cartera.asignarCarreras({ colaboradorId: id, campus, carreras });

        await tx.registrarTransferencias(
          (asignacion.transferencias ?? []).map((t) => ({
            aspiranteId: t.aspiranteId,
            colaboradorOrigen: t.colaboradorAnterior ?? null,
            colaboradorDestino: id,
            motivo: "alta",
            realizadoPor: administradorId,
            realizadoEn: fechaConfirmacion,
          }))
        );
        return guardado;
      });
    } catch (error) {
      if (asignacion) {
        try {
          await asignacion.deshacer();
        } catch (errorCompensacion) {
          this.registrarError(errorCompensacion);
        }
      }
      throw error;
    }

    // A partir de aquí el registro ya está confirmado: nada de esto lo revierte.
    try {
      this.borradores?.eliminarBorrador?.(id);
    } catch (error) {
      this.registrarError(error);
    }

    const evento = {
      eventId: `evt-reg-${randomBytes(6).toString("hex")}`,
      tipo: EVENTO_REGISTRO_CONFIRMADO,
      colaboradorId: id,
      nombreCompleto: perfil.nombreCompleto,
      correoInstitucional: perfil.correoInstitucional,
      campus,
      carrerasAsignadas: [...carreras],
      aspirantesAsignados: [...asignacion.aspirantesIds],
      registradoPor: administradorId,
      fechaConfirmacion,
    };
    try {
      await this.bus.publicar(EVENTO_REGISTRO_CONFIRMADO, evento);
    } catch (error) {
      this.registrarError(error);
    }

    return {
      confirmado: true,
      colaborador: {
        idInstitucional: id,
        nombreCompleto: perfil.nombreCompleto,
        correoInstitucional: perfil.correoInstitucional,
        telefono: perfil.telefono,
        campus,
        rol: colaborador.rol,
        activo: colaborador.estado === "activo",
        carrerasAsignadas: [...carreras],
      },
      asignacion: {
        campus,
        carreras: [...carreras],
        totalAspirantesAsignados: asignacion.aspirantesIds.length,
        aspirantesIds: [...asignacion.aspirantesIds],
      },
      evento,
    };
  }
}
