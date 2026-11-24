/**
 * Adaptador de Infraestructura PostgreSQL: Repositorio de Configuración de Mensajes
 * Tareas: EQ-104 (HU9-3), EQ-107 (HU9-6) y EQ-108 (HU9-7: Bitácora transaccional)
 *
 * Implementa el puerto IRepositorioConfiguracionMensajes sobre el esquema `mensajes`
 * garantizando atomicidad entre el guardado de parámetros, jornada y registro en
 * `mensajes.configuracion_bitacora` mediante una transacción única (BEGIN ... COMMIT / ROLLBACK).
 */
import { randomUUID } from "node:crypto";
import {
  DIAS_SEMANA,
  ORDEN_DIAS_SEMANA,
  crearConfiguracionInicial,
  clonarConfiguracion,
  clonarRegistroBitacora,
} from "../dominio/repositorio-configuracion.js";
import { validarConfiguracionMensajes } from "../dominio/validador-configuracion.js";

export class RepositorioConfiguracionPostgres {
  /**
   * @param {Object} dependencias
   * @param {{ query: Function, connect?: Function }} dependencias.db - Pool o cliente de PostgreSQL.
   * @param {() => string} [dependencias.generarId]
   */
  constructor({ db, generarId = randomUUID }) {
    if (!db || typeof db.query !== "function") {
      throw new Error(
        "Se requiere un cliente o pool de PostgreSQL con método query(sql, params)."
      );
    }
    this.db = db;
    this.generarId = generarId;
  }

  /**
   * Construye el objeto de configuración a partir de las filas de parámetros y jornada.
   * @private
   */
  _mapearConfiguracionDesdeFilas(filasParametros, filasJornada) {
    if (!filasParametros || filasParametros.length === 0) {
      return crearConfiguracionInicial();
    }

    const filaParams = filasParametros[0];
    const base = crearConfiguracionInicial();
    const jornada = { ...base.jornada };

    for (const filaDia of filasJornada || []) {
      const dia = filaDia.diaSemana;
      if (DIAS_SEMANA.includes(dia)) {
        const habilitado = Boolean(filaDia.habilitado);
        jornada[dia] = {
          habilitado,
          horaInicio: habilitado ? filaDia.horaInicio : null,
          horaFin: habilitado ? filaDia.horaFin : null,
        };
      }
    }

    return clonarConfiguracion({
      zonaHoraria: filaParams.zonaHoraria,
      jornada,
      tiempoMaximoEsperaRespuesta: {
        valor: Number(filaParams.esperaRespuestaValor),
        unidad: filaParams.esperaRespuestaUnidad,
      },
      tiempoEsperaContactoPrevio: {
        valor: Number(filaParams.esperaContactoPrevioValor),
        unidad: filaParams.esperaContactoPrevioUnidad,
      },
      actualizadoEn:
        filaParams.actualizadoEn instanceof Date
          ? filaParams.actualizadoEn.toISOString()
          : filaParams.actualizadoEn ?? null,
      actualizadoPor: filaParams.actualizadoPor ?? null,
    });
  }

  /**
   * Consulta la configuración vigente usando el ejecutor SQL dado (pool o cliente transaccional).
   * @private
   */
  async _consultarConfiguracionConCliente(ejecutor) {
    const sqlParametros = `
      SELECT
        zona_horaria AS "zonaHoraria",
        espera_respuesta_valor AS "esperaRespuestaValor",
        espera_respuesta_unidad AS "esperaRespuestaUnidad",
        espera_contacto_previo_valor AS "esperaContactoPrevioValor",
        espera_contacto_previo_unidad AS "esperaContactoPrevioUnidad",
        actualizado_en AS "actualizadoEn",
        actualizado_por AS "actualizadoPor"
      FROM mensajes.configuracion_parametros
      WHERE id = 1
      LIMIT 1;
    `;

    const sqlJornada = `
      SELECT
        dia_semana AS "diaSemana",
        orden_dia AS "ordenDia",
        habilitado,
        hora_inicio AS "horaInicio",
        hora_fin AS "horaFin"
      FROM mensajes.configuracion_jornada
      ORDER BY orden_dia ASC;
    `;

    const resParams = await ejecutor.query(sqlParametros, []);
    const resJornada = await ejecutor.query(sqlJornada, []);
    return this._mapearConfiguracionDesdeFilas(resParams?.rows, resJornada?.rows);
  }

