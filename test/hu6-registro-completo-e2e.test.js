import { test } from "node:test";
import assert from "node:assert/strict";
import { crearServidor } from "../src/servidor.js";
import { crearProveedorAutenticacionSimulado } from "../src/modulos/autenticacion/index.js";
import { crearModuloMonitoreo } from "../src/modulos/monitoreo/index.js";
import { crearBusEnMemoria } from "../src/compartido/eventos/bus-en-memoria.js";

const ADMIN_ID = "00000100001";
const NUEVO_COLAB_ID = "00000247933";
const CAMPUS_PRUEBA = "Campus Obregón Náinari";
const CARRERA_PRUEBA = "Ingeniería en Software";

function crearContextoPrueba() {
  const usuarios = [
    {
      idInstitucional: ADMIN_ID,
      password: "AdminPassword2026!",
      nombreCompleto: "Mtra. Alma Leticia Chávez Quintero",
      correoInstitucional: "alma.chavez@itson.edu.mx",
      telefono: "+526449998877",
      activo: true,
    },
    {
      idInstitucional: NUEVO_COLAB_ID,
      password: "Password123!",
      nombreCompleto: "Nomar Alberto Limón Quintero",
      correoInstitucional: "nomar.limon247933@potros.itson.edu.mx",
      telefono: "+526443334455",
      activo: true,
    },
  ];

  const usuariosCrm = [
    { idInstitucional: ADMIN_ID, rol: "administrador", activo: true },
    { idInstitucional: NUEVO_COLAB_ID, rol: "colaborador", activo: true },
  ];

  const aspirantesSemilla = [
    {
      id: "asp-e2e-1",
      folioSolicitud: "FOL-2026-9001",
      nombreCompleto: "Aspirante Prueba Uno",
      correo: "uno@ejemplo.mx",
      telefono: "+526441000001",
      campus: CAMPUS_PRUEBA,
      carreraSolicitada: CARRERA_PRUEBA,
      preparatoriaProcedencia: "CBTIS 37",
      periodo: "2027-1",
      fechaSolicitud: "2026-10-15T09:00:00Z",
      estadoSolicitud: "EN_REVISION",
      semaforo: "ROJO",
      colaboradorId: "colab-anterior",
      fechaUltimaActividad: "2026-10-25T14:30:00Z",
    },
    {
      id: "asp-e2e-2",
      folioSolicitud: "FOL-2026-9002",
      nombreCompleto: "Aspirante Prueba Dos",
      correo: "dos@ejemplo.mx",
      telefono: "+526441000002",
      campus: CAMPUS_PRUEBA,
      carreraSolicitada: "Licenciatura en Administración",
      preparatoriaProcedencia: "COBACH Obregón 1",
      periodo: "2027-1",
      fechaSolicitud: "2026-10-18T11:15:00Z",
      estadoSolicitud: "RECIBIDA",
      semaforo: "NARANJA",
      colaboradorId: "colab-anterior",
      fechaUltimaActividad: "2026-10-28T16:45:00Z",
    },
  ];

  const conversacionesSemilla = [
    {
      id: "msg-e2e-1",
      aspiranteId: "asp-e2e-1",
      direccion: "SALIENTE",
      remitenteTipo: "BOT_IA",
      contenido: "Bienvenido al proceso de admisión.",
      fechaEnvio: "2026-10-16T10:00:00Z",
    },
    {
      id: "msg-e2e-2",
      aspiranteId: "asp-e2e-1",
      direccion: "ENTRANTE",
      remitenteTipo: "ASPIRANTE",
      contenido: "Muchas gracias, subiré mi constancia hoy.",
      fechaEnvio: "2026-10-16T10:05:00Z",
    },
  ];

  const bus = crearBusEnMemoria();
  const moduloMonitoreo = crearModuloMonitoreo({
    datosSemilla: {
      aspirantes: aspirantesSemilla,
      conversaciones: conversacionesSemilla,
    },
  });

  const servidor = crearServidor({
    usuarios,
    usuariosCrm,
    proveedor: crearProveedorAutenticacionSimulado({ usuarios }),
    moduloMonitoreo,
    bus,
  });

  return { servidor, bus, moduloMonitoreo };
}

/**
 * Helper que invoca rutas del servidor HTTP directamente en memoria sin depender
 * de abrir puertos TCP cuando el entorno se ejecuta en sandbox restringido.
 */
async function invocarServidor(servidor, { method = "GET", url = "/", headers = {}, body } = {}) {
  const { Readable } = await import("node:stream");
  const req = new Readable({
    read() {
      if (body !== undefined) {
        const payload = typeof body === "string" ? body : JSON.stringify(body);
        this.push(Buffer.from(payload, "utf8"));
      }
      this.push(null);
    },
  });
  req.url = url;
  req.method = method;
  req.headers = {
    host: "localhost",
    ...(body !== undefined ? { "content-type": "application/json" } : {}),
    ...headers,
  };
  req.destroy = () => {};

  return new Promise((resolve) => {
    const resHeaders = {};
    let statusCode = 200;
    let bodyTexto = "";

    const res = {
      headersSent: false,
      destroyed: false,
      writeHead(status, hdrs = {}) {
        statusCode = status;
        this.headersSent = true;
        for (const [k, v] of Object.entries(hdrs)) {
          resHeaders[k.toLowerCase()] = v;
        }
      },
      end(chunk = "") {
        if (chunk) bodyTexto += chunk;
        let json = null;
        try {
          json = bodyTexto ? JSON.parse(bodyTexto) : null;
        } catch {
          json = null;
        }
        resolve({ status: statusCode, headers: resHeaders, body: json, text: bodyTexto });
      },
    };

    servidor.emit("request", req, res);
  });
}

