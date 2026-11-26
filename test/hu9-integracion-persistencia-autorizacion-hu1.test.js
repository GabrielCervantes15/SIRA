/**
 * Suite de Pruebas de Integración: Persistencia, Autorización y Lectura en Vivo desde HU 1
 * Tarea Jira: EQ-112 · [HU9-11] (Sprint 2)
 *
 * Verifica de punta a punta sobre instancias reales de `crearServidor`:
 * - Bloque 1: Persistencia completa (Guardar -> Leer -> Bitácora) con PostgreSQL transaccional simulado,
 *   supervivencia tras reinicio del servidor y rollback atómico ante fallos de BD o errores 400.
 * - Bloque 2: Autorización estricta (401 sin sesión, 403 para Colaborador sin efectos colaterales,
 *   consumo indirecto desde HU 1 por Colaborador y bloqueo 403 si un Administrador intenta enviar lote en HU 1).
 * - Bloque 3: Lectura e impacto en vivo desde HU 1 (rechazo 409 de HU1-6 fuera del horario configurado sin
 *   crear lotes ni publicar eventos, desbloqueo inmediato al ampliar jornada, día deshabilitado,
 *   actualización en vivo de `tiempoEsperaContactoPrevio` en EQ-81 y refresco reactivo vía bus de eventos EQ-108).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { crearServidor } from "../src/servidor.js";
import { crearModuloMonitoreo } from "../src/modulos/monitoreo/index.js";
import { crearBusEnMemoria } from "../src/compartido/eventos/bus-en-memoria.js";
import { crearProveedorWhatsAppSimulado } from "../src/modulos/whatsapp/index.js";
import { crearServicioCorreoSimulado } from "../src/modulos/notificaciones/servicio-correo-simulado.js";
import { RepositorioLotesMemoria } from "../src/modulos/disparo-automatico/infraestructura/repositorio-lotes-memoria.js";
import {
  crearConfiguracionInicial,
  crearInterfazLecturaConfiguracion,
  RepositorioConfiguracionMemoria,
  RepositorioConfiguracionPostgres,
} from "../src/modulos/mensajes/index.js";

const ADMIN = { id: "00000100001", password: "AdminPassword2026!" };
const COLABORADOR = { id: "00000252115", password: "Password123!" };
const COLAS_RAPIDAS = {
  mensajesPorSegundo: 10_000,
  esperaBaseMs: 5,
  esperaMaximaMs: 20,
};

function peticionHttp(puerto, path, opciones = {}) {
  return new Promise((resolve, reject) => {
    const cuerpoTexto =
      opciones.body !== undefined
        ? typeof opciones.body === "string"
          ? opciones.body
          : JSON.stringify(opciones.body)
        : null;

    const headers = { ...(opciones.headers || {}) };
    if (cuerpoTexto !== null && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: puerto,
        path,
        method: opciones.method || "GET",
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            // Cuerpo no JSON
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json ?? data,
          });
        });
      }
    );

    req.on("error", reject);
    if (cuerpoTexto !== null) {
      req.write(cuerpoTexto);
    }
    req.end();
  });
}

async function iniciarSesion(puerto, { id, password }) {
  const res = await peticionHttp(puerto, "/api/v1/auth/login", {
    method: "POST",
    body: { identificador: id, password },
  });
  assert.equal(res.status, 200);
  const cookie = res.headers["set-cookie"]?.[0]?.split(";")[0];
  assert.ok(cookie, "El login debe emitir cookie de sesión sira_session");
  return cookie;
}

/**
 * Doble transaccional de PostgreSQL con estado real en memoria para las 3 tablas
 * del esquema `mensajes` (`configuracion_parametros`, `configuracion_jornada` y `configuracion_bitacora`).
 * Soporta `BEGIN`, `COMMIT` y `ROLLBACK` restaurando la instantánea previa si falla cualquier sentencia.
 */
