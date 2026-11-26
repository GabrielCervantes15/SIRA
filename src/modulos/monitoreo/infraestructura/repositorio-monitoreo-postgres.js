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
        fecha_ultima_actividad AS "fechaUltimaActividad",
        fecha_ultima_notificacion AS "fechaUltimaNotificacion",
        veces_notificado AS "vecesNotificado"
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
   * Cartera de un colaborador agrupada por (campus, carrera) (HU6-18).
   * @param {string} colaboradorId
   */
  async carteraPorCarrera(colaboradorId) {
    const { rows } = await this.db.query(
      `
      SELECT campus, carrera_solicitada AS carrera, COUNT(*)::int AS aspirantes
      FROM aspirantes.aspirantes
      WHERE colaborador_id = $1
      GROUP BY campus, carrera_solicitada
      ORDER BY campus, carrera_solicitada;
    `,
      [String(colaboradorId).trim()]
    );
    return rows.map((r) => ({ campus: r.campus, carrera: r.carrera, aspirantes: Number(r.aspirantes) }));
  }

  /**
   * Pasa la cartera de `desde` a otros colaboradores por (campus, carrera) (HU6-18).
   * @param {{ desde: string, movimientos: Array<{ campus: string, carrera: string, hacia: string }> }} params
   */
  async reasignarCartera({ desde, movimientos }) {
    const origen = String(desde).trim();
    const { rows } = await this.db.query(
      `
      WITH mov AS (
        SELECT * FROM unnest($2::text[], $3::text[], $4::text[]) AS m(campus, carrera, hacia)
      ),
      previos AS (
        SELECT a.id, m.hacia
        FROM aspirantes.aspirantes a
        JOIN mov m ON a.campus = m.campus AND a.carrera_solicitada = m.carrera
        WHERE a.colaborador_id = $1
        FOR UPDATE OF a
      )
      UPDATE aspirantes.aspirantes a
      SET colaborador_id = p.hacia
      FROM previos p
      WHERE a.id = p.id
      RETURNING a.id AS "aspiranteId", p.hacia AS "colaboradorDestino";
    `,
      [origen, movimientos.map((m) => m.campus), movimientos.map((m) => m.carrera), movimientos.map((m) => String(m.hacia).trim())]
    );
    return {
      aspirantesIds: rows.map((r) => r.aspiranteId),
      transferencias: rows.map((r) => ({ aspiranteId: r.aspiranteId, colaboradorAnterior: origen, colaboradorDestino: r.colaboradorDestino })),
      deshacer: async () => {
        if (rows.length === 0) return;
        await this.db.query(
          'UPDATE aspirantes.aspirantes SET colaborador_id = $1 WHERE id = ANY($2::text[]);',
          [origen, rows.map((r) => r.aspiranteId)]
        );
      },
    };
  }

  /**
   * Transfiere un expediente individual a un colaborador autorizado para casos especiales.
   * La actualización y lectura del responsable anterior ocurren en una sola sentencia.
   * @param {{ aspiranteId: string, colaboradorDestino: string }} params
   */
  async transferirAspiranteManual({ aspiranteId, colaboradorDestino }) {
    const id = String(aspiranteId ?? "").trim();
    const destino = String(colaboradorDestino ?? "").trim();
    const { rows } = await this.db.query(
      `WITH previo AS MATERIALIZED (
         SELECT id, campus, nombre_completo, colaborador_id
         FROM aspirantes.aspirantes
         WHERE id = $1
         FOR UPDATE
       ), actualizado AS (
         UPDATE aspirantes.aspirantes AS a
         SET colaborador_id = $2, actualizado_en = CURRENT_TIMESTAMP
         FROM previo AS p
         WHERE a.id = p.id
           AND a.colaborador_id IS DISTINCT FROM $2
         RETURNING a.id
       )
       SELECT
         p.id AS "aspiranteId",
         p.campus,
         p.nombre_completo AS "nombreCompleto",
         p.colaborador_id AS "colaboradorAnterior",
         EXISTS (SELECT 1 FROM actualizado) AS transferido
       FROM previo AS p;`,
      [id, destino]
    );
    if (!rows[0]) return null;

    const fila = rows[0];
    const resultado = {
      aspiranteId: fila.aspiranteId,
      campus: fila.campus,
      nombreCompleto: fila.nombreCompleto ?? null,
      colaboradorAnterior: this.idInstitucionalDe(fila.colaboradorAnterior),
      colaboradorDestino: destino,
      transferido: fila.transferido === true,
    };

    return {
      ...resultado,
      deshacer: async () => {
        if (!resultado.transferido) return;
        await this.db.query(
          `UPDATE aspirantes.aspirantes
           SET colaborador_id = $2, actualizado_en = CURRENT_TIMESTAMP
           WHERE id = $1 AND colaborador_id = $3;`,
          [id, fila.colaboradorAnterior, destino]
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
        (aspirante_id, tipo_evento, titulo, detalle, motivo_rechazo, autor_tipo, autor_id, fecha_evento, metadatos)
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, CURRENT_TIMESTAMP), COALESCE($9::jsonb, '{}'::jsonb))
      RETURNING
        id,
        aspirante_id AS "aspiranteId",
        tipo_evento AS "tipoEvento",
        titulo,
        detalle,
        motivo_rechazo AS "motivoRechazo",
        autor_tipo AS "autorTipo",
        autor_id AS "autorId",
        fecha_evento AS "fechaEvento",
        metadatos;
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
      evento.metadatos ? JSON.stringify(evento.metadatos) : null,
    ]);
    return rows[0];
  }

  /**
   * Registra un envío exitoso (EQ-87): fecha de última notificación (la más reciente) y,
   * si `contar`, una notificación más. No toca fecha_ultima_actividad (EQ-77 §6.3).
   * @param {{ aspiranteId: string, fecha: string, contar?: boolean }} datos
   */
  async registrarNotificacion({ aspiranteId, fecha, contar = true }) {
    const { rows } = await this.db.query(
      `UPDATE aspirantes.aspirantes
          SET fecha_ultima_notificacion = GREATEST(COALESCE(fecha_ultima_notificacion, $2::timestamptz), $2::timestamptz),
              veces_notificado = veces_notificado + CASE WHEN $3 THEN 1 ELSE 0 END,
              actualizado_en = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING fecha_ultima_notificacion AS "fechaUltimaNotificacion", veces_notificado AS "vecesNotificado"`,
      [String(aspiranteId).trim(), fecha, Boolean(contar)],
    );
    return rows[0] || null;
  }

  /**
   * Agrega un mensaje a la conversación (HU3-5). El id debe ser UUID; un id repetido se ignora.
   * @returns {Promise<boolean>} true si se agregó
   */
  async registrarMensajeConversacion(mensaje) {
    if (!mensaje?.aspiranteId || !mensaje?.contenido) {
      throw new Error("registrarMensajeConversacion requiere aspiranteId y contenido.");
    }
    const { rowCount } = await this.db.query(
      `INSERT INTO aspirantes.conversaciones_mensajes
         (id, aspirante_id, direccion, remitente_tipo, remitente_id, contenido, tipo_contenido, estado_entrega,
          whatsapp_message_id, fecha_envio)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, CURRENT_TIMESTAMP))
       ON CONFLICT (id) DO NOTHING`,
      [mensaje.id ?? null, String(mensaje.aspiranteId).trim(), mensaje.direccion, mensaje.remitenteTipo,
        mensaje.remitenteId ?? null, mensaje.contenido, mensaje.tipoContenido ?? "TEXTO", mensaje.estadoEntrega ?? "ENVIADO",
        mensaje.whatsappMessageId ?? null, mensaje.fechaEnvio ?? null],
    );
    return rowCount > 0;
  }
}

