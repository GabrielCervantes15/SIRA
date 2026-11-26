/**
 * Caso de Uso: confirmar la baja de un colaborador (HU6-18 / HU7)
 *
 *   1. Valida la duración (indefinida o periodo).
 *   2. Recalcula el plan con el estado ACTUAL (mismo algoritmo que la vista previa).
 *   3. Dentro de `repositorio.transaccion`: pasa la cartera (Monitoreo), marca al colaborador
 *      inactivo con su periodo, mueve sus carreras y deja la bitácora (motivo "inactivacion").
 *   4. Si algo falla, se revierte `usuarios` y se compensa la cartera con `deshacer()`.
 *   5. Ya confirmado, publica `colaboradores.baja.confirmada` (correos a los receptores).
 */
import { randomBytes } from "node:crypto";
import { ErrorColaboradores } from "../dominio/errores.js";
import { validarDuracionBaja } from "../dominio/validaciones-baja.js";
import { construirPlanBaja } from "./plan-baja.js";

export const EVENTO_BAJA_CONFIRMADA = "colaboradores.baja.confirmada";

export class ConfirmarBajaCasoUso {
  constructor({ repositorioColaboradores, cartera, proveedorAutenticacion, bus, reloj, registrarError }) {
    this.repositorio = repositorioColaboradores;
    this.cartera = cartera;
    this.proveedor = proveedorAutenticacion;
    this.bus = bus;
    this.reloj = reloj ?? (() => new Date());
    this.registrarError = registrarError ?? ((e) => console.error("[colaboradores]", e));
  }

  async _perfil(id) {
    try {
      return (await this.proveedor.obtenerPorIdInstitucional(id)) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * @param {{ idInstitucional: string, tipo: string, inicio?: string, fin?: string }} solicitud
   * @param {{ administradorId?: string|null }} [contexto]
   */
  async ejecutar(solicitud = {}, { administradorId = null } = {}) {
    const ahora = this.reloj();
    const fechaConfirmacion = ahora.toISOString();
    const duracion = validarDuracionBaja(solicitud, fechaConfirmacion.slice(0, 10));
    const { saliente, resultado } = await construirPlanBaja({
      repositorio: this.repositorio,
      cartera: this.cartera,
      idInstitucional: solicitud.idInstitucional,
    });
    const id = saliente.idInstitucional;

    const carrerasPorReceptor = {};
    for (const a of resultado.asignaciones) (carrerasPorReceptor[a.colaboradorId] ??= []).push(a.carrera);

    let movimiento = null;
    try {
      await this.repositorio.transaccion(async (tx) => {
        movimiento = await this.cartera.reasignarCartera({
          desde: id,
          movimientos: resultado.asignaciones.map((a) => ({ campus: a.campus, carrera: a.carrera, hacia: a.colaboradorId })),
        });
        const aplicada = await tx.aplicarBaja({ idInstitucional: id, desde: duracion.desde, hasta: duracion.hasta, carrerasPorReceptor });
        if (!aplicada) throw new ErrorColaboradores(409, "YA_INACTIVO", "Este colaborador ya está inactivo.");
        await tx.registrarTransferencias(
          movimiento.transferencias.map((t) => ({
            aspiranteId: t.aspiranteId,
            colaboradorOrigen: id,
            colaboradorDestino: t.colaboradorDestino,
            motivo: "inactivacion",
            realizadoPor: administradorId,
            realizadoEn: fechaConfirmacion,
          }))
        );
      });
    } catch (error) {
      if (movimiento) {
        try {
          await movimiento.deshacer();
        } catch (errorCompensacion) {
          this.registrarError(errorCompensacion);
        }
      }
      throw error;
    }

    const perfiles = new Map(
      await Promise.all([id, ...resultado.receptores.map((r) => r.colaboradorId)].map(async (c) => [c, await this._perfil(c)]))
    );
    const receptores = resultado.receptores.map((r) => ({
      colaboradorId: r.colaboradorId,
      nombreCompleto: perfiles.get(r.colaboradorId)?.nombreCompleto ?? null,
      correoInstitucional: perfiles.get(r.colaboradorId)?.correoInstitucional ?? null,
      aspirantesRecibidos: r.nuevosAspirantes,
      carrerasRecibidas: r.carreras,
    }));

    const evento = {
      eventId: `evt-baja-${randomBytes(6).toString("hex")}`,
      tipo: EVENTO_BAJA_CONFIRMADA,
      colaboradorId: id,
      nombreCompleto: perfiles.get(id)?.nombreCompleto ?? null,
      correoInstitucional: perfiles.get(id)?.correoInstitucional ?? null,
      campus: saliente.campus,
      baja: duracion,
      receptores,
      realizadoPor: administradorId,
      fechaConfirmacion,
    };
    try {
      await this.bus.publicar(EVENTO_BAJA_CONFIRMADA, evento);
    } catch (error) {
      this.registrarError(error);
    }

    return {
      confirmado: true,
      colaborador: { idInstitucional: id, nombreCompleto: evento.nombreCompleto, campus: saliente.campus, activo: false, periodoBaja: duracion },
      reasignacion: { totalAspirantes: resultado.totalAspirantes, receptores },
      evento,
    };
  }
}