function crearBaseDatosPostgresConEstado() {
  let estado = {
    parametros: null,
    jornada: new Map(),
    bitacora: [],
  };
  let respaldoTransaccion = null;

  const db = {
    simularFalloEnBitacora: false,
    historialSql: [],
    async query(sql, params = []) {
      const sqlLimpio = sql.trim();
      db.historialSql.push({ sql: sqlLimpio, params });

      if (sqlLimpio === "BEGIN") {
        respaldoTransaccion = structuredClone(estado);
        return { rows: [] };
      }

      if (sqlLimpio === "COMMIT") {
        respaldoTransaccion = null;
        return { rows: [] };
      }

      if (sqlLimpio === "ROLLBACK") {
        if (respaldoTransaccion) {
          estado = respaldoTransaccion;
          respaldoTransaccion = null;
        }
        return { rows: [] };
      }

      if (sqlLimpio.includes("FROM mensajes.configuracion_parametros")) {
        return {
          rows: estado.parametros ? [structuredClone(estado.parametros)] : [],
        };
      }

      if (sqlLimpio.includes("FROM mensajes.configuracion_jornada")) {
        const filas = [...estado.jornada.values()].sort(
          (a, b) => a.ordenDia - b.ordenDia
        );
        return { rows: structuredClone(filas) };
      }

      if (sqlLimpio.includes("INSERT INTO mensajes.configuracion_parametros")) {
        const [
          zonaHoraria,
          esperaRespuestaValor,
          esperaRespuestaUnidad,
          esperaContactoPrevioValor,
          esperaContactoPrevioUnidad,
          actualizadoEn,
          actualizadoPor,
        ] = params;
        estado.parametros = {
          zonaHoraria,
          esperaRespuestaValor,
          esperaRespuestaUnidad,
          esperaContactoPrevioValor,
          esperaContactoPrevioUnidad,
          actualizadoEn,
          actualizadoPor,
        };
        return { rows: [] };
      }

      if (sqlLimpio.includes("INSERT INTO mensajes.configuracion_jornada")) {
        const [diaSemana, ordenDia, habilitado, horaInicio, horaFin] = params;
        estado.jornada.set(diaSemana, {
          diaSemana,
          ordenDia,
          habilitado,
          horaInicio,
          horaFin,
        });
        return { rows: [] };
      }

      if (sqlLimpio.includes("INSERT INTO mensajes.configuracion_bitacora")) {
        if (db.simularFalloEnBitacora) {
          throw new Error("Fallo simulado de base de datos al insertar en bitácora");
        }
        const [id, usuarioId, fechaCambio, valorAnteriorJson, valorNuevoJson] =
          params;
        estado.bitacora.unshift({
          id,
          usuarioId,
          fechaCambio,
          valorAnterior: JSON.parse(valorAnteriorJson),
          valorNuevo: JSON.parse(valorNuevoJson),
        });
        return { rows: [] };
      }

      if (sqlLimpio.includes("SELECT COUNT(*)::int AS total")) {
        return { rows: [{ total: estado.bitacora.length }] };
      }

      if (sqlLimpio.includes("FROM mensajes.configuracion_bitacora")) {
        const [limite = 50, offset = 0] = params;
        const tajada = estado.bitacora.slice(offset, offset + limite);
        return { rows: structuredClone(tajada) };
      }

      return { rows: [] };
    },
  };

  return db;
}

// ============================================================================
// BLOQUE 1: Integración de Persistencia (Guardar -> Leer -> Bitácora, Reinicio y Rollback)
// ============================================================================

