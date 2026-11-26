/**
 * Caso de uso EQ-70 / HU6-11: transferencia manual de un expediente entre campus.
 * El expediente permanece ligado a su historial y conversación porque solo cambia
 * aspirantes.aspirantes.colaborador_id. La bitácora se escribe en usuarios y, si falla,
 * se ejecuta la compensación del repositorio de Monitoreo.
 */
import { ErrorColaboradores } from "../dominio/errores.js";
import { validarIdInstitucional } from "../dominio/validaciones-registro.js";

function limpiarTexto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function campusIguales(a, b) {
  return limpiarTexto(a).localeCompare(limpiarTexto(b), "es", { sensitivity: "base" }) === 0;
}

export class TransferirAspiranteManualCasoUso {
  /**
   * @param {{ repositorioColaboradores: Object, cartera: Object, reloj?: Function }} dependencias
   */
  constructor({ repositorioColaboradores, cartera, reloj }) {
    this.repositorio = repositorioColaboradores;
    this.cartera = cartera;
    this.reloj = reloj || (() => new Date());
  }

  /**
   * @param {{ aspiranteId: unknown, colaboradorDestino: unknown }} solicitud
   * @param {{ administradorId: string|null }} contexto
   */
  async ejecutar(solicitud = {}, { administradorId } = {}) {
    const aspiranteId = limpiarTexto(solicitud.aspiranteId);
    if (!aspiranteId || aspiranteId.length > 50) {
      throw new ErrorColaboradores(
        400,
        "ASPIRANTE_ID_INVALIDO",
        "Indica un identificador de aspirante válido."
      );
    }

    const colaboradorDestino = validarIdInstitucional(solicitud.colaboradorDestino);
    const autor = limpiarTexto(administradorId);
    if (!autor) {
      throw new ErrorColaboradores(401, "NO_AUTORIZADO", "Se requiere una sesión administrativa para transferir expedientes.");
    }

    const destino = await this.repositorio.obtenerPorId(colaboradorDestino);
    if (!destino) {
      throw new ErrorColaboradores(404, "COLABORADOR_DESTINO_NO_ENCONTRADO", "No se encontró el colaborador destino.");
    }
    if (destino.estado !== "activo") {
      throw new ErrorColaboradores(409, "COLABORADOR_DESTINO_INACTIVO", "Solo se pueden transferir expedientes a colaboradores activos.");
    }
    if (destino.casosEspeciales !== true) {
      throw new ErrorColaboradores(409, "COLABORADOR_SIN_CASOS_ESPECIALES", "El colaborador destino no tiene habilitada la recepción de casos especiales.");
    }

    const aspirante = await this.cartera.obtenerAspirantePorId(aspiranteId);
    if (!aspirante) {
      throw new ErrorColaboradores(404, "ASPIRANTE_NO_ENCONTRADO", "No se encontró el expediente del aspirante.");
    }
    if (campusIguales(aspirante.campus, destino.campus)) {
      throw new ErrorColaboradores(422, "MISMO_CAMPUS", "La transferencia manual de casos especiales solo aplica entre campus diferentes.");
    }

    const movimiento = await this.cartera.transferirAspiranteManual({
      aspiranteId,
      colaboradorDestino,
    });
    if (!movimiento) {
      throw new ErrorColaboradores(404, "ASPIRANTE_NO_ENCONTRADO", "No se encontró el expediente del aspirante.");
    }
    if (!movimiento.transferido) {
      throw new ErrorColaboradores(409, "YA_ASIGNADO", "El aspirante ya está asignado al colaborador seleccionado.");
    }

    try {
      await this.repositorio.registrarTransferenciaManual({
        aspiranteId: movimiento.aspiranteId,
        colaboradorOrigen: movimiento.colaboradorAnterior,
        colaboradorDestino,
        motivo: "manual",
        realizadoPor: autor,
      });
    } catch (error) {
      try {
        await movimiento.deshacer();
      } catch (errorCompensacion) {
        throw new Error(
          `Falló la bitácora y también la reversión de la transferencia: ${errorCompensacion.message}`
        );
      }
      throw error;
    }

    const fecha = this.reloj();
    const fechaTransferencia = (fecha instanceof Date ? fecha : new Date(fecha)).toISOString();

    return {
      transferido: true,
      transferencia: {
        aspiranteId: movimiento.aspiranteId,
        nombreCompleto: movimiento.nombreCompleto,
        campusOrigen: movimiento.campus,
        colaboradorOrigen: movimiento.colaboradorAnterior,
        colaboradorDestino,
        campusDestino: destino.campus,
        motivo: "manual",
        realizadoPor: autor,
        fechaTransferencia,
      },
    };
  }
}