  /**
   * Consulta la configuración vigente en `mensajes.configuracion_parametros`
   * y `mensajes.configuracion_jornada`. Si aún no existen registros, retorna los valores iniciales.
   *
   * @returns {Promise<Object>}
   */
  async obtenerConfiguracion() {
    return this._consultarConfiguracionConCliente(this.db);
  }

  /**
   * Persiste la configuración completa y su entrada en `mensajes.configuracion_bitacora`
   * en una única transacción PostgreSQL (BEGIN ... COMMIT / ROLLBACK).
   * Si cualquier sentencia (incluida la inserción en bitácora) falla, se ejecuta ROLLBACK.
   *
   * @param {Object} nuevaConfiguracion
   * @param {Object} [opcionesBitacora]
   * @param {string} [opcionesBitacora.bitacoraId]
   * @param {string} [opcionesBitacora.usuarioId]
   * @param {string} [opcionesBitacora.fechaCambio]
   * @param {Object} [opcionesBitacora.valorAnterior]
   * @param {boolean} [opcionesBitacora.omitirBitacoraInterna]
   * @returns {Promise<Object>}
   */
  async guardarConfiguracion(nuevaConfiguracion, opcionesBitacora = {}) {
    const validacion = validarConfiguracionMensajes(nuevaConfiguracion);
    if (!validacion.valido) {
      const error = new Error("La configuración proporcionada no es válida.");
      error.status = 400;
      error.codigo = "CONFIGURACION_INVALIDA";
      error.errores = validacion.errores;
      throw error;
    }

    const normalizada = validacion.configuracionNormalizada;
    const actualizadoEn =
      opcionesBitacora.fechaCambio ||
      nuevaConfiguracion.actualizadoEn ||
      new Date().toISOString();
    const actualizadoPor =
      nuevaConfiguracion.actualizadoPor ?? opcionesBitacora.usuarioId ?? null;
    const usuarioBitacora = String(
      opcionesBitacora.usuarioId || actualizadoPor || "SISTEMA"
    );
    const bitacoraId =
      opcionesBitacora.bitacoraId ||
      nuevaConfiguracion.bitacoraId ||
      this.generarId();

    const cliente =
      typeof this.db.connect === "function" ? await this.db.connect() : this.db;

    try {
      await cliente.query("BEGIN");

      // 1. Resolver instantánea previa dentro de la transacción si no fue provista
      const valorAnterior = opcionesBitacora.valorAnterior
        ? clonarConfiguracion(opcionesBitacora.valorAnterior)
        : await this._consultarConfiguracionConCliente(cliente);

      // 2. Actualizar parámetros globales
      const sqlUpsertParametros = `
        INSERT INTO mensajes.configuracion_parametros (
          id,
          zona_horaria,
          espera_respuesta_valor,
          espera_respuesta_unidad,
          espera_contacto_previo_valor,
          espera_contacto_previo_unidad,
          actualizado_en,
          actualizado_por
        ) VALUES (1, $1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          zona_horaria = EXCLUDED.zona_horaria,
          espera_respuesta_valor = EXCLUDED.espera_respuesta_valor,
          espera_respuesta_unidad = EXCLUDED.espera_respuesta_unidad,
          espera_contacto_previo_valor = EXCLUDED.espera_contacto_previo_valor,
          espera_contacto_previo_unidad = EXCLUDED.espera_contacto_previo_unidad,
          actualizado_en = EXCLUDED.actualizado_en,
          actualizado_por = EXCLUDED.actualizado_por;
      `;

      await cliente.query(sqlUpsertParametros, [
        normalizada.zonaHoraria,
        normalizada.tiempoMaximoEsperaRespuesta.valor,
        normalizada.tiempoMaximoEsperaRespuesta.unidad,
        normalizada.tiempoEsperaContactoPrevio.valor,
        normalizada.tiempoEsperaContactoPrevio.unidad,
        actualizadoEn,
        actualizadoPor,
      ]);

      // 3. Actualizar jornada de los 7 días
      const sqlUpsertJornada = `
        INSERT INTO mensajes.configuracion_jornada (
          dia_semana,
          orden_dia,
          habilitado,
          hora_inicio,
          hora_fin
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (dia_semana) DO UPDATE SET
          orden_dia = EXCLUDED.orden_dia,
          habilitado = EXCLUDED.habilitado,
          hora_inicio = EXCLUDED.hora_inicio,
          hora_fin = EXCLUDED.hora_fin;
      `;

      for (const dia of DIAS_SEMANA) {
        const configDia = normalizada.jornada[dia];
        await cliente.query(sqlUpsertJornada, [
          dia,
          ORDEN_DIAS_SEMANA[dia],
          configDia.habilitado,
          configDia.horaInicio,
          configDia.horaFin,
        ]);
      }

      const valorNuevo = clonarConfiguracion({
        ...normalizada,
        actualizadoEn,
        actualizadoPor,
      });

      // 4. Insertar registro en bitácora dentro de la MISMA transacción (EQ-108 / HU9-7)
      if (!opcionesBitacora.omitirBitacoraInterna) {
        const sqlInsertBitacora = `
          INSERT INTO mensajes.configuracion_bitacora (
            id,
            usuario_id,
            fecha_cambio,
            valor_anterior,
            valor_nuevo
          ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb);
        `;

        await cliente.query(sqlInsertBitacora, [
          bitacoraId,
          usuarioBitacora,
          actualizadoEn,
          JSON.stringify(valorAnterior),
          JSON.stringify(valorNuevo),
        ]);
      }

      await cliente.query("COMMIT");

      this.ultimoCambioBitacora = {
        bitacoraId,
        usuarioId: usuarioBitacora,
        fechaCambio: actualizadoEn,
        valorAnterior: clonarConfiguracion(valorAnterior),
        valorNuevo: clonarConfiguracion(valorNuevo),
      };

      return valorNuevo;
    } catch (error) {
      try {
        await cliente.query("ROLLBACK");
      } catch {
        // Ignorar error secundario en rollback
      }
      throw error;
    } finally {
      if (cliente !== this.db && typeof cliente.release === "function") {
        cliente.release();
      }
    }
  }