test("[EQ-112 / HU9-11] 1.1 Ciclo completo Guardar -> Leer -> Bitácora por HTTP con RepositorioConfiguracionPostgres y supervivencia tras reinicio del servidor", async () => {
  const db = crearBaseDatosPostgresConEstado();
  let instanteReloj = Date.parse("2026-11-18T16:00:00.000Z");

  // Primera instancia del servidor sobre PostgreSQL simulado
  const repoPg1 = new RepositorioConfiguracionPostgres({ db });
  const servidor1 = crearServidor({
    port: 0,
    reloj: () => instanteReloj,
    repositorioConfiguracionMensajes: repoPg1,
  });

  await new Promise((resolve) => servidor1.listen(0, "127.0.0.1", resolve));
  const puerto1 = servidor1.address().port;

  let nuevaConfiguracionGuardada = null;

  try {
    const cookieAdmin = await iniciarSesion(puerto1, ADMIN);

    // 1. GET inicial devuelve valores iniciales del PO
    const getInicial = await peticionHttp(
      puerto1,
      "/api/v1/mensajes/configuracion",
      { headers: { Cookie: cookieAdmin } }
    );
    assert.equal(getInicial.status, 200);
    assert.equal(getInicial.body.zonaHoraria, "America/Hermosillo");
    assert.equal(getInicial.body.tiempoMaximoEsperaRespuesta.valor, 24);
    assert.equal(getInicial.body.tiempoEsperaContactoPrevio.valor, 48);
    assert.equal(getInicial.body.jornada.lunes.horaInicio, "08:00");
    assert.equal(getInicial.body.jornada.sabado.habilitado, false);

    // 2. PUT guarda nueva configuración con horarios independientes y distintas unidades
    const payloadActualizado = {
      zonaHoraria: "America/Hermosillo",
      jornada: {
        lunes: { habilitado: true, horaInicio: "07:30", horaFin: "16:30" },
        martes: { habilitado: true, horaInicio: "08:00", horaFin: "18:00" },
        miercoles: { habilitado: true, horaInicio: "08:00", horaFin: "18:00" },
        jueves: { habilitado: true, horaInicio: "08:00", horaFin: "18:00" },
        viernes: { habilitado: true, horaInicio: "09:00", horaFin: "15:00" },
        sabado: { habilitado: true, horaInicio: "09:00", horaFin: "13:00" },
        domingo: { habilitado: false, horaInicio: null, horaFin: null },
      },
      tiempoMaximoEsperaRespuesta: { valor: 2, unidad: "dias" },
      tiempoEsperaContactoPrevio: { valor: 36, unidad: "horas" },
    };

    const resPut = await peticionHttp(puerto1, "/api/v1/mensajes/configuracion", {
      method: "PUT",
      headers: { Cookie: cookieAdmin },
      body: payloadActualizado,
    });
    assert.equal(resPut.status, 200);
    assert.equal(resPut.body.tiempoMaximoEsperaRespuesta.equivalenciaHoras, 48);
    assert.equal(resPut.body.tiempoEsperaContactoPrevio.equivalenciaHoras, 36);
    assert.equal(resPut.body.actualizadoPor, ADMIN.id);
    assert.equal(resPut.body.actualizadoEn, "2026-11-18T16:00:00.000Z");
    nuevaConfiguracionGuardada = resPut.body;

    // 3. GET posterior (y alias /api/mensajes/configuracion) devuelven exactamente lo persistido
    const getPosterior = await peticionHttp(
      puerto1,
      "/api/mensajes/configuracion",
      { headers: { Cookie: cookieAdmin } }
    );
    assert.equal(getPosterior.status, 200);
    assert.deepEqual(getPosterior.body, nuevaConfiguracionGuardada);

    // 4. Bitácora refleja el cambio
    const resBitacora = await peticionHttp(
      puerto1,
      "/api/v1/mensajes/configuracion/bitacora",
      { headers: { Cookie: cookieAdmin } }
    );
    assert.equal(resBitacora.status, 200);
    assert.equal(resBitacora.body.total, 1);
    assert.equal(resBitacora.body.registros[0].usuarioId, ADMIN.id);
    assert.equal(
      resBitacora.body.registros[0].valorAnterior.tiempoMaximoEsperaRespuesta.valor,
      24
    );
    assert.equal(
      resBitacora.body.registros[0].valorNuevo.tiempoMaximoEsperaRespuesta.valor,
      2
    );
  } finally {
    await servidor1.esperarEnviosHU1?.();
    await new Promise((resolve) => servidor1.close(resolve));
  }

  // 5. Reinicio del servidor: una segunda instancia conectada al mismo almacenamiento Postgres recupera todo
  const repoPg2 = new RepositorioConfiguracionPostgres({ db });
  const servidor2 = crearServidor({
    port: 0,
    reloj: () => instanteReloj,
    repositorioConfiguracionMensajes: repoPg2,
  });
  await servidor2.modulos.mensajes.interfazLectura.sincronizarDesdeRepositorio();

  await new Promise((resolve) => servidor2.listen(0, "127.0.0.1", resolve));
  const puerto2 = servidor2.address().port;

  try {
    const cookieAdmin2 = await iniciarSesion(puerto2, ADMIN);

    const getTrasReinicio = await peticionHttp(
      puerto2,
      "/api/v1/mensajes/configuracion",
      { headers: { Cookie: cookieAdmin2 } }
    );
    assert.equal(getTrasReinicio.status, 200);
    assert.deepEqual(getTrasReinicio.body, nuevaConfiguracionGuardada);

    const vigenteEnMemoria =
      servidor2.modulos.mensajes.obtenerConfiguracionVigente();
    assert.equal(
      vigenteEnMemoria.tiempoMaximoEsperaRespuesta.equivalenciaHoras,
      48
    );
    assert.equal(vigenteEnMemoria.jornada.sabado.habilitado, true);

    const bitacoraTrasReinicio = await peticionHttp(
      puerto2,
      "/api/v1/mensajes/configuracion/bitacora",
      { headers: { Cookie: cookieAdmin2 } }
    );
    assert.equal(bitacoraTrasReinicio.status, 200);
    assert.equal(bitacoraTrasReinicio.body.total, 1);
  } finally {
    await servidor2.esperarEnviosHU1?.();
    await new Promise((resolve) => servidor2.close(resolve));
  }
});

