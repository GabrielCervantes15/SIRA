/**
 * Repositorio de Colaboradores en PostgreSQL (esquema `usuarios`, tablas de EQ-53):
 *   usuarios.usuario (id, id_directorio, rol, estado, campus_id, casos_especiales, created_at)
 *   usuarios.colaborador_carrera (usuario_id, carrera_id)
 *
 * Campus y carrera se guardan como ids de catálogo (SMALLINT). Como el catálogo
 * no es de este esquema, la traducción nombre ↔ id se inyecta con `catalogoIds`
 * (sin FKs entre esquemas, según BASE-5).
 *
 * `transaccion(fn)` usa un cliente dedicado del pool con BEGIN / COMMIT / ROLLBACK (EQ-59).
 */
import { ErrorColaboradores } from "../dominio/errores.js";

/**
 * @typedef {Object} CatalogoIds
 * @property {(campus: string) => number|Promise<number>} idCampus
 * @property {(id: number) => string|Promise<string>} nombreCampus
 * @property {(carrera: string) => number|Promise<number>} idCarrera
 * @property {(id: number) => string|Promise<string>} nombreCarrera
 */

const SELECT_COLABORADOR = `
  SELECT
    u.id,
    u.id_directorio AS "idInstitucional",
    u.rol,
    u.estado,
    u.campus_id AS "campusId",
    u.casos_especiales AS "casosEspeciales",
    u.created_at AS "fechaRegistro",
    COALESCE(array_agg(cc.carrera_id ORDER BY cc.carrera_id) FILTER (WHERE cc.carrera_id IS NOT NULL), '{}') AS "carrerasIds"
  FROM usuarios.usuario u
  LEFT JOIN usuarios.colaborador_carrera cc ON cc.usuario_id = u.id
`;

export class RepositorioColaboradoresPostgres {
  /**
   * @param {Object} dependencias
   * @param {{ query: Function, connect?: Function }} dependencias.db - Pool de `pg` (o un cliente ya dentro de una transacción).
   * @param {CatalogoIds} dependencias.catalogoIds
   * @param {boolean} [dependencias.enTransaccion] - Uso interno: `db` es un cliente con BEGIN abierto.
   */
  constructor({ db, catalogoIds, enTransaccion = false }) {
    if (!db || typeof db.query !== "function") {
      throw new Error("Se requiere un cliente o pool de PostgreSQL con método query(sql, params).");
    }
    if (!catalogoIds) throw new Error("Se requiere catalogoIds para traducir campus y carreras.");
    this.db = db;
    this.catalogoIds = catalogoIds;
    this.enTransaccion = enTransaccion;
  }

  async _mapear(fila) {
    return {
      idInstitucional: fila.idInstitucional,
      rol: fila.rol,
      estado: fila.estado,
      campus: fila.campusId == null ? null : await this.catalogoIds.nombreCampus(fila.campusId),
      carreras: await Promise.all((fila.carrerasIds ?? []).map((id) => this.catalogoIds.nombreCarrera(id))),
      casosEspeciales: fila.casosEspeciales === true,
      fechaRegistro: new Date(fila.fechaRegistro).toISOString(),
    };
  }

  async listar({ campus, incluirInactivos = false } = {}) {
    const campusId = campus ? await this.catalogoIds.idCampus(campus) : null;
    const { rows } = await this.db.query(
      `${SELECT_COLABORADOR}
      WHERE u.rol = 'colaborador'
        AND ($1::boolean OR u.estado = 'activo')
        AND ($2::smallint IS NULL OR u.campus_id = $2::smallint)
      GROUP BY u.id
      ORDER BY u.created_at, u.id_directorio;`,
      [Boolean(incluirInactivos), campusId]
    );
    return Promise.all(rows.map((fila) => this._mapear(fila)));
  }

  async obtenerPorId(idInstitucional) {
    const { rows } = await this.db.query(
      `${SELECT_COLABORADOR}
      WHERE u.id_directorio = $1
      GROUP BY u.id;`,
      [String(idInstitucional ?? "").trim()]
    );
    return rows[0] ? this._mapear(rows[0]) : null;
  }

  async existe(idInstitucional) {
    const { rows } = await this.db.query(
      "SELECT 1 FROM usuarios.usuario WHERE id_directorio = $1 AND estado <> 'borrador' LIMIT 1;",
      [String(idInstitucional ?? "").trim()]
    );
    return rows.length > 0;
  }

  /**
   * Activa o desactiva la recepción de expedientes de otros campus (HU6-11 / EQ-70).
   * La columna casos_especiales se agrega con la migración 06_casos_especiales_transferencias.sql.
   * @param {string} idInstitucional
   * @param {boolean} habilitado
   */
  async actualizarCasosEspeciales(idInstitucional, habilitado) {
    const id = String(idInstitucional ?? "").trim();
    const { rows } = await this.db.query(
      `UPDATE usuarios.usuario
       SET casos_especiales = $2, updated_at = now()
       WHERE id_directorio = $1 AND rol = 'colaborador'
       RETURNING id_directorio AS "idInstitucional";`,
      [id, habilitado === true]
    );
    return rows[0] ? this.obtenerPorId(id) : null;
  }

