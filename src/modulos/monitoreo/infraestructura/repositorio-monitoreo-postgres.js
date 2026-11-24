/**
 * Adaptador de Infraestructura PostgreSQL para el Repositorio de Monitoreo.
 * Implementa el puerto IRepositorioMonitoreo con consultas SQL parametrizadas
 * sobre el esquema `aspirantes` (HU2-4, HU2-7, HU3-5, HU3-6).
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

  /**
   * Obtiene el historial de un aspirante, del más reciente al más antiguo (HU3-6 / EQ-43).
   * El rango es opcional e inclusivo; un parámetro NULL deja ese extremo abierto.
   *
   * @param {string} aspiranteId
   * @param {{ desde?: string|null, hasta?: string|null }} [rango]
   * @returns {Promise<Array>}
   */
  async obtenerHistorialAspirante(aspiranteId, { desde = null, hasta = null } = {}) {
    const sql = `
      SELECT
        id,
        aspirante_id AS "aspiranteId",
        tipo_evento AS "tipoEvento",
        titulo,
        detalle,
        motivo_rechazo AS "motivoRechazo",
        autor_tipo AS "autorTipo",
        autor_id AS "autorId",
        fecha_evento AS "fechaEvento"
      FROM aspirantes.historial_eventos
      WHERE aspirante_id = $1
        AND ($2::timestamptz IS NULL OR fecha_evento >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR fecha_evento <= $3::timestamptz)
      ORDER BY fecha_evento DESC, id DESC;
    `;
    const { rows } = await this.db.query(sql, [String(aspiranteId).trim(), desde, hasta]);
    return rows;
  }

  /**
   * ID canónico del colaborador. En PostgreSQL ya se guarda el ID institucional.
   * @param {string|null} colaboradorId
   */
  idInstitucionalDe(colaboradorId) {
    return colaboradorId == null || colaboradorId === "" ? null : String(colaboradorId).trim();
  }

  /**
   * Aspirantes en cartera por colaborador (HU6-12 / EQ-71).
   * @returns {Promise<Record<string, number>>}
   */
  async contarAspirantesPorColaborador() {
    const { rows } = await this.db.query(`
      SELECT colaborador_id AS "colaboradorId", COUNT(*)::int AS total
      FROM aspirantes.aspirantes
      WHERE colaborador_id IS NOT NULL
      GROUP BY colaborador_id;
    `);
    return Object.fromEntries(rows.map((r) => [r.colaboradorId, Number(r.total)]));
  }

  /**
   * Aspirantes que cambiarían de responsable (sin modificar nada) (HU6-17 / EQ-64).
   * @param {{ campus: string, carreras: string[] }} params
   */
  async previsualizarAsignacion({ campus, carreras }) {
    const { rows } = await this.db.query(
      `
      SELECT id AS "aspiranteId", carrera_solicitada AS carrera, colaborador_id AS "colaboradorActual"
      FROM aspirantes.aspirantes
      WHERE campus = $1 AND carrera_solicitada = ANY($2::text[])
      ORDER BY id;
    `,
      [campus, carreras]
    );
    return rows;
  }

  /**
   * Reasigna los aspirantes del campus/carreras al colaborador y devuelve `deshacer()`
   * para la compensación si la confirmación falla (HU6-9 / EQ-59).
   * @param {{ colaboradorId: string, campus: string, carreras: string[] }} params
   */
  async reasignarAspirantes({ colaboradorId, campus, carreras }) {
    const { rows } = await this.db.query(
      `
      WITH previos AS (
        SELECT id, colaborador_id
        FROM aspirantes.aspirantes
        WHERE campus = $2 AND carrera_solicitada = ANY($3::text[])
        FOR UPDATE
      )
      UPDATE aspirantes.aspirantes a
      SET colaborador_id = $1
      FROM previos
      WHERE a.id = previos.id
      RETURNING a.id AS "aspiranteId", previos.colaborador_id AS "colaboradorAnterior";
    `,
      [String(colaboradorId).trim(), campus, carreras]
    );
    return {
      aspirantesIds: rows.map((r) => r.aspiranteId),
      transferencias: rows.map((r) => ({ aspiranteId: r.aspiranteId, colaboradorAnterior: r.colaboradorAnterior })),
      deshacer: async () => {
        if (rows.length === 0) return;
        await this.db.query(
          `
          UPDATE aspirantes.aspirantes a
          SET colaborador_id = v.colaborador_id
          FROM unnest($1::text[], $2::text[]) AS v(id, colaborador_id)
          WHERE a.id = v.id;
        `,
          [rows.map((r) => r.aspiranteId), rows.map((r) => r.colaboradorAnterior)]
        );
      },
    };
  }

  /**
   * Inserta un evento en aspirantes.historial_eventos (EQ-43). El id lo genera la BD.
   *
   * @param {Object} evento
   * @returns {Promise<Object>}
   */
  async registrarActividad(evento) {
    if (!evento?.aspiranteId || !evento?.tipoEvento || !evento?.titulo) {
      throw new Error("registrarActividad requiere aspiranteId, tipoEvento y titulo.");
    }
    const sql = `
      INSERT INTO aspirantes.historial_eventos
        (aspirante_id, tipo_evento, titulo, detalle, motivo_rechazo, autor_tipo, autor_id, fecha_evento)
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, CURRENT_TIMESTAMP))
      RETURNING
        id,
        aspirante_id AS "aspiranteId",
        tipo_evento AS "tipoEvento",
        titulo,
        detalle,
        motivo_rechazo AS "motivoRechazo",
        autor_tipo AS "autorTipo",
        autor_id AS "autorId",
        fecha_evento AS "fechaEvento";
    `;
    const { rows } = await this.db.query(sql, [
      String(evento.aspiranteId).trim(),
      evento.tipoEvento,
      evento.titulo,
      evento.detalle ?? null,
      evento.motivoRechazo ?? null,
      evento.autorTipo ?? "SISTEMA",
      evento.autorId ?? null,
      evento.fechaEvento ?? null,
    ]);
    return rows[0];
  }
}