test("[EQ-112 / HU9-11] 1.2 Rollback ante fallo transaccional en PostgreSQL y error 400 conservan intactos estado, bitácora e instantánea sin publicar evento", async () => {
  const db = crearBaseDatosPostgresConEstado();
  const bus = crearBusEnMemoria();
  const eventosConfig = [];
  bus.suscribir("mensajes.configuracion.#", (ev) => eventosConfig.push(ev));

  const repoPg = new RepositorioConfiguracionPostgres({ db });
  const servidor = crearServidor({
    port: 0,
    bus,
    repositorioConfiguracionMensajes: repoPg,
  });

  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const puerto = servidor.address().port;

  try {
    const cookieAdmin = await iniciarSesion(puerto, ADMIN);

    // 1. Guardado válido inicial (espera respuesta = 12 horas)
    const configBase = {
      ...crearConfiguracionInicial(),
      tiempoMaximoEsperaRespuesta: { valor: 12, unidad: "horas" },
    };
    const putOk = await peticionHttp(puerto, "/api/v1/mensajes/configuracion", {
      method: "PUT",
      headers: { Cookie: cookieAdmin },
      body: configBase,
    });
    assert.equal(putOk.status, 200);
    assert.equal(eventosConfig.length, 1);

    // 2. Payload inválido (400) -> no modifica configuración, bitácora ni publica evento
    const put400 = await peticionHttp(puerto, "/api/v1/mensajes/configuracion", {
      method: "PUT",
      headers: { Cookie: cookieAdmin },
      body: {
        ...configBase,
        tiempoMaximoEsperaRespuesta: { valor: 0, unidad: "horas" },
      },
    });
    assert.equal(put400.status, 400);
    assert.equal(put400.body.codigo, "CONFIGURACION_INVALIDA");
    assert.equal(eventosConfig.length, 1);

    // 3. Fallo en BD a mitad de la transacción (al insertar en bitácora) -> ROLLBACK completo
    db.simularFalloEnBitacora = true;
    const put500 = await peticionHttp(puerto, "/api/v1/mensajes/configuracion", {
      method: "PUT",
      headers: { Cookie: cookieAdmin },
      body: {
        ...configBase,
        tiempoMaximoEsperaRespuesta: { valor: 5, unidad: "dias" },
      },
    });
    assert.equal(put500.status, 500);
    assert.equal(eventosConfig.length, 1, "No debe publicar evento si la transacción hizo ROLLBACK");

    // Verificar que la configuración en BD, la instantánea en memoria y la bitácora siguen con 12 horas
    db.simularFalloEnBitacora = false;
    const getDespues = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion",
      { headers: { Cookie: cookieAdmin } }
    );
    assert.equal(getDespues.status, 200);
    assert.equal(getDespues.body.tiempoMaximoEsperaRespuesta.valor, 12);
    assert.equal(
      servidor.modulos.mensajes.obtenerConfiguracionVigente()
        .tiempoMaximoEsperaRespuesta.valor,
      12
    );

    const bitacoraDespues = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion/bitacora",
      { headers: { Cookie: cookieAdmin } }
    );
    assert.equal(bitacoraDespues.body.total, 1);
  } finally {
    await servidor.esperarEnviosHU1?.();
    await new Promise((resolve) => servidor.close(resolve));
  }
});

// ============================================================================
// BLOQUE 2: Integración de Autorización (401 / 403 / 200 y separación de roles)
// ============================================================================

