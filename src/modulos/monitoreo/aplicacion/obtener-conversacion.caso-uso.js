/**
 * Caso de Uso: Obtener Conversación del Aspirante por REST (HU3-5)
 *
 * Reglas de negocio:
 * 1. Requiere un colaborador autenticado (401 NO_AUTORIZADO si falta).
 * 2. El aspirante debe existir (404 NO_ENCONTRADO si no existe).
 * 3. El aspirante debe pertenecer a la cartera del colaborador autenticado (403 SIN_PERMISO si es ajeno).
 * 4. Devuelve la lista de mensajes ordenada por fecha ascendente (cronológicamente para el chat).
 */

export class ObtenerConversacionCasoUso {
  /**
   * @param {Object} dependencias
   * @param {import('../dominio/repositorio-monitoreo.js')} dependencias.repositorioMonitoreo
   */
  constructor({ repositorioMonitoreo }) {
    if (!repositorioMonitoreo) {
      throw new Error("Se requiere repositorioMonitoreo para inicializar ObtenerConversacionCasoUso.");
    }
    this.repositorio = repositorioMonitoreo;
  }

  /**
   * @param {Object} params
   * @param {string} params.colaboradorId - ID del colaborador autenticado.
   * @param {string} params.aspiranteId   - ID del aspirante solicitado.
   * @returns {Promise<{ aspiranteId: string, mensajes: Array, total: number }>}
   */
  async ejecutar({ colaboradorId, aspiranteId } = {}) {
    const colabLimpio = colaboradorId ? String(colaboradorId).trim() : "";
    if (!colabLimpio) {
      const error = new Error("Se requiere iniciar sesión para consultar la conversación del aspirante.");
      error.status = 401;
      error.codigo = "NO_AUTORIZADO";
      throw error;
    }

    const idLimpio = aspiranteId ? String(aspiranteId).trim() : "";
    if (!idLimpio) {
      const error = new Error("El identificador del aspirante es obligatorio.");
      error.status = 400;
      error.codigo = "PARAMETRO_INVALIDO";
      throw error;
    }

    const aspirante = await this.repositorio.obtenerAspirantePorId(idLimpio);
    if (!aspirante) {
      const error = new Error("No se encontró el aspirante solicitado.");
      error.status = 404;
      error.codigo = "NO_ENCONTRADO";
      throw error;
    }

    // Validar que el aspirante pertenezca a la cartera del colaborador autenticado
    const idsCartera = typeof this.repositorio._obtenerIdsColaborador === "function"
      ? this.repositorio._obtenerIdsColaborador(colabLimpio)
      : new Set([colabLimpio]);

    if (!idsCartera.has(aspirante.colaboradorId)) {
      const error = new Error("Este aspirante no pertenece a tu cartera.");
      error.status = 403;
      error.codigo = "SIN_PERMISO";
      throw error;
    }

    const mensajesRaw = await this.repositorio.obtenerConversacionAspirante(aspirante.id);

    // Orden cronológico ascendente (del más antiguo al más reciente, con desempate estable por id)
    const mensajes = [...(mensajesRaw || [])]
      .sort((a, b) => {
        const tA = new Date(a.fechaEnvio ?? a.fecha).getTime();
        const tB = new Date(b.fechaEnvio ?? b.fecha).getTime();
        if (tA !== tB) return tA - tB;
        return String(a.id).localeCompare(String(b.id));
      })
      .map((m) => ({
        id: m.id,
        aspiranteId: m.aspiranteId ?? aspirante.id,
        direccion: m.direccion,
        remitenteTipo: m.remitenteTipo,
        remitenteId: m.remitenteId ?? null,
        contenido: m.contenido,
        tipoContenido: m.tipoContenido ?? "TEXTO",
        estadoEntrega: m.estadoEntrega ?? "ENTREGADO",
        whatsappMessageId: m.whatsappMessageId ?? null,
        fechaEnvio: m.fechaEnvio ?? m.fecha,
        fecha: m.fechaEnvio ?? m.fecha,
      }));

    return {
      aspiranteId: aspirante.id,
      mensajes,
      total: mensajes.length,
    };
  }
}

