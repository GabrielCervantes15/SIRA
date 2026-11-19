/**
 * Adaptador de Infraestructura PostgreSQL: Repositorio de Configuración de Mensajes
 * Tareas: EQ-104 (HU9-3) y EQ-107 (HU9-6)
 *
 * Implementa el puerto IRepositorioConfiguracionMensajes sobre el esquema `mensajes`
 * garantizando atomicidad mediante una transacción única (BEGIN ... COMMIT / ROLLBACK).
 */
import {
  DIAS_SEMANA,
  ORDEN_DIAS_SEMANA,
  crearConfiguracionInicial,
  clonarConfiguracion,
} from "../dominio/repositorio-configuracion.js";
import { validarConfiguracionMensajes } from "../dominio/validador-configuracion.js";

export class RepositorioConfiguracionPostgres {
  /**
   * @param {Object} dependencias
   * @param {{ query: Function, connect?: Function }} dependencias.db - Pool o cliente de PostgreSQL.
   */
  constructor({ db }) {
    if (!db || typeof db.query !== "function") {
      throw new Error(
        "Se requiere un cliente o pool de PostgreSQL con método query(sql, params)."
      );
    }
    this.db = db;
  }

  /**
   * Consulta la configuración vigente en `mensajes.configuracion_parametros`
   * y `mensajes.configuracion_jornada`. Si aún no existen registros, retorna los valores iniciales.
   *
   * @returns {Promise<Object>}
   */
  async obtenerConfiguracion() {
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

    const resParams = await this.db.query(sqlParametros, []);
    const resJornada = await this.db.query(sqlJornada, []);

    if (!resParams.rows || resParams.rows.length === 0) {
      return crearConfiguracionInicial();
    }

    const filaParams = resParams.rows[0];
    const base = crearConfiguracionInicial();
    const jornada = { ...base.jornada };

    for (const filaDia of resJornada.rows || []) {
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
   * Persiste la configuración completa en una única transacción PostgreSQL (BEGIN ... COMMIT / ROLLBACK).
   * Si cualquier sentencia falla, se ejecuta ROLLBACK para impedir actualizaciones parciales.
   *
   * @param {Object} nuevaConfiguracion
   * @returns {Promise<Object>}
   */
  async guardarConfiguracion(nuevaConfiguracion) {
    const validacion = validarConfiguracionMensajes(nuevaConfiguracion);
    if (!validacion.valido) {
      const error = new Error("La configuración proporcionada no es válida.");
      error.status = 400;
      error.codigo = "CONFIGURACION_INVALIDA";
      error.errores = validacion.errores;
      throw error;
    }

    const normalizada = validacion.configuracionNormalizada;
    const actualizadoEn = nuevaConfiguracion.actualizadoEn || new Date().toISOString();
    const actualizadoPor = nuevaConfiguracion.actualizadoPor ?? null;

    const cliente =
      typeof this.db.connect === "function" ? await this.db.connect() : this.db;

    try {
      await cliente.query("BEGIN");

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

      await cliente.query("COMMIT");

      return clonarConfiguracion({
        ...normalizada,
        actualizadoEn,
        actualizadoPor,
      });
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
}
