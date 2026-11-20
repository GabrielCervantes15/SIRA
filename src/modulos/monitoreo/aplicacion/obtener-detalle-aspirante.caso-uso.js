/**
 * Caso de Uso: Obtener el detalle de un aspirante de la cartera (HU3-3)
 *
 * Reglas: 401 si no hay colaborador autenticado, 404 si el aspirante no existe
 * y 403 si existe pero no es de la cartera del colaborador. El orden importa:
 * primero se revisa que exista y después a quién pertenece.
 */

function crearError(status, codigo, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  error.codigo = codigo;
  return error;
}

export class ObtenerDetalleAspiranteCasoUso {
  /**
   * @param {Object} dependencias
   * @param {import('../dominio/repositorio-monitoreo.js')} dependencias.repositorioMonitoreo
   */
  constructor({ repositorioMonitoreo }) {
    if (!repositorioMonitoreo) {
      throw new Error("Se requiere repositorioMonitoreo para inicializar ObtenerDetalleAspiranteCasoUso.");
    }
    this.repositorio = repositorioMonitoreo;
  }

  /**
   * @param {Object} params
   * @param {string} params.colaboradorId - Colaborador autenticado (siempre sale de la sesión).
   * @param {string} params.aspiranteId
   */
  async ejecutar({ colaboradorId, aspiranteId } = {}) {
    const colaborador = colaboradorId ? String(colaboradorId).trim() : "";
    if (!colaborador) {
      throw crearError(401, "NO_AUTORIZADO", "Inicia sesión para consultar el expediente.");
    }

    const id = aspiranteId ? String(aspiranteId).trim() : "";
    const aspirante = id ? await this.repositorio.obtenerAspirantePorId(id) : null;
    if (!aspirante) {
      throw crearError(404, "NO_ENCONTRADO", "Aspirante no encontrado.");
    }

    // El ID del colaborador puede tener alias en la semilla (ID institucional y colab-00X).
    const idsCartera =
      typeof this.repositorio._obtenerIdsColaborador === "function"
        ? this.repositorio._obtenerIdsColaborador(colaborador)
        : new Set([colaborador]);
    if (!idsCartera.has(aspirante.colaboradorId)) {
      throw crearError(403, "SIN_PERMISO", "Este aspirante no pertenece a tu cartera.");
    }

    // Solo lo que necesita el expediente: nunca se devuelve colaboradorId.
    return {
      aspirante: {
        id: aspirante.id,
        nombreCompleto: aspirante.nombreCompleto,
        carreraSolicitada: aspirante.carreraSolicitada,
        preparatoriaProcedencia: aspirante.preparatoriaProcedencia ?? null,
        estadoSolicitud: aspirante.estadoSolicitud,
        fechaSolicitud: aspirante.fechaSolicitud,
        telefono: aspirante.telefono ?? null,
        correo: aspirante.correo ?? null,
        semaforo: aspirante.semaforo,
      },
    };
  }
}