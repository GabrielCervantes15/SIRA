import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { crearServidor } from "../src/servidor.js";
import {
  crearModuloMensajes,
  crearConfiguracionInicial,
  crearValidadorHorarioEnvio,
  crearGuardiaHorarioEnvio,
  ErrorFueraDeHorarioPermitido,
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
// 1. Pruebas Unitarias del Validador y Guardia con HU9-4 (America/Hermosillo)
// ============================================================================

test("[EQ-82 / HU1-6] Validador permite envío dentro de jornada en America/Hermosillo (incluyendo inicio exacto 08:00:00)", () => {
  const modulo = crearModuloMensajes();

  // Lunes 16 Nov 2026 a las 10:00 en America/Hermosillo = 17:00:00Z
  const validador10Am = crearValidadorHorarioEnvio({
    interfazLectura: modulo.interfazLectura,
    reloj: () => new Date("2026-11-16T17:00:00.000Z"),
  });

  const estado10Am = validador10Am.validarEnvioPermitido();
  assert.equal(estado10Am.permitido, true);
  assert.equal(estado10Am.zonaHoraria, "America/Hermosillo");
  assert.equal(estado10Am.diaSemana, "lunes");
  assert.equal(estado10Am.horaActual, "10:00");
  assert.equal(estado10Am.siguienteApertura, null);

  // Borde exacto de apertura: Lunes 08:00:00 America/Hermosillo = 15:00:00Z
  const guardia = crearGuardiaHorarioEnvio({
    validadorHorarioEnvio: validador10Am,
  });
  const estadoBordeInicio = guardia(new Date("2026-11-16T15:00:00.000Z"));
  assert.equal(estadoBordeInicio.permitido, true);
  assert.equal(estadoBordeInicio.horaActual, "08:00");
});

test("[EQ-82 / HU1-6] Validador rechaza con 409 ErrorFueraDeHorarioPermitido antes de 08:00, en borde 18:00:00, noche y fin de semana, calculando siguienteApertura", () => {
  const modulo = crearModuloMensajes();
  const validador = crearValidadorHorarioEnvio({
    interfazLectura: modulo.interfazLectura,
  });

  // 1. Antes de abrir: Lunes 07:59:59 America/Hermosillo (14:59:59Z) -> abre el mismo lunes 08:00 (15:00:00Z)
  assert.throws(
    () => validador.validarEnvioPermitido(new Date("2026-11-16T14:59:59.000Z")),
    (err) => {
      assert.ok(err instanceof ErrorFueraDeHorarioPermitido);
      assert.equal(err.status, 409);
      assert.equal(err.codigo, "FUERA_DE_HORARIO_PERMITIDO");
      assert.equal(err.detalle.diaSemana, "lunes");
      assert.equal(err.detalle.horaActual, "07:59");
      assert.equal(err.detalle.siguienteApertura, "2026-11-16T15:00:00.000Z");
      assert.equal(err.detalle.programadoAutomaticamente, false);
      assert.match(err.message, /08:00 a 18:00/);
      return true;
    }
  );

  // 2. Borde exacto de cierre: Lunes 18:00:00 America/Hermosillo (2026-11-17T01:00:00.000Z)
  assert.throws(
    () => validador.validarEnvioPermitido(new Date("2026-11-17T01:00:00.000Z")),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.detalle.diaSemana, "lunes");
      assert.equal(err.detalle.horaActual, "18:00");
      assert.equal(err.detalle.siguienteApertura, "2026-11-17T15:00:00.000Z"); // Martes 08:00 Hermosillo
      return true;
    }
  );

  // 3. Viernes en la noche: Viernes 20:00 America/Hermosillo (2026-11-21T03:00:00.000Z) -> salta fin de semana a Lunes 08:00
  assert.throws(
    () => validador.validarEnvioPermitido(new Date("2026-11-21T03:00:00.000Z")),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.detalle.diaSemana, "viernes");
      assert.equal(err.detalle.horaActual, "20:00");
      assert.equal(err.detalle.siguienteApertura, "2026-11-23T15:00:00.000Z");
      assert.match(err.message, /lunes a las 08:00/i);
      return true;
    }
  );

  // 4. Sábado deshabilitado: Sábado 11:00 America/Hermosillo (2026-11-21T18:00:00.000Z)
  assert.throws(
    () => validador.validarEnvioPermitido(new Date("2026-11-21T18:00:00.000Z")),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.detalle.diaSemana, "sabado");
      assert.equal(err.detalle.horarioDiaActual.habilitado, false);
      assert.equal(err.detalle.siguienteApertura, "2026-11-23T15:00:00.000Z");
      assert.match(err.message, /no tiene envíos habilitados/i);
      return true;
    }
  );

  // 5. Domingo deshabilitado: Domingo 12:00 America/Hermosillo (2026-11-22T19:00:00.000Z)
  assert.throws(
    () => validador.validarEnvioPermitido(new Date("2026-11-22T19:00:00.000Z")),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.detalle.diaSemana, "domingo");
      assert.equal(err.detalle.horarioDiaActual.habilitado, false);
      assert.equal(err.detalle.siguienteApertura, "2026-11-23T15:00:00.000Z");
      return true;
    }
  );
});

