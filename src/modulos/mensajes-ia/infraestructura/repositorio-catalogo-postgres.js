/**
 * Repositorio del catálogo en PostgreSQL (EQ-95, migración 05_catalogo_mensajes.sql).
 *
 *   mensajes.catalogo_mensaje   (un renglón por mensaje)
 *   mensajes.catalogo_variable  (variables del texto)
 *   mensajes.catalogo_llave     (llaves que se muestran en la lista)
 *   mensajes.catalogo_regla     (reglas de negocio, en orden)
 */
const SELECT_MENSAJE = `
  SELECT
    m.id, m.categoria, m.nombre, m.orden, m.grupo, m.pregunta, m.disparador, m.canal,
    m.requiere_plantilla_meta AS "requierePlantillaMeta",
    m.plantilla_meta_referencia AS "plantillaMetaReferencia",
    m.plantilla_meta_estado AS "plantillaMetaEstado",
    m.texto,
    COALESCE((SELECT array_agg(v.nombre ORDER BY v.orden) FROM mensajes.catalogo_variable v WHERE v.mensaje_id = m.id), '{}') AS variables,
    COALESCE((SELECT json_agg(json_build_object('tipo', l.tipo, 'valor', l.valor) ORDER BY l.orden)
              FROM mensajes.catalogo_llave l WHERE l.mensaje_id = m.id), '[]') AS llaves,
    COALESCE((SELECT array_agg(r.descripcion ORDER BY r.orden) FROM mensajes.catalogo_regla r WHERE r.mensaje_id = m.id), '{}') AS reglas
  FROM mensajes.catalogo_mensaje m
  WHERE m.activo
`;

function mapear(fila) {
  return {
    id: fila.id,
    categoria: fila.categoria,
    nombre: fila.nombre,
    orden: Number(fila.orden),
    grupo: fila.grupo ?? null,
    pregunta: fila.pregunta ?? null,
    disparador: fila.disparador,
    canal: fila.canal,
    requierePlantillaMeta: Boolean(fila.requierePlantillaMeta),
    plantillaMeta: fila.requierePlantillaMeta
      ? { referencia: fila.plantillaMetaReferencia, estado: fila.plantillaMetaEstado }
      : null,
    texto: fila.texto,
    variables: [...(fila.variables ?? [])],
    llaves: (typeof fila.llaves === "string" ? JSON.parse(fila.llaves) : fila.llaves) ?? [],
    reglas: [...(fila.reglas ?? [])],
  };
}

export class RepositorioCatalogoPostgres {
  /** @param {{ db: { query(sql: string, params?: any[]): Promise<{ rows: any[] }> } }} dependencias */
  constructor({ db }) {
    if (!db || typeof db.query !== "function") {
      throw new Error("Se requiere un cliente o pool de PostgreSQL con método query(sql, params).");
    }
    this.db = db;
  }

  async listar({ categoria } = {}) {
    const { rows } = await this.db.query(
      `${SELECT_MENSAJE} AND ($1::text IS NULL OR m.categoria = $1) ORDER BY m.categoria, m.orden;`,
      [categoria ?? null]
    );
    return rows.map(mapear);
  }

  async obtenerPorId(id) {
    const { rows } = await this.db.query(`${SELECT_MENSAJE} AND m.id = $1;`, [String(id)]);
    return rows[0] ? mapear(rows[0]) : null;
  }

  async contarPorCategoria() {
    const { rows } = await this.db.query(
      "SELECT categoria, COUNT(*)::int AS total FROM mensajes.catalogo_mensaje WHERE activo GROUP BY categoria;"
    );
    const conteo = { ENVIO: 0, RESPUESTA: 0 };
    for (const r of rows) conteo[r.categoria] = Number(r.total);
    return conteo;
  }
}