test("[EQ-112 / HU9-11] 2.1 Autorización estricta: 401 sin sesión, 403 para Colaborador en endpoints administrativos, consumo indirecto permitido en HU1 y 403 para Administrador al enviar lote en HU1", async () => {
  // Reloj en Lunes 16 Nov 2026 a las 10:00 America/Hermosillo (17:00:00Z -> dentro de horario)
  const lunes10AmMs = Date.parse("2026-11-16T17:00:00.000Z");

  const servidor = crearServidor({
    port: 0,
    reloj: () => lunes10AmMs,
    colaEnvioWhatsApp: COLAS_RAPIDAS,
    colaEnvioCorreo: COLAS_RAPIDAS,
  });

  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const puerto = servidor.address().port;

  try {
    // 1. Sin sesión -> 401 en todas las rutas de configuración y bitácora
    for (const [metodo, ruta] of [
      ["GET", "/api/v1/mensajes/configuracion"],
      ["PUT", "/api/v1/mensajes/configuracion"],
      ["GET", "/api/v1/mensajes/configuracion/bitacora"],
      ["GET", "/api/mensajes/configuracion"],
    ]) {
      const res = await peticionHttp(puerto, ruta, {
        method: metodo,
        body: metodo === "PUT" ? crearConfiguracionInicial() : undefined,
      });
      assert.equal(res.status, 401, `${metodo} ${ruta} sin sesión debe responder 401`);
      assert.equal(res.body.codigo, "SESION_NO_VALIDA");
    }

    // 2. Colaborador autenticado -> 403 SIN_PERMISO en GET, PUT y Bitácora (incluso intentando falsificar rol)
    const cookieColaborador = await iniciarSesion(puerto, COLABORADOR);

    const getColab = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion",
      { headers: { Cookie: cookieColaborador } }
    );
    assert.equal(getColab.status, 403);
    assert.equal(getColab.body.codigo, "SIN_PERMISO");

    const putColab = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion",
      {
        method: "PUT",
        headers: {
          Cookie: cookieColaborador,
          "X-User-Role": "administrador",
          "X-Colaborador-Id": ADMIN.id,
        },
        body: {
          ...crearConfiguracionInicial(),
          rol: "administrador",
          actualizadoPor: ADMIN.id,
          tiempoMaximoEsperaRespuesta: { valor: 10, unidad: "dias" },
        },
      }
    );
    assert.equal(putColab.status, 403);
    assert.equal(putColab.body.codigo, "SIN_PERMISO");

    const bitacoraColab = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion/bitacora",
      { headers: { Cookie: cookieColaborador } }
    );
    assert.equal(bitacoraColab.status, 403);
    assert.equal(bitacoraColab.body.codigo, "SIN_PERMISO");

    // Verificar con sesión de Administrador que el intento 403 del Colaborador no alteró nada
    const cookieAdmin = await iniciarSesion(puerto, ADMIN);
    const getAdmin = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion",
      { headers: { Cookie: cookieAdmin } }
    );
    assert.equal(getAdmin.status, 200);
    assert.equal(getAdmin.body.tiempoMaximoEsperaRespuesta.valor, 24);

    const bitacoraAdmin = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion/bitacora",
      { headers: { Cookie: cookieAdmin } }
    );
    assert.equal(bitacoraAdmin.body.total, 0);

    // 3. El mismo Colaborador SÍ puede consultar vista previa y enviar lote en HU 1 (consumo indirecto de HU 9-4)
    const vistaColab = await peticionHttp(
      puerto,
      "/api/v1/disparo-mensajes/vista-previa?semaforos=ROJO,NARANJA&carreras=Ingenier%C3%ADa%20en%20Software&inactividadValor=7&inactividadUnidad=DIAS",
      { headers: { Cookie: cookieColaborador } }
    );
    assert.equal(vistaColab.status, 200);
    assert.equal(vistaColab.body.dentroDeHorario, true);
    assert.equal(vistaColab.body.horasContactoPrevio, 48);
    assert.ok(vistaColab.body.total > 0);

    const envioColab = await peticionHttp(
      puerto,
      "/api/v1/disparo-mensajes/enviar",
      {
        method: "POST",
        headers: {
          Cookie: cookieColaborador,
          "Idempotency-Key": "eq112-auth-colab-1",
        },
        body: {
          semaforos: ["ROJO", "NARANJA"],
          carreras: ["Ingeniería en Software"],
          inactividadValor: 7,
          inactividadUnidad: "DIAS",
          enviarPorCorreo: false,
        },
      }
    );
    assert.equal(envioColab.status, 200);
    assert.ok(envioColab.body.loteId);
    await servidor.esperarEnviosHU1();

    // 4. Un Administrador que intenta disparar un lote en HU 1 recibe 403 SIN_PERMISO (HU 1 §12)
    const envioAdmin = await peticionHttp(
      puerto,
      "/api/v1/disparo-mensajes/enviar",
      {
        method: "POST",
        headers: {
          Cookie: cookieAdmin,
          "Idempotency-Key": "eq112-auth-admin-1",
        },
        body: {
          semaforos: ["ROJO", "NARANJA"],
          carreras: ["Ingeniería en Software"],
          inactividadValor: 7,
          inactividadUnidad: "DIAS",
          enviarPorCorreo: false,
        },
      }
    );
    assert.equal(envioAdmin.status, 403);
    assert.equal(envioAdmin.body.codigo, "SIN_PERMISO");
  } finally {
    await servidor.esperarEnviosHU1?.();
    await new Promise((resolve) => servidor.close(resolve));
  }
});

// ============================================================================
// BLOQUE 3: Lectura e Impacto en Vivo desde HU 1 (HU1-6 + EQ-81 + EQ-83 + Bus)
// ============================================================================