async function loginComoAdmin(servidor) {
  const loginRes = await invocarServidor(servidor, {
    method: "POST",
    url: "/api/v1/auth/login",
    body: { identificador: ADMIN_ID, password: "AdminPassword2026!" },
  });
  assert.equal(loginRes.status, 200);
  const cookie = loginRes.headers["set-cookie"]?.split(";")[0];
  assert.ok(cookie, "Debe devolver cookie de sesión administrativa");
  return cookie;
}

// ---------- Casos de Prueba API y E2E [HU6-22] (Rama 6A: Registro y Bloqueos) ----------

test("[HU6-22] 1. Bloqueo (HTTP 400) al intentar registrar un colaborador sin enviar un campus", async () => {
  const { servidor, bus } = crearContextoPrueba();
  const cookie = await loginComoAdmin(servidor);

  const respuesta = await invocarServidor(servidor, {
    method: "POST",
    url: "/api/v1/colaboradores/registro",
    headers: { cookie },
    body: {
      idInstitucional: NUEVO_COLAB_ID,
      campus: "", // Sin campus
      carreras: [CARRERA_PRUEBA],
    },
  });

  assert.equal(respuesta.status, 400);
  assert.equal(respuesta.body.codigo, "CAMPUS_OBLIGATORIO");
  assert.equal(bus.publicados().length, 0, "No debe publicar eventos si el registro fue bloqueado");
});

test("[HU6-22] 2. Bloqueo (HTTP 400) al intentar registrar sin seleccionar al menos una carrera", async () => {
  const { servidor, bus } = crearContextoPrueba();
  const cookie = await loginComoAdmin(servidor);

  const respuestaSinArreglo = await invocarServidor(servidor, {
    method: "POST",
    url: "/api/v1/colaboradores/registro",
    headers: { cookie },
    body: {
      idInstitucional: NUEVO_COLAB_ID,
      campus: CAMPUS_PRUEBA,
      carreras: [], // Cero carreras seleccionadas
    },
  });

  assert.equal(respuestaSinArreglo.status, 400);
  assert.equal(respuestaSinArreglo.body.codigo, "CARRERAS_OBLIGATORIAS");
  assert.equal(bus.publicados().length, 0, "No debe publicar eventos cuando faltan carreras");
});

test("[HU6-22] 3. Éxito (HTTP 201) en un registro completo, validando asignación correcta, transferencia de conversación (HU6-4) y envío de evento al bus", async () => {
  const { servidor, bus } = crearContextoPrueba();
  const cookieAdmin = await loginComoAdmin(servidor);

  const eventosRecibidos = [];
  bus.suscribir("colaboradores.#", (evento) => {
    eventosRecibidos.push(evento);
  });

  // Ejecutar el registro completo del colaborador en Campus Obregón Náinari con Ingeniería en Software
  const respuesta = await invocarServidor(servidor, {
    method: "POST",
    url: "/api/v1/colaboradores/registro",
    headers: { cookie: cookieAdmin },
    body: {
      idInstitucional: NUEVO_COLAB_ID,
      campus: CAMPUS_PRUEBA,
      carreras: [CARRERA_PRUEBA],
    },
  });

  assert.equal(respuesta.status, 201);
  assert.equal(respuesta.body.confirmado, true);
  assert.equal(respuesta.body.colaborador.idInstitucional, NUEVO_COLAB_ID);
  assert.equal(respuesta.body.colaborador.campus, CAMPUS_PRUEBA);
  assert.equal(respuesta.body.colaborador.rol, "colaborador");
  assert.equal(respuesta.body.colaborador.activo, true);
  assert.deepEqual(respuesta.body.colaborador.carrerasAsignadas, [CARRERA_PRUEBA]);

  // Validar que se asignó el aspirante de Ingeniería en Software (asp-e2e-1) y no el de otra carrera
  assert.equal(respuesta.body.asignacion.totalAspirantesAsignados, 1);
  assert.deepEqual(respuesta.body.asignacion.aspirantesIds, ["asp-e2e-1"]);

  // Validar publicación del evento en el bus
  assert.equal(eventosRecibidos.length, 1);
  assert.equal(eventosRecibidos[0].tipo, "colaboradores.registro.confirmado");
  assert.equal(eventosRecibidos[0].colaboradorId, NUEVO_COLAB_ID);
  assert.deepEqual(eventosRecibidos[0].carrerasAsignadas, [CARRERA_PRUEBA]);
  assert.deepEqual(eventosRecibidos[0].aspirantesAsignados, ["asp-e2e-1"]);

  // E2E + [HU6-4] + [HU3-5]: Iniciar sesión con el nuevo colaborador y comprobar que el aspirante
  // reasignado conserva intacta toda su conversación ligada a aspirante_id
  const loginColab = await invocarServidor(servidor, {
    method: "POST",
    url: "/api/v1/auth/login",
    body: { identificador: NUEVO_COLAB_ID, password: "Password123!" },
  });
  assert.equal(loginColab.status, 200);
  const cookieColab = loginColab.headers["set-cookie"]?.split(";")[0];

  const conversacionRes = await invocarServidor(servidor, {
    method: "GET",
    url: "/api/monitoreo/aspirantes/asp-e2e-1/conversacion",
    headers: { cookie: cookieColab },
  });
  assert.equal(conversacionRes.status, 200);
  assert.equal(conversacionRes.body.mensajes.length, 2);
  assert.deepEqual(
    conversacionRes.body.mensajes.map((m) => m.id),
    ["msg-e2e-1", "msg-e2e-2"]
  );
});
