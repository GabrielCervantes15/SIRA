import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { crearServidor } from "../src/servidor.js";
import { crearBusEnMemoria } from "../src/compartido/eventos/bus-en-memoria.js";
import {
  EXCHANGE_EVENTOS,
  TIPO_CONFIGURACION_ACTUALIZADA,
  VERSION_EVENTO,
  crearEventoConfiguracionActualizada,
  validarEventoConfiguracionActualizada,
  crearModuloMensajes,
  crearConfiguracionInicial,
  crearInterfazLecturaConfiguracion,
  GuardarConfiguracionCasoUso,
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
// 1. Migración SQL 04_bitacora_configuracion_mensajes.sql e init-schemas.sql
// ============================================================================

test("[EQ-108 / HU9-7] Migración SQL 04_bitacora_configuracion_mensajes.sql e init-schemas.sql definen tabla e índices de bitácora", async () => {
  const sqlMigracion = await readFile(
    new URL(
      "../docker/postgres/migrations/04_bitacora_configuracion_mensajes.sql",
      import.meta.url
    ),
    "utf8"
  );
  const sqlInit = await readFile(
    new URL("../docker/postgres/init-schemas.sql", import.meta.url),
    "utf8"
  );

  assert.match(sqlInit, /CREATE SCHEMA IF NOT EXISTS mensajes/i);
  assert.match(sqlInit, /GRANT ALL PRIVILEGES ON SCHEMA mensajes/i);

  assert.match(
    sqlMigracion,
    /CREATE TABLE IF NOT EXISTS mensajes\.configuracion_bitacora/i
  );
  assert.match(sqlMigracion, /id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
  assert.match(sqlMigracion, /usuario_id VARCHAR\(50\) NOT NULL/i);
  assert.match(sqlMigracion, /fecha_cambio TIMESTAMPTZ NOT NULL/i);
  assert.match(sqlMigracion, /valor_anterior JSONB NOT NULL/i);
  assert.match(sqlMigracion, /valor_nuevo JSONB NOT NULL/i);
  assert.match(
    sqlMigracion,
    /CREATE INDEX IF NOT EXISTS idx_configuracion_bitacora_fecha\s+ON mensajes\.configuracion_bitacora\s*\(fecha_cambio DESC\)/i
  );
  assert.match(
    sqlMigracion,
    /CREATE INDEX IF NOT EXISTS idx_configuracion_bitacora_usuario\s+ON mensajes\.configuracion_bitacora\s*\(usuario_id\)/i
  );
});

// ============================================================================
// 2. Contrato y validación del evento mensajes.configuracion.actualizada
// ============================================================================

test("[EQ-108 / HU9-7] crearEventoConfiguracionActualizada y validarEventoConfiguracionActualizada validan casos correctos y mal formados", () => {
  assert.equal(EXCHANGE_EVENTOS, "crm.eventos");
  assert.equal(TIPO_CONFIGURACION_ACTUALIZADA, "mensajes.configuracion.actualizada");
  assert.equal(VERSION_EVENTO, 1);

  const valorAnterior = crearConfiguracionInicial();
  const valorNuevo = {
    ...crearConfiguracionInicial(),
    tiempoMaximoEsperaRespuesta: {
      valor: 48,
      unidad: "horas",
      equivalenciaHoras: 48,
    },
  };

  const eventoValido = crearEventoConfiguracionActualizada(
    {
      bitacoraId: "bit-001",
      usuarioId: "00000100001",
      fechaCambio: "2026-11-20T15:00:00.000Z",
      valorAnterior,
      valorNuevo,
    },
    {
      ahora: () => new Date("2026-11-20T15:00:01.000Z"),
      generarId: () => "evt-config-001",
    }
  );

  assert.equal(eventoValido.eventId, "evt-config-001");
  assert.equal(eventoValido.tipo, "mensajes.configuracion.actualizada");
  assert.equal(eventoValido.version, 1);
  assert.equal(eventoValido.publicadoEn, "2026-11-20T15:00:01.000Z");
  assert.equal(eventoValido.datos.bitacoraId, "bit-001");
  assert.equal(eventoValido.datos.usuarioId, "00000100001");

  const resultadoValido = validarEventoConfiguracionActualizada(eventoValido);
  assert.equal(resultadoValido.valido, true);
  assert.deepEqual(resultadoValido.errores, []);

  // Casos inválidos
  assert.equal(validarEventoConfiguracionActualizada(null).valido, false);

  const eventoInvalido = {
    eventId: "",
    tipo: "evento.incorrecto",
    version: 99,
    publicadoEn: "fecha-invalida",
    datos: {
      usuarioId: "",
      fechaCambio: "no-iso",
      valorAnterior: null,
      valorNuevo: {
        ...crearConfiguracionInicial(),
        tiempoMaximoEsperaRespuesta: { valor: -5, unidad: "horas" },
      },
    },
  };

  const resultadoInvalido = validarEventoConfiguracionActualizada(eventoInvalido);
  assert.equal(resultadoInvalido.valido, false);
  assert.ok(resultadoInvalido.errores.length >= 6);
});

// ============================================================================
// 3. Registro de bitácora en múltiples cambios consecutivos (más reciente primero)
// ============================================================================

test("[EQ-108 / HU9-7] Bitácora registra quién, cuándo, valorAnterior y valorNuevo en múltiples cambios consecutivos ordenados del más reciente al más antiguo", async () => {
  let contadorTiempo = 0;
  const marcasTiempo = [
    new Date("2026-11-20T10:00:00.000Z"),
    new Date("2026-11-20T11:00:00.000Z"),
  ];
  let contadorIds = 0;

  const modulo = crearModuloMensajes({
    reloj: () => marcasTiempo[contadorTiempo++] || new Date("2026-11-20T12:00:00.000Z"),
    generarId: () => `id-generado-${++contadorIds}`,
  });

  const adminContexto = {
    usuario: { idInstitucional: "00000100001", rol: "administrador" },
  };

  // Cambio 1: Espera respuesta de 24h -> 12h
  const cambio1 = {
    ...crearConfiguracionInicial(),
    tiempoMaximoEsperaRespuesta: { valor: 12, unidad: "horas" },
  };
  await modulo.guardarConfiguracionCasoUso.ejecutar(cambio1, adminContexto);

  // Cambio 2: Espera respuesta de 12h -> 2 días (48h) y sábado habilitado
  const cambio2 = {
    ...crearConfiguracionInicial(),
    tiempoMaximoEsperaRespuesta: { valor: 2, unidad: "dias" },
    jornada: {
      ...crearConfiguracionInicial().jornada,
      sabado: { habilitado: true, horaInicio: "09:00", horaFin: "13:00" },
    },
  };
  await modulo.guardarConfiguracionCasoUso.ejecutar(cambio2, adminContexto);

  const bitacora = await modulo.listarBitacoraConfiguracionCasoUso.ejecutar(
    adminContexto
  );

  assert.equal(bitacora.total, 2);
  assert.equal(bitacora.registros.length, 2);

  // El primero en la lista debe ser el cambio 2 (más reciente: 11:00)
  const masReciente = bitacora.registros[0];
  assert.equal(masReciente.usuarioId, "00000100001");
  assert.equal(masReciente.fechaCambio, "2026-11-20T11:00:00.000Z");
  assert.equal(masReciente.valorAnterior.tiempoMaximoEsperaRespuesta.valor, 12);
  assert.equal(masReciente.valorAnterior.jornada.sabado.habilitado, false);
  assert.equal(masReciente.valorNuevo.tiempoMaximoEsperaRespuesta.valor, 2);
  assert.equal(masReciente.valorNuevo.tiempoMaximoEsperaRespuesta.unidad, "dias");
  assert.equal(masReciente.valorNuevo.jornada.sabado.habilitado, true);

  // El segundo debe ser el cambio 1 (10:00) cuyo valorAnterior tenía las 24h iniciales
  const masAntiguo = bitacora.registros[1];
  assert.equal(masAntiguo.usuarioId, "00000100001");
  assert.equal(masAntiguo.fechaCambio, "2026-11-20T10:00:00.000Z");
  assert.equal(masAntiguo.valorAnterior.tiempoMaximoEsperaRespuesta.valor, 24);
  assert.equal(masAntiguo.valorNuevo.tiempoMaximoEsperaRespuesta.valor, 12);
});

// ============================================================================
// 4. Atomicidad en PostgreSQL: fallo en bitácora hace ROLLBACK y no publica evento
// ============================================================================

test("[EQ-108 / HU9-7] RepositorioConfiguracionPostgres inserta bitácora en la misma transacción y hace ROLLBACK ni publica evento si falla la bitácora", async () => {
  const sentencias = [];
  let fallarInsertBitacora = false;

  const dbSimulado = {
    async query(sql, params) {
      const sqlLimpio = sql.trim();
      sentencias.push({ sql: sqlLimpio, params });
      if (
        fallarInsertBitacora &&
        sqlLimpio.includes("INSERT INTO mensajes.configuracion_bitacora")
      ) {
        throw new Error("Fallo simulado al insertar en configuracion_bitacora");
      }
      return { rows: [] };
    },
  };

  const repoPg = new RepositorioConfiguracionPostgres({ db: dbSimulado });
  const bus = crearBusEnMemoria();
  const casoUso = new GuardarConfiguracionCasoUso({
    repositorioConfiguracion: repoPg,
    busEventos: bus,
  });

  const contextoAdmin = {
    usuario: { idInstitucional: "00000100001", rol: "administrador" },
  };

  // 1. Ejecución exitosa: BEGIN -> SELECT/UPSERT/INSERT bitácora -> COMMIT y 1 evento publicado
  await casoUso.ejecutar(crearConfiguracionInicial(), contextoAdmin);
  assert.equal(sentencias[0].sql, "BEGIN");
  assert.ok(
    sentencias.some((s) =>
      s.sql.includes("INSERT INTO mensajes.configuracion_bitacora")
    )
  );
  assert.equal(sentencias[sentencias.length - 1].sql, "COMMIT");
  assert.equal(bus.publicados().length, 1);

  // 2. Fallo al insertar en bitácora: ejecuta ROLLBACK y NO publica nuevo evento
  sentencias.length = 0;
  fallarInsertBitacora = true;

  await assert.rejects(
    () => casoUso.ejecutar(crearConfiguracionInicial(), contextoAdmin),
    /Fallo simulado al insertar en configuracion_bitacora/
  );

  assert.equal(sentencias[0].sql, "BEGIN");
  assert.equal(sentencias[sentencias.length - 1].sql, "ROLLBACK");
  assert.equal(bus.publicados().length, 1); // Sigue siendo 1, no se publicó un segundo evento
});

// ============================================================================
// 5. Errores de validación (400) o autorización (401/403) no registran bitácora ni evento
// ============================================================================

test("[EQ-108 / HU9-7] Errores 400, 401 o 403 no registran entradas en bitácora ni publican eventos", async () => {
  const bus = crearBusEnMemoria();
  const modulo = crearModuloMensajes({ busEventos: bus });

  // 401 Sin sesión
  await assert.rejects(
    () => modulo.guardarConfiguracionCasoUso.ejecutar(crearConfiguracionInicial(), {}),
    (err) => err.status === 401
  );

  // 403 Rol colaborador
  await assert.rejects(
    () =>
      modulo.guardarConfiguracionCasoUso.ejecutar(crearConfiguracionInicial(), {
        usuario: { idInstitucional: "00000252115", rol: "colaborador" },
      }),
    (err) => err.status === 403
  );

  // 400 Configuración inválida por administrador
  await assert.rejects(
    () =>
      modulo.guardarConfiguracionCasoUso.ejecutar(
        {
          ...crearConfiguracionInicial(),
          tiempoMaximoEsperaRespuesta: { valor: 0, unidad: "horas" },
        },
        { usuario: { idInstitucional: "00000100001", rol: "administrador" } }
      ),
    (err) => err.status === 400
  );

  const bitacora = await modulo.repositorio.listarBitacora();
  assert.equal(bitacora.total, 0);
  assert.equal(bus.publicados().length, 0);
});

// ============================================================================
// 6. Publicación en bus y refresco reactivo en memoria de consumidores desacoplados (HU1)
// ============================================================================

test("[EQ-108 / HU9-7] El evento mensajes.configuracion.actualizada refresca automáticamente instancias independientes de lectura y consumidores suscritos (HU1)", async () => {
  const bus = crearBusEnMemoria();

  // Módulo principal que administra la configuración
  const moduloAdmin = crearModuloMensajes({ busEventos: bus });

  // Instancia de lectura independiente (con su propio repositorio separado) suscrita al bus
  const lecturaConsumidorHu1 = crearInterfazLecturaConfiguracion({
    repositorioConfiguracion: new RepositorioConfiguracionMemoria(),
    busEventos: bus,
  });

  // Estado caché simulado de otro módulo (por ejemplo, el planificador de lotes de HU1)
  let cacheExternaHu1 = {
    horasContactoPrevio:
      lecturaConsumidorHu1.obtenerConfiguracionVigente().tiempoEsperaContactoPrevio
        .equivalenciaHoras,
    eventosRecibidos: 0,
  };

  bus.suscribir("mensajes.configuracion.#", (evento) => {
    const validacion = validarEventoConfiguracionActualizada(evento);
    if (validacion.valido) {
      cacheExternaHu1 = {
        horasContactoPrevio:
          evento.datos.valorNuevo.tiempoEsperaContactoPrevio.equivalenciaHoras,
        eventosRecibidos: cacheExternaHu1.eventosRecibidos + 1,
      };
    }
  });

  // Antes del cambio: sábado deshabilitado y espera de contacto previo = 48 horas
  const sabado10AmHermosillo = new Date("2026-11-21T17:00:00.000Z");
  assert.equal(
    lecturaConsumidorHu1.estaDentroDeHorarioPermitido(sabado10AmHermosillo),
    false
  );
  assert.equal(cacheExternaHu1.horasContactoPrevio, 48);

  // El administrador guarda nueva configuración: habilita sábado 09:00-13:00 y contacto previo = 3 días (72h)
  const nuevaConfig = {
    ...crearConfiguracionInicial(),
    tiempoEsperaContactoPrevio: { valor: 3, unidad: "dias" },
    jornada: {
      ...crearConfiguracionInicial().jornada,
      sabado: { habilitado: true, horaInicio: "09:00", horaFin: "13:00" },
    },
  };

  await moduloAdmin.guardarConfiguracionCasoUso.ejecutar(nuevaConfig, {
    usuario: { idInstitucional: "00000100001", rol: "administrador" },
  });

  // Verificar que el evento se publicó en el bus y es válido
  const publicados = bus.publicados();
  assert.equal(publicados.length, 1);
  assert.equal(publicados[0].routingKey, TIPO_CONFIGURACION_ACTUALIZADA);
  assert.equal(
    validarEventoConfiguracionActualizada(publicados[0].evento).valido,
    true
  );

  // Verificar que la instancia independiente de lectura se refrescó automáticamente vía evento
  assert.equal(
    lecturaConsumidorHu1.estaDentroDeHorarioPermitido(sabado10AmHermosillo),
    true
  );
  assert.equal(
    lecturaConsumidorHu1.obtenerConfiguracionVigente().tiempoEsperaContactoPrevio
      .equivalenciaHoras,
    72
  );

  // Verificar que el consumidor simulado de HU1 también refrescó su estado
  assert.equal(cacheExternaHu1.eventosRecibidos, 1);
  assert.equal(cacheExternaHu1.horasContactoPrevio, 72);

  // Si detenemos la suscripción, futuros eventos ya no modifican esa instancia
  lecturaConsumidorHu1.detenerSuscripcion();
});

// ============================================================================
// 7. Endpoint HTTP GET /api/v1/mensajes/configuracion/bitacora (401, 403, 200)
// ============================================================================

test("[EQ-108 / HU9-7] HTTP GET /api/v1/mensajes/configuracion/bitacora valida permisos (401, 403, 200) y devuelve el historial de cambios", async () => {
  const servidor = crearServidor({ port: 0 });
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const puerto = servidor.address().port;

  try {
    // 1. Sin sesión -> 401
    const sinSesion = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion/bitacora"
    );
    assert.equal(sinSesion.status, 401);
    assert.equal(sinSesion.body.codigo, "SESION_NO_VALIDA");

    // 2. Con rol Colaborador -> 403
    const cookieColaborador = await iniciarSesion(
      puerto,
      "00000252115",
      "Password123!"
    );
    const comoColaborador = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion/bitacora",
      { headers: { Cookie: cookieColaborador } }
    );
    assert.equal(comoColaborador.status, 403);
    assert.equal(comoColaborador.body.codigo, "SIN_PERMISO");

    // 3. Con rol Administrador -> 200 OK (inicialmente vacía)
    const cookieAdmin = await iniciarSesion(
      puerto,
      "00000100001",
      "AdminPassword2026!"
    );
    const bitacoraInicial = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion/bitacora",
      { headers: { Cookie: cookieAdmin } }
    );
    assert.equal(bitacoraInicial.status, 200);
    assert.equal(bitacoraInicial.body.total, 0);
    assert.deepEqual(bitacoraInicial.body.registros, []);

    // 4. Guardar un cambio vía PUT y consultar bitácora en ambas rutas (/api/v1/... y /api/...)
    const nuevoPayload = {
      ...crearConfiguracionInicial(),
      tiempoMaximoEsperaRespuesta: { valor: 36, unidad: "horas" },
    };

    const resPut = await peticionHttp(puerto, "/api/v1/mensajes/configuracion", {
      method: "PUT",
      headers: { Cookie: cookieAdmin },
      body: nuevoPayload,
    });
    assert.equal(resPut.status, 200);

    const bitacoraDespues = await peticionHttp(
      puerto,
      "/api/mensajes/configuracion/bitacora",
      { headers: { Cookie: cookieAdmin } }
    );
    assert.equal(bitacoraDespues.status, 200);
    assert.equal(bitacoraDespues.body.total, 1);
    assert.equal(bitacoraDespues.body.registros[0].usuarioId, "00000100001");
    assert.equal(
      bitacoraDespues.body.registros[0].valorAnterior.tiempoMaximoEsperaRespuesta
        .valor,
      24
    );
    assert.equal(
      bitacoraDespues.body.registros[0].valorNuevo.tiempoMaximoEsperaRespuesta
        .valor,
      36
    );
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
});