test("[EQ-112 / HU9-11] 3.1 y 3.2 HU1-6 rechaza envíos con 409 fuera del horario recién configurado en HU9 (sin crear lotes ni publicar eventos) y desbloquea al ampliar la jornada", async () => {
  // Reloj en Miércoles 18 Nov 2026 a las 14:00 America/Hermosillo (2026-11-18T21:00:00.000Z)
  const miercoles14HsMs = Date.parse("2026-11-18T21:00:00.000Z");

  const bus = crearBusEnMemoria();
  const eventosDisparo = [];
  bus.suscribir("disparo.#", (evento, routingKey) => {
    eventosDisparo.push({ routingKey, evento });
  });

  const repositorioLotes = new RepositorioLotesMemoria();
  const whatsapp = crearProveedorWhatsAppSimulado();
  const smtp = crearServicioCorreoSimulado();

  const servidor = crearServidor({
    port: 0,
    reloj: () => miercoles14HsMs,
    bus,
    repositorioLotes,
    proveedorWhatsApp: whatsapp,
    servicioCorreoDisparo: smtp,
    colaEnvioWhatsApp: COLAS_RAPIDAS,
    colaEnvioCorreo: COLAS_RAPIDAS,
  });

  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const puerto = servidor.address().port;

  try {
    const cookieAdmin = await iniciarSesion(puerto, ADMIN);
    const cookieColaborador = await iniciarSesion(puerto, COLABORADOR);

    const urlVistaPrevia =
      "/api/v1/disparo-mensajes/vista-previa?semaforos=ROJO,NARANJA&carreras=Ingenier%C3%ADa%20en%20Software&inactividadValor=7&inactividadUnidad=DIAS";

    // 1. Con jornada inicial (08:00 a 18:00), el miércoles a las 14:00 está dentro de horario
    const vistaInicial = await peticionHttp(puerto, urlVistaPrevia, {
      headers: { Cookie: cookieColaborador },
    });
    assert.equal(vistaInicial.status, 200);
    assert.equal(vistaInicial.body.dentroDeHorario, true);
    assert.ok(vistaInicial.body.total > 0);

    // 2. El Administrador acorta el miércoles a 08:00–12:00 vía PUT /api/v1/mensajes/configuracion
    const configMiercolesCorto = {
      ...crearConfiguracionInicial(),
      jornada: {
        ...crearConfiguracionInicial().jornada,
        miercoles: { habilitado: true, horaInicio: "08:00", horaFin: "12:00" },
      },
    };
    const putCorto = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion",
      {
        method: "PUT",
        headers: { Cookie: cookieAdmin },
        body: configMiercolesCorto,
      }
    );
    assert.equal(putCorto.status, 200);

    // 3. Vista previa sigue disponible (200) con el conteo real, pero dentroDeHorario: false y siguienteApertura = jueves 08:00 Hermosillo
    const vistaFuera = await peticionHttp(puerto, urlVistaPrevia, {
      headers: { Cookie: cookieColaborador },
    });
    assert.equal(vistaFuera.status, 200);
    assert.equal(vistaFuera.body.dentroDeHorario, false);
    assert.equal(vistaFuera.body.total, vistaInicial.body.total);
    assert.equal(vistaFuera.body.estadoHorario.permitido, false);
    assert.equal(vistaFuera.body.estadoHorario.diaSemana, "miercoles");
    assert.equal(
      vistaFuera.body.estadoHorario.siguienteApertura,
      "2026-11-19T15:00:00.000Z"
    );

    // 4. Intento de envío en POST /api/v1/disparo-mensajes/enviar -> 409 FUERA_DE_HORARIO_PERMITIDO
    const intentoRechazado = await peticionHttp(
      puerto,
      "/api/v1/disparo-mensajes/enviar",
      {
        method: "POST",
        headers: {
          Cookie: cookieColaborador,
          "Idempotency-Key": "eq112-miercoles-fuera-1",
          "X-Fecha-Cliente": "2026-11-18T16:00:00.000Z",
        },
        body: {
          semaforos: ["ROJO", "NARANJA"],
          carreras: ["Ingeniería en Software"],
          inactividadValor: 7,
          inactividadUnidad: "DIAS",
          enviarPorCorreo: true,
          fechaCliente: "2026-11-18T16:00:00.000Z",
        },
      }
    );
    assert.equal(intentoRechazado.status, 409);
    assert.equal(intentoRechazado.body.codigo, "FUERA_DE_HORARIO_PERMITIDO");
    assert.equal(
      intentoRechazado.body.detalle.zonaHoraria,
      "America/Hermosillo"
    );
    assert.equal(
      intentoRechazado.body.detalle.siguienteApertura,
      "2026-11-19T15:00:00.000Z"
    );
    assert.equal(intentoRechazado.body.detalle.programadoAutomaticamente, false);

    // Confirmar cero efectos secundarios: ningún evento de disparo ni correo enviado
    assert.equal(eventosDisparo.length, 0);
    assert.equal(smtp.bandeja().length, 0);

    // 5. El Administrador amplía el miércoles a 08:00–16:00 -> el reintento de envío ahora pasa con 200 OK
    const configMiercolesAmplio = {
      ...crearConfiguracionInicial(),
      jornada: {
        ...crearConfiguracionInicial().jornada,
        miercoles: { habilitado: true, horaInicio: "08:00", horaFin: "16:00" },
      },
    };
    const putAmplio = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion",
      {
        method: "PUT",
        headers: { Cookie: cookieAdmin },
        body: configMiercolesAmplio,
      }
    );
    assert.equal(putAmplio.status, 200);

    const envioDesbloqueado = await peticionHttp(
      puerto,
      "/api/v1/disparo-mensajes/enviar",
      {
        method: "POST",
        headers: {
          Cookie: cookieColaborador,
          "Idempotency-Key": "eq112-miercoles-dentro-1",
        },
        body: {
          semaforos: ["ROJO", "NARANJA"],
          carreras: ["Ingeniería en Software"],
          inactividadValor: 7,
          inactividadUnidad: "DIAS",
          enviarPorCorreo: true,
        },
      }
    );
    assert.equal(envioDesbloqueado.status, 200);
    assert.ok(envioDesbloqueado.body.loteId);
    assert.equal(envioDesbloqueado.body.repetido, false);

    await servidor.esperarEnviosHU1();
    assert.ok(eventosDisparo.length > 0, "Deben publicarse los eventos del lote tras desbloquear el horario");
    assert.ok(smtp.bandeja().length > 0, "Deben procesarse los correos del lote");
  } finally {
    await servidor.esperarEnviosHU1?.();
    await new Promise((resolve) => servidor.close(resolve));
  }
});

