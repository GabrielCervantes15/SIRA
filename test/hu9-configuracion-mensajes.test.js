import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { crearServidor } from "../src/servidor.js";
import {
  crearModuloMensajes,
  crearConfiguracionInicial,
  implementaRepositorioConfiguracion,
  validarConfiguracionMensajes,
  RepositorioConfiguracionMemoria,
  RepositorioConfiguracionPostgres,
} from "../src/modulos/mensajes/index.js";

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

async function iniciarSesion(puerto, identificador, password) {
  const res = await peticionHttp(puerto, "/api/v1/auth/login", {
    method: "POST",
    body: { identificador, password },
  });
  assert.equal(res.status, 200);
  const cookie = res.headers["set-cookie"]?.[0]?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

// ============================================================================
// 1. Pruebas de [EQ-104 / HU9-3]: Modelo de datos, migración SQL y valores iniciales
// ============================================================================

test("[EQ-104 / HU9-3] Migración SQL 03_esquema_mensajes_configuracion.sql define tablas, restricciones y semilla del PO", async () => {
  const sql = await readFile(
    new URL(
      "../docker/postgres/migrations/03_esquema_mensajes_configuracion.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS mensajes/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS mensajes\.configuracion_parametros/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS mensajes\.configuracion_jornada/i);
  assert.match(sql, /'America\/Hermosillo'/);
  assert.match(sql, /BETWEEN 1 AND 720/i);
  assert.match(sql, /'08:00',\s*'18:00'/);
});

test("[EQ-104 / HU9-3] Repositorio en memoria y Postgres cumplen contrato e inicializan valores aprobados por el PO", async () => {
  const repoMemoria = new RepositorioConfiguracionMemoria();
  const repoPg = new RepositorioConfiguracionPostgres({
    db: { query: async () => ({ rows: [] }) },
  });

  assert.equal(implementaRepositorioConfiguracion(repoMemoria), true);
  assert.equal(implementaRepositorioConfiguracion(repoPg), true);

  const inicial = await repoMemoria.obtenerConfiguracion();
  assert.equal(inicial.zonaHoraria, "America/Hermosillo");
  assert.deepEqual(inicial.tiempoMaximoEsperaRespuesta, {
    valor: 24,
    unidad: "horas",
    equivalenciaHoras: 24,
  });
  assert.deepEqual(inicial.tiempoEsperaContactoPrevio, {
    valor: 48,
    unidad: "horas",
    equivalenciaHoras: 48,
  });

  for (const dia of ["lunes", "martes", "miercoles", "jueves", "viernes"]) {
    assert.deepEqual(inicial.jornada[dia], {
      habilitado: true,
      horaInicio: "08:00",
      horaFin: "18:00",
    });
  }
  for (const dia of ["sabado", "domingo"]) {
    assert.deepEqual(inicial.jornada[dia], {
      habilitado: false,
      horaInicio: null,
      horaFin: null,
    });
  }
});

test("[EQ-104 / EQ-107] RepositorioConfiguracionPostgres guarda en una sola transacción (BEGIN...COMMIT) y hace ROLLBACK ante fallos", async () => {
  const sentencias = [];
  let fallarEnJornada = false;

  const dbSimulado = {
    async query(sql, params) {
      sentencias.push({ sql: sql.trim(), params });
      if (fallarEnJornada && sql.includes("mensajes.configuracion_jornada")) {
        throw new Error("Fallo simulado de escritura en BD");
      }
      return { rows: [] };
    },
  };

  const repoPg = new RepositorioConfiguracionPostgres({ db: dbSimulado });
  const configValida = crearConfiguracionInicial();
  configValida.tiempoMaximoEsperaRespuesta = { valor: 2, unidad: "dias" };

  const guardada = await repoPg.guardarConfiguracion({
    ...configValida,
    actualizadoPor: "00000100001",
  });

  assert.equal(guardada.tiempoMaximoEsperaRespuesta.equivalenciaHoras, 48);
  assert.equal(sentencias[0].sql, "BEGIN");
  assert.equal(sentencias[sentencias.length - 1].sql, "COMMIT");

  // Simular fallo a mitad de la transacción y verificar ROLLBACK
  sentencias.length = 0;
  fallarEnJornada = true;
  await assert.rejects(() => repoPg.guardarConfiguracion(configValida), /Fallo simulado/);
  assert.equal(sentencias[0].sql, "BEGIN");
  assert.equal(sentencias[sentencias.length - 1].sql, "ROLLBACK");
});

// ============================================================================
// 2. Pruebas de [EQ-105 / HU9-4]: Interfaz pública de lectura y zona horaria
// ============================================================================

test("[EQ-105 / HU9-4] obtenerConfiguracionVigente retorna una copia inmutable con equivalencias en horas", () => {
  const modulo = crearModuloMensajes();
  const vigente = modulo.obtenerConfiguracionVigente();

  assert.equal(Object.isFrozen(vigente), true);
  assert.equal(Object.isFrozen(vigente.jornada), true);
  assert.equal(Object.isFrozen(vigente.jornada.lunes), true);
  assert.equal(Object.isFrozen(vigente.tiempoMaximoEsperaRespuesta), true);
  assert.equal(vigente.tiempoMaximoEsperaRespuesta.equivalenciaHoras, 24);
  assert.equal(vigente.tiempoEsperaContactoPrevio.equivalenciaHoras, 48);

  assert.throws(() => {
    vigente.zonaHoraria = "America/Mexico_City";
  }, TypeError);
});

test("[EQ-105 / HU9-4] estaDentroDeHorarioPermitido evalúa estrictamente en America/Hermosillo (UTC-07:00), incluyendo cambio de día y fin de semana", () => {
  const modulo = crearModuloMensajes();

  // Lunes 16 Nov 2026:
  // 07:59:59 en Hermosillo = 14:59:59Z -> fuera de horario (false)
  assert.equal(
    modulo.estaDentroDeHorarioPermitido(new Date("2026-11-16T14:59:59Z")),
    false
  );

  // 08:00:00 en Hermosillo = 15:00:00Z -> inicio exacto de jornada (true)
  assert.equal(
    modulo.estaDentroDeHorarioPermitido(new Date("2026-11-16T15:00:00Z")),
    true
  );

  // Viernes 20 Nov 2026 a las 17:30 en Hermosillo = Sábado 21 Nov 00:30:00Z en UTC.
  // Aunque en UTC ya cambió a sábado, en America/Hermosillo sigue siendo viernes 17:30 -> true!
  assert.equal(
    modulo.estaDentroDeHorarioPermitido(new Date("2026-11-21T00:30:00Z")),
    true
  );

  // Viernes 20 Nov 2026 a las 18:00:00 en Hermosillo = Sábado 21 Nov 01:00:00Z -> fin de jornada (false)
  assert.equal(
    modulo.estaDentroDeHorarioPermitido(new Date("2026-11-21T01:00:00Z")),
    false
  );

  // Sábado 21 Nov 2026 a las 10:00 en Hermosillo = 17:00:00Z -> sábado deshabilitado (false)
  assert.equal(
    modulo.estaDentroDeHorarioPermitido(new Date("2026-11-21T17:00:00Z")),
    false
  );

  // Domingo 22 Nov 2026 a las 12:00 en Hermosillo = 19:00:00Z -> domingo deshabilitado (false)
  assert.equal(
    modulo.estaDentroDeHorarioPermitido(new Date("2026-11-22T19:00:00Z")),
    false
  );
});

test("[EQ-105 / HU9-4] calcularSiguienteApertura programa envíos fuera de horario al siguiente inicio de jornada en America/Hermosillo", () => {
  const modulo = crearModuloMensajes();

  // Caso PO: Viernes 20 Nov 2026 a las 19:00 Hermosillo (2026-11-21T02:00:00Z)
  // Debe saltar sábado y domingo y abrir el Lunes 23 Nov 2026 a las 08:00 Hermosillo (2026-11-23T15:00:00.000Z)
  const aperturaLunes = modulo.calcularSiguienteApertura(
    new Date("2026-11-21T02:00:00Z")
  );
  assert.equal(aperturaLunes.toISOString(), "2026-11-23T15:00:00.000Z");

  // Madrugada de Lunes 16 Nov 2026 a las 06:15 Hermosillo (2026-11-16T13:15:00Z)
  // Debe abrir ese mismo Lunes a las 08:00 Hermosillo (2026-11-16T15:00:00.000Z)
  const aperturaMismoDia = modulo.calcularSiguienteApertura(
    new Date("2026-11-16T13:15:00Z")
  );
  assert.equal(aperturaMismoDia.toISOString(), "2026-11-16T15:00:00.000Z");
});

// ============================================================================
// 3. Pruebas de [EQ-106 / HU9-5] y [EQ-107 / HU9-6]: Validaciones y Endpoints HTTP
// ============================================================================

test("[EQ-107 / HU9-6] Validador rechaza decimales, negativos, unidades inválidas, fuera de rango (1h..30d), horarios invertidos y segunda ventana", () => {
  const base = crearConfiguracionInicial();

  // 1. Decimal, negativo y unidad inválida
  const v1 = validarConfiguracionMensajes({
    ...base,
    tiempoMaximoEsperaRespuesta: { valor: 1.5, unidad: "horas" },
    tiempoEsperaContactoPrevio: { valor: 10, unidad: "minutos" },
  });
  assert.equal(v1.valido, false);
  assert.ok(v1.errores.tiempoMaximoEsperaRespuesta);
  assert.ok(v1.errores.tiempoEsperaContactoPrevio);

  // 2. Fuera de rango (> 30 días / 720 horas y < 1 hora)
  const v2 = validarConfiguracionMensajes({
    ...base,
    tiempoMaximoEsperaRespuesta: { valor: 31, unidad: "dias" },
    tiempoEsperaContactoPrevio: { valor: 0, unidad: "horas" },
  });
  assert.equal(v2.valido, false);
  assert.ok(v2.errores.tiempoMaximoEsperaRespuesta);
  assert.ok(v2.errores.tiempoEsperaContactoPrevio);

  // 3. Horario con inicio >= fin y formato inválido
  const v3 = validarConfiguracionMensajes({
    ...base,
    jornada: {
      ...base.jornada,
      lunes: { habilitado: true, horaInicio: "18:00", horaFin: "08:00" },
      martes: { habilitado: true, horaInicio: "25:00", horaFin: "18:00" },
    },
  });
  assert.equal(v3.valido, false);
  assert.ok(v3.errores["jornada.lunes"]);
  assert.ok(v3.errores["jornada.martes"]);

  // 4. Intento de definir una segunda ventana horaria
  const v4 = validarConfiguracionMensajes({
    ...base,
    horarioPermitido: { inicio: "09:00", fin: "17:00" },
  });
  assert.equal(v4.valido, false);
  assert.ok(v4.errores.horarioPermitido);
});

test("[EQ-106 / EQ-107] HTTP GET y PUT /api/v1/mensajes/configuracion aplican control de acceso (401, 403, 200) y guardado atómico con validación (400)", async () => {
  const moduloMensajes = crearModuloMensajes({
    reloj: () => new Date("2026-11-19T15:30:00.000Z"),
  });
  const servidor = crearServidor({ port: 0, moduloMensajes });
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const puerto = servidor.address().port;

  try {
    // 1. Sin sesión -> 401 en GET y PUT
    const getSinSesion = await peticionHttp(puerto, "/api/v1/mensajes/configuracion");
    assert.equal(getSinSesion.status, 401);
    assert.equal(getSinSesion.body.codigo, "SESION_NO_VALIDA");

    const putSinSesion = await peticionHttp(puerto, "/api/mensajes/configuracion", {
      method: "PUT",
      body: crearConfiguracionInicial(),
    });
    assert.equal(putSinSesion.status, 401);
    assert.equal(putSinSesion.body.codigo, "SESION_NO_VALIDA");

    // 2. Sesión con rol Colaborador (00000252115) -> 403 Forbidden en GET y PUT
    const cookieColaborador = await iniciarSesion(puerto, "00000252115", "Password123!");

    const getColaborador = await peticionHttp(puerto, "/api/v1/mensajes/configuracion", {
      headers: { Cookie: cookieColaborador },
    });
    assert.equal(getColaborador.status, 403);
    assert.equal(getColaborador.body.codigo, "SIN_PERMISO");

    const putColaborador = await peticionHttp(puerto, "/api/v1/mensajes/configuracion", {
      method: "PUT",
      headers: { Cookie: cookieColaborador },
      body: crearConfiguracionInicial(),
    });
    assert.equal(putColaborador.status, 403);
    assert.equal(putColaborador.body.codigo, "SIN_PERMISO");

    // 3. Sesión con rol Administrador (00000100001) -> 200 OK en GET (ambas rutas)
    const cookieAdmin = await iniciarSesion(puerto, "00000100001", "AdminPassword2026!");

    const getAdmin = await peticionHttp(puerto, "/api/v1/mensajes/configuracion", {
      headers: { Cookie: cookieAdmin },
    });
    assert.equal(getAdmin.status, 200);
    assert.equal(getAdmin.body.zonaHoraria, "America/Hermosillo");
    assert.equal(getAdmin.body.tiempoMaximoEsperaRespuesta.valor, 24);
    assert.equal(getAdmin.body.tiempoEsperaContactoPrevio.valor, 48);

    const getAdminAlias = await peticionHttp(puerto, "/api/mensajes/configuracion", {
      headers: { Cookie: cookieAdmin },
    });
    assert.equal(getAdminAlias.status, 200);

    // 4. PUT inválido por Administrador -> 400 Bad Request con errores por campo y sin modificar estado
    const payloadInvalido = {
      ...crearConfiguracionInicial(),
      tiempoMaximoEsperaRespuesta: { valor: 45, unidad: "dias" }, // > 30 días
      tiempoEsperaContactoPrevio: { valor: "48", unidad: "horas" }, // string no permitido
      jornada: {
        ...crearConfiguracionInicial().jornada,
        viernes: { habilitado: true, horaInicio: "18:00", horaFin: "09:00" }, // inicio > fin
      },
    };

    const putInvalido = await peticionHttp(puerto, "/api/v1/mensajes/configuracion", {
      method: "PUT",
      headers: { Cookie: cookieAdmin },
      body: payloadInvalido,
    });
    assert.equal(putInvalido.status, 400);
    assert.equal(putInvalido.body.codigo, "CONFIGURACION_INVALIDA");
    assert.ok(putInvalido.body.errores.tiempoMaximoEsperaRespuesta);
    assert.ok(putInvalido.body.errores.tiempoEsperaContactoPrevio);
    assert.ok(putInvalido.body.errores["jornada.viernes"]);

    // Verificar atomicidad: la configuración previa permanece intacta tras el error 400
    const getDespuesDeFallo = await peticionHttp(puerto, "/api/v1/mensajes/configuracion", {
      headers: { Cookie: cookieAdmin },
    });
    assert.equal(getDespuesDeFallo.body.tiempoMaximoEsperaRespuesta.valor, 24);
    assert.equal(getDespuesDeFallo.body.jornada.viernes.horaInicio, "08:00");

    // 5. PUT válido por Administrador -> 200 OK y actualiza interfaz pública de lectura
    const nuevaConfig = {
      zonaHoraria: "America/Hermosillo",
      jornada: {
        ...crearConfiguracionInicial().jornada,
        viernes: { habilitado: true, horaInicio: "09:00", horaFin: "17:00" },
        sabado: { habilitado: true, horaInicio: "09:00", horaFin: "13:00" },
      },
      tiempoMaximoEsperaRespuesta: { valor: 1, unidad: "dias" },
      tiempoEsperaContactoPrevio: { valor: 72, unidad: "horas" },
    };

    const putExitoso = await peticionHttp(puerto, "/api/v1/mensajes/configuracion", {
      method: "PUT",
      headers: { Cookie: cookieAdmin },
      body: nuevaConfig,
    });
    assert.equal(putExitoso.status, 200);
    assert.equal(putExitoso.body.tiempoMaximoEsperaRespuesta.valor, 1);
    assert.equal(putExitoso.body.tiempoMaximoEsperaRespuesta.unidad, "dias");
    assert.equal(putExitoso.body.tiempoMaximoEsperaRespuesta.equivalenciaHoras, 24);
    assert.equal(putExitoso.body.tiempoEsperaContactoPrevio.equivalenciaHoras, 72);
    assert.equal(putExitoso.body.jornada.sabado.habilitado, true);
    assert.equal(putExitoso.body.jornada.sabado.horaInicio, "09:00");
    assert.equal(putExitoso.body.actualizadoPor, "00000100001");
    assert.equal(putExitoso.body.actualizadoEn, "2026-11-19T15:30:00.000Z");

    // Verificar que la interfaz pública de lectura refleja inmediatamente el cambio (sábado 10:00 Hermosillo ahora habilitado)
    assert.equal(
      moduloMensajes.estaDentroDeHorarioPermitido(new Date("2026-11-21T17:00:00Z")),
      true
    );
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
});
