/**
 * HU1-7 (EQ-83) · Repositorio de lotes en PostgreSQL (esquema `disparo`, migración 07).
 *
 * `transaccion(fn)` usa un cliente dedicado del pool con BEGIN / COMMIT / ROLLBACK.
 * `bloquearColaborador` toma pg_advisory_xact_lock para que dos peticiones del mismo
 * colaborador no creen dos lotes a la vez; el bloqueo se suelta al terminar la transacción.
 */
const COLUMNAS_LOTE = `
  id, colaborador_id AS "colaboradorId", clave_idempotencia AS "claveIdempotencia", huella,
  filtros, enviar_por_correo AS "enviarPorCorreo", estado, total_aspirantes AS "totalAspirantes",
  total_envios_pendientes AS "totalEnviosPendientes", creado_en AS "creadoEn"`;

const COLUMNAS_ENVIO = `
  id, lote_id AS "loteId", aspirante_id AS "aspiranteId", canal, estado, mensaje_id AS "mensajeId",
  destino, texto, motivo, codigo_motivo AS "codigoMotivo", faltantes, publicado_en AS "publicadoEn",
  reclamado_hasta AS "reclamadoHasta"`;

const iso = (valor) => (valor == null ? null : new Date(valor).toISOString());

function aLote(fila) {
  return {
    ...fila,
    huella: String(fila.huella).trim(),
    totalAspirantes: Number(fila.totalAspirantes),
    totalEnviosPendientes: Number(fila.totalEnviosPendientes),
    creadoEn: iso(fila.creadoEn),
  };
}

const aEnvio = (fila) => ({
  ...fila, faltantes: [...(fila.faltantes ?? [])], publicadoEn: iso(fila.publicadoEn), reclamadoHasta: iso(fila.reclamadoHasta),
});

export class RepositorioLotesPostgres {
  /**
   * @param {{ db: { query: Function, connect?: Function }, enTransaccion?: boolean }} opciones
   */
  constructor({ db, enTransaccion = false }) {
    if (!db?.query) throw new Error("RepositorioLotesPostgres requiere un pool o cliente de PostgreSQL.");
    this.db = db;
    this.enTransaccion = enTransaccion;
  }

  async transaccion(fn) {
    if (this.enTransaccion) return fn(this);
    if (typeof this.db.connect !== "function") throw new Error("transaccion() requiere un pool de PostgreSQL con connect().");
    const cliente = await this.db.connect();
    const repo = new RepositorioLotesPostgres({ db: cliente, enTransaccion: true });
    try {
      await cliente.query("BEGIN");
      const resultado = await fn(repo);
      await cliente.query("COMMIT");
      return resultado;
    } catch (error) {
      await cliente.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      cliente.release?.();
    }
  }

  async bloquearColaborador(colaboradorId) {
    await this.db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`disparo.lote:${colaboradorId}`]);
  }

  async _conEnvios(filaLote) {
    if (!filaLote) return null;
    const { rows } = await this.db.query(
      `SELECT ${COLUMNAS_ENVIO} FROM disparo.envio WHERE lote_id = $1 ORDER BY aspirante_id, canal`,
      [filaLote.id],
    );
    return { lote: aLote(filaLote), envios: rows.map(aEnvio) };
  }

  async buscarPorClave(colaboradorId, clave) {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNAS_LOTE} FROM disparo.lote WHERE colaborador_id = $1 AND clave_idempotencia = $2`,
      [String(colaboradorId), clave],
    );
    return this._conEnvios(rows[0]);
  }

  async buscarRecientePorHuella(colaboradorId, huella, desdeIso) {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNAS_LOTE} FROM disparo.lote
        WHERE colaborador_id = $1 AND huella = $2 AND creado_en >= $3
        ORDER BY creado_en DESC LIMIT 1`,
      [String(colaboradorId), huella, desdeIso],
    );
    return this._conEnvios(rows[0]);
  }

  async guardarLote({ lote, envios }) {
    await this.db.query(
      `INSERT INTO disparo.lote (id, colaborador_id, clave_idempotencia, huella, filtros, enviar_por_correo,
         estado, total_aspirantes, total_envios_pendientes, creado_en)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)`,
      [lote.id, lote.colaboradorId, lote.claveIdempotencia, lote.huella, JSON.stringify(lote.filtros),
        lote.enviarPorCorreo, lote.estado, lote.totalAspirantes, lote.totalEnviosPendientes, lote.creadoEn],
    );
    for (const e of envios) {
      await this.db.query(
        `INSERT INTO disparo.envio (id, lote_id, aspirante_id, canal, estado, mensaje_id, destino, texto,
           motivo, codigo_motivo, faltantes, publicado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [e.id, e.loteId, e.aspiranteId, e.canal, e.estado, e.mensajeId, e.destino, e.texto,
          e.motivo, e.codigoMotivo, e.faltantes ?? [], e.publicadoEn],
      );
    }
  }

  async reclamarPendientes(loteId, ahoraIso, hastaIso) {
    const { rows } = await this.db.query(
      `UPDATE disparo.envio SET reclamado_hasta = $3
        WHERE lote_id = $1 AND estado = 'PENDIENTE' AND publicado_en IS NULL
          AND (reclamado_hasta IS NULL OR reclamado_hasta < $2)
        RETURNING ${COLUMNAS_ENVIO}`,
      [loteId, ahoraIso, hastaIso],
    );
    return rows.map(aEnvio);
  }

  async liberarReclamo(envioIds) {
    if (envioIds.length === 0) return;
    await this.db.query(
      "UPDATE disparo.envio SET reclamado_hasta = NULL WHERE id = ANY($1::uuid[]) AND publicado_en IS NULL",
      [envioIds],
    );
  }

  async marcarPublicados(envioIds, fechaIso) {
    if (envioIds.length === 0) return;
    await this.db.query(
      "UPDATE disparo.envio SET publicado_en = $2 WHERE id = ANY($1::uuid[]) AND publicado_en IS NULL",
      [envioIds, fechaIso],
    );
  }

  async obtenerLote(loteId) {
    const { rows } = await this.db.query(`SELECT ${COLUMNAS_LOTE} FROM disparo.lote WHERE id = $1`, [loteId]);
    return this._conEnvios(rows[0]);
  }
}