  /**
   * Consulta las entradas de `mensajes.configuracion_bitacora` ordenadas del cambio más reciente al más antiguo.
   *
   * @param {{ limite?: number, offset?: number }} [opciones]
   * @returns {Promise<{ registros: Array, total: number, limite: number, offset: number }>}
   */
  async listarBitacora({ limite = 50, offset = 0 } = {}) {
    const limNum = parseInt(limite, 10);
    const lim = Number.isFinite(limNum) && limNum > 0 ? Math.min(limNum, 200) : 50;

    const offNum = parseInt(offset, 10);
    const off = Number.isFinite(offNum) && offNum >= 0 ? offNum : 0;

    const sqlConteo = `
      SELECT COUNT(*)::int AS total
      FROM mensajes.configuracion_bitacora;
    `;

    const sqlRegistros = `
      SELECT
        id,
        usuario_id AS "usuarioId",
        fecha_cambio AS "fechaCambio",
        valor_anterior AS "valorAnterior",
        valor_nuevo AS "valorNuevo"
      FROM mensajes.configuracion_bitacora
      ORDER BY fecha_cambio DESC, id DESC
      LIMIT $1 OFFSET $2;
    `;

    const resConteo = await this.db.query(sqlConteo, []);
    const resRegistros = await this.db.query(sqlRegistros, [lim, off]);

    const total = Number(resConteo?.rows?.[0]?.total ?? (resRegistros?.rows?.length || 0));
    const registros = (resRegistros?.rows || []).map((fila) =>
      clonarRegistroBitacora({
        id: fila.id,
        usuarioId: fila.usuarioId,
        fechaCambio:
          fila.fechaCambio instanceof Date
            ? fila.fechaCambio.toISOString()
            : fila.fechaCambio,
        valorAnterior:
          typeof fila.valorAnterior === "string"
            ? JSON.parse(fila.valorAnterior)
            : fila.valorAnterior,
        valorNuevo:
          typeof fila.valorNuevo === "string"
            ? JSON.parse(fila.valorNuevo)
            : fila.valorNuevo,
      })
    );

    return {
      registros,
      total,
      limite: lim,
      offset: off,
    };
  }
}
