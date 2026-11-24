/**
 * Caso de Uso: Obtener el historial de actividades de un aspirante (HU3-6 / EQ-43)
 *
 * Reglas (en este orden):
 *   401 si no hay colaborador autenticado,
 *   404 si el aspirante no existe,
 *   403 si existe pero no es de la cartera del colaborador,
 *   400 si el rango de fechas es inválido (fecha mal formada o desde > hasta).
 *
 * El rango [desde, hasta] es opcional e inclusivo. Si `hasta` llega solo como
 * fecha (AAAA-MM-DD) se toma hasta el final de ese día (23:59:59.999 UTC).
 * El resultado sale del más reciente al más antiguo; con la misma fecha,
 * desempata por id descendente para que el orden sea estable.
 */

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function crearError(status, codigo, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  error.codigo = codigo;
  return error;
}

/**
 * Convierte un parámetro de fecha a milisegundos.
 * @param {string|null|undefined} valor
 * @param {boolean} finDeDia - Si es true y el valor es solo fecha, se toma el final del día.
 * @returns {number|null} null si no se envió; NaN si está mal formado.
 */
function aMilisegundos(valor, finDeDia) {
  const texto = valor == null ? "" : String(valor).trim();
  if (!texto) return null;
  if (SOLO_FECHA.test(texto)) {
    const base = Date.parse(`${texto}T00:00:00.000Z`);
    return finDeDia ? base + 86_399_999 : base;
  }
  return Date.parse(texto);
}

function fechaDe(evento) {
  return evento.fechaEvento ?? evento.fecha;
}

export class ObtenerHistorialAspiranteCasoUso {
  /**
   * @param {Object} dependencias
   * @param {Object} dependencias.repositorioMonitoreo - Implementación del puerto IRepositorioMonitoreo.
   */
  constructor({ repositorioMonitoreo }) {
    if (!repositorioMonitoreo) {
      throw new Error("Se requiere repositorioMonitoreo para inicializar ObtenerHistorialAspiranteCasoUso.");
    }
    this.repositorio = repositorioMonitoreo;
  }

  /**
   * @param {Object} params
   * @param {string} params.colaboradorId - Colaborador autenticado (siempre sale de la sesión).
   * @param {string} params.aspiranteId
   * @param {string} [params.desde] - Fecha ISO 8601 o AAAA-MM-DD (inclusiva).
   * @param {string} [params.hasta] - Fecha ISO 8601 o AAAA-MM-DD (inclusiva).
   * @returns {Promise<{ actividades: Array<{ id: string, tipo: string, fecha: string, texto: string }>, total: number }>}
   */
  async ejecutar({ colaboradorId, aspiranteId, desde, hasta } = {}) {
    const colaborador = colaboradorId ? String(colaboradorId).trim() : "";
    if (!colaborador) {
      throw crearError(401, "NO_AUTORIZADO", "Inicia sesión para consultar el historial.");
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

    const desdeMs = aMilisegundos(desde, false);
    const hastaMs = aMilisegundos(hasta, true);
    if (
      Number.isNaN(desdeMs) ||
      Number.isNaN(hastaMs) ||
      (desdeMs !== null && hastaMs !== null && desdeMs > hastaMs)
    ) {
      throw crearError(400, "PARAMETRO_INVALIDO", "Rango de fechas inválido.");
    }

    const eventos = await this.repositorio.obtenerHistorialAspirante(aspirante.id, {
      desde: desdeMs === null ? null : new Date(desdeMs).toISOString(),
      hasta: hastaMs === null ? null : new Date(hastaMs).toISOString(),
    });

    // Se vuelve a filtrar y ordenar aquí para que la regla no dependa del adaptador.
    const actividades = eventos
      .filter((evento) => {
        const fechaMs = Date.parse(fechaDe(evento));
        return (
          Number.isFinite(fechaMs) &&
          (desdeMs === null || fechaMs >= desdeMs) &&
          (hastaMs === null || fechaMs <= hastaMs)
        );
      })
      .sort(
        (a, b) =>
          Date.parse(fechaDe(b)) - Date.parse(fechaDe(a)) || String(b.id).localeCompare(String(a.id))
      )
      .map((evento) => ({
        id: evento.id,
        tipo: evento.tipoEvento ?? evento.tipo ?? "ACTIVIDAD",
        fecha: new Date(fechaDe(evento)).toISOString(),
        texto: [evento.titulo, evento.detalle].filter(Boolean).join(" — ") || "Actividad registrada",
      }));

    return { actividades, total: actividades.length };
  }
}