// ============================================================================
// 2. Pruebas HTTP Reales sobre crearServidor con reloj controlado e integración HU9
// ============================================================================

test("[EQ-82 / HU1-6] HTTP vista-previa permite consultar fuera de horario (200) y enviar rechaza fuera de horario (409) sin mutar estado ni confiar en fecha del cliente", async () => {
  // Iniciar reloj del servidor en Viernes 20 Nov 2026 a las 19:30 America/Hermosillo (2026-11-21T02:30:00.000Z -> fuera de horario)
  let instanteActualMs = Date.parse("2026-11-21T02:30:00.000Z");
  const historialMonitoreo = [];

  const servidor = crearServidor({
    port: 0,
    reloj: () => instanteActualMs,
    duracionSesionMs: 7 * 24 * 3600 * 1000,
    historialMonitoreo,
  });

  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const puerto = servidor.address().port;

  try {
    // Iniciar sesión como colaborador Sebastián (00000252115 / colab-001)
    const cookieColaborador = await iniciarSesion(
      puerto,
      "00000252115",
      "Password123!"
    );

    // 1. Vista previa fuera de horario: responde 200 OK, calcula elegibles pero dentroDeHorario === false
    const resVistaPrevia = await peticionHttp(
      puerto,
      "/api/v1/disparo-mensajes/vista-previa?semaforos=ROJO,NARANJA&carreras=Ingenier%C3%ADa%20en%20Software&inactividadValor=7&inactividadUnidad=DIAS",
      { headers: { Cookie: cookieColaborador } }
    );
    assert.equal(resVistaPrevia.status, 200);
    assert.equal(resVistaPrevia.body.valido, true);
    assert.equal(resVistaPrevia.body.dentroDeHorario, false);
    assert.ok(resVistaPrevia.body.total > 0);
    assert.equal(resVistaPrevia.body.estadoHorario.permitido, false);
    assert.equal(resVistaPrevia.body.estadoHorario.diaSemana, "viernes");
    assert.equal(
      resVistaPrevia.body.estadoHorario.siguienteApertura,
      "2026-11-23T15:00:00.000Z"
    );

    // 2. Intentar enviar fuera de horario (incluso mandando una fecha falsa dentro de horario en body y headers)
    const resEnviarFuera = await peticionHttp(
      puerto,
      "/api/v1/disparo-mensajes/enviar",
      {
        method: "POST",
        headers: {
          Cookie: cookieColaborador,
          "X-Fecha-Cliente": "2026-11-16T16:00:00.000Z",
        },
        body: {
          semaforos: ["ROJO", "NARANJA"],
          carreras: ["Ingeniería en Software"],
          inactividadValor: 7,
          inactividadUnidad: "DIAS",
          enviarPorCorreo: true,
          fechaCliente: "2026-11-16T16:00:00.000Z",
          dentroDeHorario: true,
        },
      }
    );

    assert.equal(resEnviarFuera.status, 409);
    assert.equal(resEnviarFuera.body.codigo, "FUERA_DE_HORARIO_PERMITIDO");
    assert.equal(resEnviarFuera.body.detalle.diaSemana, "viernes");
    assert.equal(resEnviarFuera.body.detalle.programadoAutomaticamente, false);
    assert.equal(historialMonitoreo.length, 0); // No se escribió nada en historial

    // 3. Mover el reloj del servidor a Lunes 23 Nov 2026 a las 09:00 America/Hermosillo (16:00:00Z -> dentro de horario)
    instanteActualMs = Date.parse("2026-11-23T16:00:00.000Z");

    const resEnviarDentro = await peticionHttp(
      puerto,
      "/api/v1/disparo-mensajes/enviar",
      {
        method: "POST",
        headers: { Cookie: cookieColaborador },
        body: {
          semaforos: ["ROJO", "NARANJA"],
          carreras: ["Ingeniería en Software"],
          inactividadValor: 7,
          inactividadUnidad: "DIAS",
          enviarPorCorreo: true,
        },
      }
    );

    assert.equal(resEnviarDentro.status, 200);
    assert.ok(resEnviarDentro.body.totalEnviados > 0);
    // EQ-85: el envío lo hacen las colas después de responder; se espera a que terminen.
    // EQ-87 registra un evento por canal: se cuentan los de WhatsApp (uno por aspirante notificado).
    await servidor.esperarEnviosHU1();
    assert.equal(
      historialMonitoreo.filter((evento) => evento.metadatos?.canal !== "CORREO").length,
      resEnviarDentro.body.totalEnviados
    );
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
});

test("[EQ-82 / HU1-6] Integración viva con HU9: cambio de jornada por Administrador vía PUT /api/v1/mensajes/configuracion actualiza inmediatamente la validación de envío en HU1", async () => {
  // Reloj en Sábado 21 Nov 2026 a las 10:00 America/Hermosillo (17:00:00Z)
  const sabado10AmMs = Date.parse("2026-11-21T17:00:00.000Z");
  const historialMonitoreo = [];

  const servidor = crearServidor({
    port: 0,
    reloj: () => sabado10AmMs,
    historialMonitoreo,
  });

  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const puerto = servidor.address().port;

  try {
    const cookieColaborador = await iniciarSesion(
      puerto,
      "00000252115",
      "Password123!"
    );
    const cookieAdmin = await iniciarSesion(
      puerto,
      "00000100001",
      "AdminPassword2026!"
    );

    const lotePayload = {
      semaforos: ["ROJO", "NARANJA"],
      carreras: ["Ingeniería en Software"],
      inactividadValor: 7,
      inactividadUnidad: "DIAS",
      enviarPorCorreo: false,
    };

    // 1. Inicialmente el sábado está deshabilitado -> POST /enviar responde 409
    const intentoSabadoCerrado = await peticionHttp(
      puerto,
      "/api/v1/disparo-mensajes/enviar",
      {
        method: "POST",
        headers: { Cookie: cookieColaborador },
        body: lotePayload,
      }
    );
    assert.equal(intentoSabadoCerrado.status, 409);
    assert.equal(intentoSabadoCerrado.body.codigo, "FUERA_DE_HORARIO_PERMITIDO");
    assert.equal(intentoSabadoCerrado.body.detalle.diaSemana, "sabado");
    assert.equal(historialMonitoreo.length, 0);

    // 2. El Administrador habilita el sábado de 09:00 a 13:00 en HU9
    const nuevaConfig = {
      ...crearConfiguracionInicial(),
      jornada: {
        ...crearConfiguracionInicial().jornada,
        sabado: { habilitado: true, horaInicio: "09:00", horaFin: "13:00" },
      },
    };

    const resPutConfig = await peticionHttp(
      puerto,
      "/api/v1/mensajes/configuracion",
      {
        method: "PUT",
        headers: { Cookie: cookieAdmin },
        body: nuevaConfig,
      }
    );
    assert.equal(resPutConfig.status, 200);

    // 3. Ahora el colaborador intenta enviar en el mismo instante (Sábado 10:00 Hermosillo) -> 200 OK
    const intentoSabadoHabilitado = await peticionHttp(
      puerto,
      "/api/v1/disparo-mensajes/enviar",
      {
        method: "POST",
        headers: { Cookie: cookieColaborador },
        body: lotePayload,
      }
    );
    assert.equal(intentoSabadoHabilitado.status, 200);
    assert.ok(intentoSabadoHabilitado.body.totalEnviados > 0);
    // EQ-85: el envío lo hacen las colas después de responder; se espera a que terminen.
    // EQ-87 registra un evento por canal: se cuentan los de WhatsApp (uno por aspirante notificado).
    await servidor.esperarEnviosHU1();
    assert.equal(
      historialMonitoreo.filter((evento) => evento.metadatos?.canal !== "CORREO").length,
      intentoSabadoHabilitado.body.totalEnviados
    );
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
});