  async guardar(colaborador) {
    const campusId = colaborador.campus ? await this.catalogoIds.idCampus(colaborador.campus) : null;
    let usuarioId;
    try {
      // Si había un borrador con ese ID se convierte en el registro definitivo.
      const { rows } = await this.db.query(
        `INSERT INTO usuarios.usuario (id_directorio, rol, estado, campus_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id_directorio) DO UPDATE
           SET rol = EXCLUDED.rol, estado = EXCLUDED.estado, campus_id = EXCLUDED.campus_id, updated_at = now()
           WHERE usuarios.usuario.estado = 'borrador'
         RETURNING id;`,
        [colaborador.idInstitucional, colaborador.rol ?? "colaborador", colaborador.estado ?? "activo", campusId]
      );
      if (rows.length === 0) {
        throw new ErrorColaboradores(409, "YA_REGISTRADO", "Este colaborador ya está registrado.");
      }
      usuarioId = rows[0].id;
    } catch (error) {
      if (error?.code === "23505") {
        throw new ErrorColaboradores(409, "YA_REGISTRADO", "Este colaborador ya está registrado.");
      }
      throw error;
    }

    const carrerasIds = await Promise.all((colaborador.carreras ?? []).map((c) => this.catalogoIds.idCarrera(c)));
    if (carrerasIds.length > 0) {
      await this.db.query(
        `INSERT INTO usuarios.colaborador_carrera (usuario_id, carrera_id)
         SELECT $1, unnest($2::smallint[])
         ON CONFLICT DO NOTHING;`,
        [usuarioId, carrerasIds]
      );
    }
    return { ...colaborador, carreras: [...(colaborador.carreras ?? [])] };
  }

  /**
   * Inserta en usuarios.bitacora_transferencia. Los colaboradores se guardan por su
   * UUID interno (se resuelven por id_directorio dentro de la misma consulta).
   *
   * NOTA: en Tablas.sql de EQ-53 `aspirante_id` es BIGINT, pero los ids del esquema
   * aspirantes son VARCHAR(50) ("asp-001"). Para que esto funcione la columna debe ser
   * VARCHAR(50) (ver docs/contratos/colaboradores.md).
   *
   * @param {import('../dominio/repositorio-colaboradores.js').RegistroTransferencia[]} registros
   */
  async registrarTransferencias(registros = []) {
    if (registros.length === 0) return;
    await this.db.query(
      `INSERT INTO usuarios.bitacora_transferencia
         (aspirante_id, colaborador_origen, colaborador_destino, motivo, realizado_por)
       SELECT v.aspirante_id, origen.id, destino.id, v.motivo::usuarios.motivo_transferencia, autor.id
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
            AS v(aspirante_id, origen, destino, motivo, autor)
       LEFT JOIN usuarios.usuario origen ON origen.id_directorio = v.origen
       JOIN usuarios.usuario destino ON destino.id_directorio = v.destino
       JOIN usuarios.usuario autor ON autor.id_directorio = v.autor;`,
      [
        registros.map((r) => r.aspiranteId),
        registros.map((r) => r.colaboradorOrigen),
        registros.map((r) => r.colaboradorDestino),
        registros.map((r) => r.motivo),
        registros.map((r) => r.realizadoPor),
      ]
    );
  }

  /**
   * Registra una transferencia manual individual y verifica que la bitácora
   * haya insertado exactamente una fila. Este método es exclusivo de EQ-70:
   * no modifica el contrato usado por EQ-59 al confirmar altas.
   *
   * @param {import('../dominio/repositorio-colaboradores.js').RegistroTransferencia} registro
   */
  async registrarTransferenciaManual(registro) {
    const { rows } = await this.db.query(
      `INSERT INTO usuarios.bitacora_transferencia
         (aspirante_id, colaborador_origen, colaborador_destino, motivo, realizado_por)
       SELECT v.aspirante_id, origen.id, destino.id, v.motivo::usuarios.motivo_transferencia, autor.id
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
            AS v(aspirante_id, origen, destino, motivo, autor)
       LEFT JOIN usuarios.usuario origen ON origen.id_directorio = v.origen
       JOIN usuarios.usuario destino ON destino.id_directorio = v.destino
       JOIN usuarios.usuario autor ON autor.id_directorio = v.autor
       RETURNING aspirante_id;`,
      [
        [registro.aspiranteId],
        [registro.colaboradorOrigen],
        [registro.colaboradorDestino],
        [registro.motivo],
        [registro.realizadoPor],
      ]
    );
    if (rows.length !== 1) {
      throw new ErrorColaboradores(
        500,
        "BITACORA_INCOMPLETA",
        "No se pudo registrar la bitácora de la transferencia manual. Verifica que el colaborador destino y el administrador existan en usuarios.usuario."
      );
    }
  }

  /**
   * @template T
   * @param {(repositorio: RepositorioColaboradoresPostgres) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async transaccion(fn) {
    // Transacción anidada: la de afuera confirma o revierte.
    if (this.enTransaccion) return fn(this);
    if (typeof this.db.connect !== "function") {
      throw new Error("transaccion() requiere un pool de PostgreSQL con connect().");
    }
    const cliente = await this.db.connect();
    const enTransaccion = new RepositorioColaboradoresPostgres({
      db: cliente,
      catalogoIds: this.catalogoIds,
      enTransaccion: true,
    });
    try {
      await cliente.query("BEGIN");
      const resultado = await fn(enTransaccion);
      await cliente.query("COMMIT");
      return resultado;
    } catch (error) {
      await cliente.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      cliente.release?.();
    }
  }
}