test("[EQ-112 / HU9-11] 3.3 y 3.4 Lectura en vivo de tiempoEsperaContactoPrevio en EQ-81 (vista-previa), refresco por bus (EQ-108) y rechazo 409 al deshabilitar el día actual", async () => {
  // Reloj en Jueves 19 Nov 2026 a las 10:00 America/Hermosillo (2026-11-19T17:00:00.000Z)
  const jueves10AmMs = Date.parse("2026-11-19T17:00:00.000Z");

  // Dos aspirantes elegibles por inactividad (> 7 días), pero uno tuvo contacto saliente hace 36 horas (2026-11-18T05:00:00.000Z)
  const moduloMonitoreo = crearModuloMonitoreo({
    datosSemilla: {
      aspirantes: [
        {
          id: "asp-contacto-36h",
          folioSolicitud: "FOL-2026-8101",
          nombreCompleto: "Daniela Rivera Soto",
          correo: "daniela.rivera@ejemplo.mx",
          telefono: "+526441110001",
          campus: "Campus Obregón Náinari",
          carreraSolicitada: "Ingeniería en Software",
          preparatoriaProcedencia: "CBTIS 37",
          periodo: "2027-1",
          fechaSolicitud: "2026-10-01T10:00:00.000Z",
          estadoSolicitud: "EN_REVISION",
          semaforo: "ROJO",
          colaboradorId: "colab-001",
          fechaUltimaActividad: "2026-11-01T10:00:00.000Z",
        },
        {
          id: "asp-sin-contacto",
          folioSolicitud: "FOL-2026-8102",
          nombreCompleto: "Emiliano Torres Vega",
          correo: "emiliano.torres@ejemplo.mx",
          telefono: "+526441110002",
          campus: "Campus Obregón Náinari",
          carreraSolicitada: "Ingeniería en Software",
          preparatoriaProcedencia: "CBTIS 37",
          periodo: "2027-1",
          fechaSolicitud: "2026-10-01T10:00:00.000Z",
          estadoSolicitud: "RECIBIDA",
          semaforo: "NARANJA",
          colaboradorId: "colab-001",
          fechaUltimaActividad: "2026-11-01T10:00:00.000Z",
        },
      ],
      conversaciones: [
        {
          id: "msg-saliente-36h",
          aspiranteId: "asp-contacto-36h",
          direccion: "SALIENTE",
          remitenteTipo: "COLABORADOR",
          remitenteId: COLABORADOR.id,
          contenido: "Seguimiento previo hace 36 horas",
          tipoContenido: "TEXTO",
          estadoEntrega: "ENVIADO",
          fechaEnvio: "2026-11-18T05:00:00.000Z",
        },
      ],
    },
  });

  const bus = crearBusEnMemoria();

  // Instancia independiente de lectura suscrita al bus para verificar el refresco reactivo (EQ-108)
  const lecturaConsumidorExterno = crearInterfazLecturaConfiguracion({
    repositorioConfiguracion: new RepositorioConfiguracionMemoria(),
    busEventos: bus,
  });

  const servidor = crearServidor({
    port: 0,
    reloj: () => jueves10AmMs,
    moduloMonitoreo,
    bus,
    colaEnvioWhatsApp: COLAS_RAPIDAS,
    colaEnvioCorreo: COLAS_RAPIDAS,
  });

  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const puerto = servidor.address().port;

  try {
    const cookieAdmin = await iniciarSesion(puerto, ADMIN);
    const cookieColaborador = await iniciarSesion(puerto, COLABORADOR);
    const urlVista =
      "/api/v1/disparo-mensajes/vista-previa?semaforos=ROJO,NARANJA&carreras=Ingenier%C3%ADa%20en%20Software&inactividadValor=7&inactividadUnidad=DIAS";

    // 1. Con configuración inicial (48 h de espera por contacto previo): asp-contacto-36h queda excluido (total: 1)
    const vista48h = await peticionHttp(puerto, urlVista, {
      headers: { Cookie: cookieColaborador },
    });
    assert.equal(vista48h.status, 200);
    assert.equal(vista48h.body.horasContactoPrevio, 48);
    assert.equal(vista48h.body.total, 1);
    assert.equal(vista48h.body.excluidos.contactoReciente, 1);

    // 2. El Administrador reduce tiempoEsperaContactoPrevio a 24 horas (1 día) vía PUT /api/v1/mensajes/configuracion
    const config24h = {
      ...crearConfiguracionInicial(),
      tiempoEsperaContactoPrevio: { valor: 1, unidad: "dias" },
    };
    const put24h = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion",
      {
        method: "PUT",
        headers: { Cookie: cookieAdmin },
        body: config24h,
      }
    );
    assert.equal(put24h.status, 200);

    // 3. Vista previa en HU 1 refleja de inmediato horasContactoPrevio = 24 e incluye a ambos aspirantes (total: 2)
    const vista24h = await peticionHttp(puerto, urlVista, {
      headers: { Cookie: cookieColaborador },
    });
    assert.equal(vista24h.status, 200);
    assert.equal(vista24h.body.horasContactoPrevio, 24);
    assert.equal(vista24h.body.total, 2);
    assert.equal(vista24h.body.excluidos.contactoReciente, 0);

    // La instancia independiente suscrita al bus también se refrescó reactivamente a 24 h
    assert.equal(
      lecturaConsumidorExterno.obtenerConfiguracionVigente()
        .tiempoEsperaContactoPrevio.equivalenciaHoras,
      24
    );

    // 4. El Administrador deshabilita el jueves por completo
    const configSinJueves = {
      ...config24h,
      jornada: {
        ...config24h.jornada,
        jueves: { habilitado: false, horaInicio: null, horaFin: null },
      },
    };
    const putSinJueves = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion",
      {
        method: "PUT",
        headers: { Cookie: cookieAdmin },
        body: configSinJueves,
      }
    );
    assert.equal(putSinJueves.status, 200);

    // 5. El Colaborador intenta enviar el jueves a las 10:00 -> 409 con siguienteApertura = viernes 08:00 Hermosillo
    const envioJuevesCerrado = await peticionHttp(
      puerto,
      "/api/v1/disparo-mensajes/enviar",
      {
        method: "POST",
        headers: {
          Cookie: cookieColaborador,
          "Idempotency-Key": "eq112-jueves-cerrado-1",
        },
        body: {
          semaforos: ["ROJO", "NARANJA"],
          carreras: ["Ingeniería en Software"],
          inactividadValor: 7,
          inactividadUnidad: "DIAS",
          enviarPorCorreo: false,
        },
      }
    );
    assert.equal(envioJuevesCerrado.status, 409);
    assert.equal(
      envioJuevesCerrado.body.codigo,
      "FUERA_DE_HORARIO_PERMITIDO"
    );
    assert.equal(envioJuevesCerrado.body.detalle.diaSemana, "jueves");
    assert.equal(
      envioJuevesCerrado.body.detalle.horarioDiaActual.habilitado,
      false
    );
    assert.equal(
      envioJuevesCerrado.body.detalle.siguienteApertura,
      "2026-11-20T15:00:00.000Z"
    );
    assert.match(
      envioJuevesCerrado.body.mensaje,
      /no tiene envíos habilitados/i
    );
  } finally {
    lecturaConsumidorExterno.detenerSuscripcion();
    await servidor.esperarEnviosHU1?.();
    await new Promise((resolve) => servidor.close(resolve));
  }
});
