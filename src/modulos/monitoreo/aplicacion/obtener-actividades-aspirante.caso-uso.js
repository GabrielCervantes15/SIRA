/**
 * Caso de Uso: Obtener el historial de actividades de un aspirante (HU3-4)
 *
 * Reglas: 401 si no hay colaborador autenticado, 404 si el aspirante no existe,
 * 403 si no es de la cartera y 400 si el rango de fechas es inválido.
 * Las actividades salen de la más reciente a la más antigua; con la misma fecha
 * se desempata por id descendente para que el orden sea estable.
 */

function crearError(status, codigo, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  error.codigo = codigo;
  return error;
}

function fechaDe(actividad) {
  return actividad.fechaEvento ?? actividad.fecha;
}

function parsearFechaOpcional(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const ms = Date.parse(valor);
  if (Number.isNaN(ms)) {
    throw crearError(400, "PARAMETRO_INVALIDO", "Rango de fechas inválido.");
  }
  return ms;
}

export class ObtenerActividadesAspiranteCasoUso {
  /**
   * @param {Object} dependencias
   * @param {import('../dominio/repositorio-monitoreo.js')} dependencias.repositorioMonitoreo
   */
  constructor({ repositorioMonitoreo }) {
    if (!repositorioMonitoreo) {
      throw new Error("Se requiere repositorioMonitoreo para inicializar ObtenerActividadesAspiranteCasoUso.");
    }
    this.repositorio = repositorioMonitoreo;
  }

  /**
   * @param {Object} params
   * @param {string} params.colaboradorId - Colaborador autenticado (siempre sale de la sesión).
   * @param {string} params.aspiranteId
   * @param {string} [params.desde] - Instante ISO 8601, incluido.
   * @param {string} [params.hasta] - Instante ISO 8601, incluido.
   */
  async ejecutar({ colaboradorId, aspiranteId, desde, hasta } = {}) {
    const colaborador = colaboradorId ? String(colaboradorId).trim() : "";
    if (!colaborador) {
      throw crearError(401, "NO_AUTORIZADO", "Inicia sesión para consultar el expediente.");
    }

    const id = aspiranteId ? String(aspiranteId).trim() : "";
    const aspirante = id ? await this.repositorio.obtenerAspirantePorId(id) : null;
    if (!aspirante) {
      throw crearError(404, "NO_ENCONTRADO", "Aspirante no encontrado.");
    }

    const idsCartera =
      typeof this.repositorio._obtenerIdsColaborador === "function"
        ? this.repositorio._obtenerIdsColaborador(colaborador)
        : new Set([colaborador]);
    if (!idsCartera.has(aspirante.colaboradorId)) {
      throw crearError(403, "SIN_PERMISO", "Este aspirante no pertenece a tu cartera.");
    }

    const desdeMs = parsearFechaOpcional(desde);
    const hastaMs = parsearFechaOpcional(hasta);
    if (desdeMs !== null && hastaMs !== null && desdeMs > hastaMs) {
      throw crearError(400, "PARAMETRO_INVALIDO", "Rango de fechas inválido.");
    }

    const historial = await this.repositorio.obtenerActividadesPorAspiranteId(aspirante.id);

    const actividades = historial
      .filter((h) => {
        const ms = Date.parse(fechaDe(h));
        return Number.isFinite(ms) && (desdeMs === null || ms >= desdeMs) && (hastaMs === null || ms <= hastaMs);
      })
      .sort(
        (a, b) =>
          Date.parse(fechaDe(b)) - Date.parse(fechaDe(a)) || String(b.id).localeCompare(String(a.id)),
      )
      .map((h) => ({
        id: h.id,
        tipo: h.tipoEvento ?? h.tipo ?? "ACTIVIDAD",
        fecha: fechaDe(h),
        texto: [h.titulo, h.detalle].filter(Boolean).join(" — ") || "Actividad registrada",
      }));

    return { actividades };
  }
}