/**
 * Adaptador de Infraestructura PostgreSQL para el Repositorio de Monitoreo.
 * Implementa el puerto IRepositorioMonitoreo con consultas SQL parametrizadas
 * sobre el esquema `aspirantes` (HU2-4, HU2-7, HU3-5).
 */

export class RepositorioMonitoreoPostgres {
  /**
   * @param {Object} dependencias
   * @param {{ query: (sql: string, params?: Array) => Promise<{ rows: Array }> }} dependencias.db - Pool o cliente de PostgreSQL (pg).
   */
  constructor({ db }) {
    if (!db || typeof db.query !== "function") {
      throw new Error("Se requiere un cliente o pool de PostgreSQL con método query(sql, params).");
    }
    this.db = db;
  }

  /**
   * Obtiene un aspirante por su ID o folio institucional (HU3-5).
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async obtenerAspirantePorId(id) {
    const sql = `
      SELECT
        id,
        folio_solicitud AS "folioSolicitud",
        nombre_completo AS "nombreCompleto",
        correo,
        telefono,
        campus,
        carrera_solicitada AS "carreraSolicitada",
        preparatoria_procedencia AS "preparatoriaProcedencia",
        periodo,
        fecha_solicitud AS "fechaSolicitud",
        estado_solicitud AS "estadoSolicitud",
        semaforo,
        colaborador_id AS "colaboradorId",
        fecha_ultima_actividad AS "fechaUltimaActividad"
      FROM aspirantes.aspirantes
      WHERE id = $1 OR folio_solicitud = $1
      LIMIT 1;
    `;
    const { rows } = await this.db.query(sql, [String(id).trim()]);
    return rows[0] || null;
  }

  /**
   * Obtiene los mensajes de conversación de un aspirante ordenados por fecha ascendente (HU3-5).
   * Aprovecha el índice compuesto `idx_conversacion_aspirante_fecha` sobre (aspirante_id, fecha_envio ASC).
   *
   * @param {string} aspiranteId
   * @returns {Promise<Array>}
   */
  async obtenerConversacionAspirante(aspiranteId) {
    const sql = `
      SELECT
        id,
        aspirante_id AS "aspiranteId",
        direccion,
        remitente_tipo AS "remitenteTipo",
        remitente_id AS "remitenteId",
        contenido,
        tipo_contenido AS "tipoContenido",
        estado_entrega AS "estadoEntrega",
        whatsapp_message_id AS "whatsappMessageId",
        fecha_envio AS "fechaEnvio"
      FROM aspirantes.conversaciones_mensajes
      WHERE aspirante_id = $1
      ORDER BY fecha_envio ASC, id ASC;
    `;
    const { rows } = await this.db.query(sql, [String(aspiranteId).trim()]);
    return rows;
  }
}

