/**
 * EQ-92 (HU1-16) · E2E y seguridad de HU1.
 *
 * E2E: los cinco flujos del modal «Envío de mensajes automáticos» de punta a punta, con las
 * mismas llamadas y la misma lógica de pantalla (frontend/js/disparo-logica.js):
 * filtrar, enviar, cero aspirantes, fuera de horario y enviar por correo.
 * Seguridad: rol y validación de entradas.
 * Prueba controlada de Cloud API: scripts/prueba-cloud-api.js (con fetch falso; la real se
 * hace a mano con el número de pruebas, ver docs/qa/HU1-aceptacion-po.md).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearServidor } from "../src/servidor.js";
import { crearModuloMonitoreo } from "../src/modulos/monitoreo/index.js";
import { crearBusEnMemoria } from "../src/compartido/eventos/bus-en-memoria.js";
import { crearServicioCorreoSimulado } from "../src/modulos/notificaciones/servicio-correo-simulado.js";
import {
  botonEnviarDeshabilitado, filtrosDesdeFormulario, resumenEnvio, TEXTO_SIN_ASPIRANTES, textoConteo,
} from "../frontend/js/disparo-logica.js";
import { ejecutar, prepararPruebaCloudApi } from "../scripts/prueba-cloud-api.js";

const LUNES_10AM = Date.parse("2026-11-16T17:00:00.000Z");
const SABADO_10AM = Date.parse("2026-11-21T17:00:00.000Z");
const SEBASTIAN = { id: "00000252115", password: "Password123!" };
const ADMIN = { id: "00000100001", password: "AdminPassword2026!" };

async function conApp({ instante = LUNES_10AM } = {}, fn) {
  const arranque = Date.now();
  const reloj = () => instante + (Date.now() - arranque);
  const moduloMonitoreo = crearModuloMonitoreo();
  const bus = crearBusEnMemoria();
  const eventos = [];
  bus.suscribir("disparo.#", (evento, routingKey) => { eventos.push({ routingKey, evento }); });
  const smtp = crearServicioCorreoSimulado();
  const servidor = crearServidor({
    port: 0, reloj, duracionSesionMs: 86_400_000, moduloMonitoreo, bus, servicioCorreoDisparo: smtp,
    colaEnvioWhatsApp: { mensajesPorSegundo: 10_000 },
  });
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const sesion = async ({ id, password }) => (await fetch(`${base}/api/v1/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identificador: id, password }),
  })).headers.get("set-cookie").split(";")[0];
  /** Lo mismo que hace el modal: api.disparoMensajes.vistaPrevia y .enviar. */
  const pantalla = (cookie) => ({
    async vistaPrevia(f) {
      const q = new URLSearchParams({ semaforos: f.semaforos.join(","), carreras: f.carreras.join(","), inactividadValor: f.inactividadValor, inactividadUnidad: f.inactividadUnidad });
      const r = await fetch(`${base}/api/v1/disparo-mensajes/vista-previa?${q}`, { headers: { Cookie: cookie } });
      return { status: r.status, ...(await r.json()) };
    },
    async enviar(f, clave = `e2e-${Math.random().toString(36).slice(2, 12)}`) {
      const r = await fetch(`${base}/api/v1/disparo-mensajes/enviar`, {
        method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": clave }, body: JSON.stringify(f),
      });
      return { status: r.status, ...(await r.json()) };
    },
  });
  const crudo = (ruta, opciones = {}) => fetch(base + ruta, opciones);
  try {
    await fn({ sesion, pantalla, crudo, eventos, smtp, repositorio: moduloMonitoreo.repositorio, esperar: () => servidor.esperarEnviosHU1() });
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
}

/** Abre el modal como lo hace app.js: primera carga sin carreras, luego con las de la cartera. */
async function abrirModal(ui) {
  const formulario = { semaforos: ["ROJO", "NARANJA"], carreras: new Set(), inactividadValor: "1", inactividadUnidad: "DIAS" };
  const primera = await ui.vistaPrevia(filtrosDesdeFormulario(formulario));
  assert.equal(primera.status, 200);
  assert.equal(primera.valido, false, "la primera carga no lleva carreras");
  formulario.carreras = new Set(primera.carrerasDisponibles);
  return { formulario, opciones: { semaforos: primera.semaforosDisponibles, carreras: primera.carrerasDisponibles } };
}

// ---------------------------------------------------------------------------
// E2E
// ---------------------------------------------------------------------------
test("[EQ-92] E2E filtrar: abrir el modal, cambiar semáforo, carrera e inactividad y ver conteo, ejemplos y botón", async () => {
  await conApp({}, async ({ sesion, pantalla }) => {
    const ui = pantalla(await sesion(SEBASTIAN));
    const { formulario, opciones } = await abrirModal(ui);
    assert.deepEqual(opciones.semaforos, ["NARANJA", "ROJO"], "verde no aparece");

    const todo = await ui.vistaPrevia(filtrosDesdeFormulario(formulario));
    assert.ok(todo.total > 0);
    assert.equal(textoConteo(todo), `${todo.total} alumnos serán notificados`);
    assert.equal(botonEnviarDeshabilitado(todo), false);
    assert.ok(todo.mensajesEjemplo.length > 0 && todo.mensajesEjemplo.every((m) => /^Hola, .+\. Tu proceso de ingreso a /.test(m)));

    const soloRojo = await ui.vistaPrevia(filtrosDesdeFormulario({ ...formulario, semaforos: ["ROJO"] }));
    const soloSoftware = await ui.vistaPrevia(filtrosDesdeFormulario({ ...formulario, carreras: ["Ingeniería en Software"] }));
    const unMes = await ui.vistaPrevia(filtrosDesdeFormulario({ ...formulario, inactividadValor: "1", inactividadUnidad: "MESES" }));
    for (const parcial of [soloRojo, soloSoftware, unMes]) {
      assert.equal(parcial.valido, true);
      assert.ok(parcial.total <= todo.total);
    }
    assert.ok(soloRojo.total < todo.total && soloSoftware.total < todo.total, "cada filtro reduce el lote");
  });
});

test("[EQ-92] E2E enviar: confirmar, ver el resumen y que cada aspirante quede notificado", async () => {
  await conApp({}, async ({ sesion, pantalla, eventos, repositorio, esperar }) => {
    const ui = pantalla(await sesion(SEBASTIAN));
    const { formulario } = await abrirModal(ui);
    const previa = await ui.vistaPrevia(filtrosDesdeFormulario(formulario));

    const r = await ui.enviar(filtrosDesdeFormulario({ ...formulario, enviarPorCorreo: false }));
    assert.equal(r.status, 200);
    assert.equal(r.totalEnviados, previa.total, "se envía a los mismos que mostró la vista previa");
    assert.deepEqual(resumenEnvio(r, false), { texto: `Se notificó a ${previa.total} aspirante(s).`, conErrores: false });
    await esperar();
    assert.equal(eventos.filter((e) => e.routingKey === "disparo.envio.enviado.whatsapp").length, previa.total);
    const notificados = repositorio.aspirantes.filter((a) => a.vecesNotificado === 1);
    assert.equal(notificados.length, previa.total);

    // Al volver a abrir el modal ya no hay a quién enviar (espera de 48 h).
    const despues = await ui.vistaPrevia(filtrosDesdeFormulario(formulario));
    assert.deepEqual([despues.total, textoConteo(despues), botonEnviarDeshabilitado(despues)], [0, TEXTO_SIN_ASPIRANTES, true]);
  });
});

test("[EQ-92] E2E cero aspirantes: el modal lo dice, el botón se apaga y el servidor rechaza el envío", async () => {
  await conApp({}, async ({ sesion, pantalla, eventos }) => {
    const ui = pantalla(await sesion(SEBASTIAN));
    const { formulario } = await abrirModal(ui);
    const vacio = filtrosDesdeFormulario({ ...formulario, inactividadValor: "12", inactividadUnidad: "MESES" });
    const previa = await ui.vistaPrevia(vacio);
    assert.deepEqual([previa.valido, previa.total], [true, 0]);
    assert.equal(textoConteo(previa), TEXTO_SIN_ASPIRANTES);
    assert.equal(botonEnviarDeshabilitado(previa), true);
    const r = await ui.enviar(vacio);
    assert.deepEqual([r.status, r.codigo], [400, "SIN_ASPIRANTES"]);
    assert.equal(eventos.length, 0);
  });
});

test("[EQ-92] E2E fuera de horario: se puede consultar, no enviar, y no se programa nada", async () => {
  await conApp({ instante: SABADO_10AM }, async ({ sesion, pantalla, eventos, esperar }) => {
    const ui = pantalla(await sesion(SEBASTIAN));
    const { formulario } = await abrirModal(ui);
    const previa = await ui.vistaPrevia(filtrosDesdeFormulario(formulario));
    assert.deepEqual([previa.status, previa.dentroDeHorario], [200, false]);
    assert.ok(previa.total > 0);
    assert.equal(botonEnviarDeshabilitado(previa), true);
    assert.match(previa.mensajeHorario, /fuera del horario/i);

    const r = await ui.enviar(filtrosDesdeFormulario(formulario));
    assert.deepEqual([r.status, r.codigo], [409, "FUERA_DE_HORARIO_PERMITIDO"]);
    await esperar();
    assert.equal(eventos.length, 0, "el lote manual no se programa automáticamente (EQ-77 §10)");
  });
});

test("[EQ-92] E2E enviar por correo: cada aspirante recibe también su correo personalizado", async () => {
  await conApp({}, async ({ sesion, pantalla, smtp, repositorio, esperar }) => {
    const ui = pantalla(await sesion(SEBASTIAN));
    const { formulario } = await abrirModal(ui);
    const r = await ui.enviar(filtrosDesdeFormulario({ ...formulario, enviarPorCorreo: true }));
    assert.equal(r.status, 200);
    assert.equal(r.correo.exitosos, r.totalAspirantes);
    assert.match(resumenEnvio(r, true).texto, new RegExp(`Correo: ${r.totalAspirantes} enviados, 0 fallidos\\.$`));
    await esperar();

    const bandeja = smtp.bandeja();
    assert.equal(bandeja.length, r.totalAspirantes);
    const carlos = repositorio.aspirantes.find((a) => a.nombreCompleto === "Carlos Mendoza Armenta");
    const suyo = bandeja.find((c) => c.para === carlos.correo);
    assert.ok(suyo, "Carlos recibió el correo");
    assert.match(suyo.texto, /^Hola, Carlos\. Tu proceso de ingreso a Ingeniería en Software todavía puede continuar\./);
    assert.match(suyo.asunto, /ITSON/);
  });
});

// ---------------------------------------------------------------------------
// Seguridad: rol
// ---------------------------------------------------------------------------
test("[EQ-92] Seguridad (rol): sin sesión 401; el administrador no envía lotes ni ve los de otros; el colaborador no configura HU9", async () => {
  await conApp({}, async ({ sesion, pantalla, crudo, eventos }) => {
    for (const ruta of ["/api/v1/disparo-mensajes/vista-previa", "/api/v1/disparo-mensajes/lotes/00000000-0000-4000-8000-000000000000"]) {
      assert.equal((await crudo(ruta)).status, 401, ruta);
    }
    assert.equal((await crudo("/api/v1/disparo-mensajes/enviar", { method: "POST", body: "{}" })).status, 401);

    const admin = await sesion(ADMIN);
    const sebastian = await sesion(SEBASTIAN);
    const { formulario } = await abrirModal(pantalla(sebastian));
    const r = await pantalla(admin).enviar(filtrosDesdeFormulario(formulario));
    assert.deepEqual([r.status, r.codigo], [403, "SIN_PERMISO"]);
    assert.equal(eventos.length, 0);

    const lote = await pantalla(sebastian).enviar(filtrosDesdeFormulario(formulario));
    assert.equal((await crudo(`/api/v1/disparo-mensajes/lotes/${lote.loteId}`, { headers: { Cookie: admin } })).status, 404);

    const config = await crudo("/api/v1/mensajes/configuracion", { headers: { Cookie: sebastian } });
    const put = await crudo("/api/v1/mensajes/configuracion", { method: "PUT", headers: { Cookie: sebastian, "Content-Type": "application/json" }, body: "{}" });
    assert.ok([401, 403].includes(put.status), `PUT de configuración como colaborador: ${put.status}`);
    assert.ok(config.status === 200 || config.status === 403, "leerla no le da permiso de cambiarla");
  });
});

// ---------------------------------------------------------------------------
// Seguridad: validación de entradas
// ---------------------------------------------------------------------------
test("[EQ-92] Seguridad (entradas): cuerpo inválido, demasiado grande o con valores maliciosos se rechaza sin enviar nada", async () => {
  await conApp({}, async ({ sesion, crudo, eventos }) => {
    const cookie = await sesion(SEBASTIAN);
    const post = (body, extra = {}) => crudo("/api/v1/disparo-mensajes/enviar", {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", ...extra }, body,
    });
    const base = { semaforos: ["ROJO"], carreras: ["Ingeniería en Software"], inactividadValor: 7, inactividadUnidad: "DIAS" };

    assert.equal((await post("{esto no es json")).status, 400);
    // Más de 16 KB: el servidor deja de leer (413). Hoy leerCuerpo corta la conexión con req.destroy(),
    // así que el cliente puede ver el 413 o la conexión cerrada; en ambos casos no se procesa nada.
    const grande = await post(JSON.stringify({ ...base, relleno: "x".repeat(20_000) })).then((r) => r.status, () => "conexión cerrada");
    assert.ok([413, "conexión cerrada"].includes(grande), `cuerpo grande: ${grande}`);

    const casos = [
      [{ ...base, semaforos: "ROJO" }, "semaforos"],
      [{ ...base, semaforos: ["VERDE"] }, "semaforos"],
      [{ ...base, semaforos: ["ROJO'; DROP TABLE aspirantes;--"] }, "semaforos"],
      [{ ...base, carreras: ["<script>alert(1)</script>"] }, "carreras"],
      [{ ...base, carreras: [{ $ne: null }] }, "carreras"],
      [{ ...base, carreras: [] }, "carreras"],
      [{ ...base, inactividadValor: -1 }, "inactividadValor"],
      [{ ...base, inactividadValor: 0 }, "inactividadValor"],
      [{ ...base, inactividadValor: 1.5 }, "inactividadValor"],
      [{ ...base, inactividadValor: "1e9" }, "inactividadValor"],
      [{ ...base, inactividadValor: "siete" }, "inactividadValor"],
      [{ ...base, inactividadUnidad: "HORAS" }, "inactividadUnidad"],
      [{ ...base, inactividadUnidad: { toUpperCase: 1 } }, "inactividadUnidad"],
    ];
    for (const [cuerpo, campo] of casos) {
      const r = await post(JSON.stringify(cuerpo), { "Idempotency-Key": `entrada-${Math.random().toString(36).slice(2, 12)}` });
      const json = await r.json();
      assert.deepEqual([r.status, json.codigo], [400, "FILTROS_INVALIDOS"], JSON.stringify(cuerpo));
      assert.ok(json.errores[campo], `${campo}: ${JSON.stringify(cuerpo)}`);
    }

    for (const clave of ["corta", "con espacio 12345", "x".repeat(101), "../../etc/passwd"]) {
      const r = await post(JSON.stringify(base), { "Idempotency-Key": clave });
      assert.deepEqual([r.status, (await r.json()).codigo], [400, "CLAVE_IDEMPOTENCIA_INVALIDA"], clave);
    }

    const lote = await crudo("/api/v1/disparo-mensajes/lotes/no-es-un-uuid", { headers: { Cookie: cookie } });
    assert.notEqual(lote.status, 200);
    assert.equal(eventos.length, 0, "ninguna entrada mala generó envíos");
  });
});

test("[EQ-92] Seguridad (entradas): la vista previa por URL tampoco acepta valores fuera de la cartera", async () => {
  await conApp({}, async ({ sesion, crudo }) => {
    const cookie = await sesion(SEBASTIAN);
    for (const q of [
      "semaforos=ROJO&carreras=' OR 1=1 --&inactividadValor=7&inactividadUnidad=DIAS",
      "semaforos=ROJO,VERDE&carreras=Ingeniería en Software&inactividadValor=7&inactividadUnidad=DIAS",
      "semaforos=ROJO&carreras=Ingeniería en Software&inactividadValor=99999&inactividadUnidad=DIAS",
    ]) {
      const r = await crudo(`/api/v1/disparo-mensajes/vista-previa?${encodeURI(q)}`, { headers: { Cookie: cookie } });
      const json = await r.json();
      assert.deepEqual([r.status, json.valido, json.total], [200, false, 0], q);
    }
  });
});

// ---------------------------------------------------------------------------
// Prueba controlada con el número de pruebas de Cloud API (script)
// ---------------------------------------------------------------------------
test("[EQ-92] Prueba controlada de Cloud API: simulacro por omisión, un solo envío con --enviar y errores claros", async () => {
  const env = { WHATSAPP_ACCESS_TOKEN: "EAAtokenDePrueba1234", WHATSAPP_PHONE_NUMBER_ID: "109876543210" };
  const salida = { lineas: [], log(t) { this.lineas.push(String(t)); }, error(t) { this.lineas.push(`ERROR ${t}`); } };

  const sinCredenciales = prepararPruebaCloudApi(["--numero", "+5216441234567"], { WHATSAPP_ACCESS_TOKEN: "mock_bearer_token" });
  assert.ok(sinCredenciales.errores.some((e) => /WHATSAPP_ACCESS_TOKEN/.test(e)));
  assert.ok(prepararPruebaCloudApi(["--numero", "6441234567"], env).errores.some((e) => /formato internacional/.test(e)));

  const vista = prepararPruebaCloudApi(["--numero", "+5216441234567"], env);
  assert.deepEqual([vista.errores, vista.enviar], [[], false]);
  assert.equal(vista.vistaPrevia.url, "https://graph.facebook.com/v26.0/109876543210/messages");
  assert.ok(!JSON.stringify(vista.vistaPrevia).includes("EAAtokenDePrueba1234"), "el token no se muestra completo");

  let llamadas = 0;
  const fetchFalso = async () => { llamadas += 1; return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.prueba" }] }) }; };
  assert.equal(await ejecutar(["--numero", "+5216441234567"], env, { fetch: fetchFalso, salida }), 0);
  assert.equal(llamadas, 0, "sin --enviar no se manda nada");
  assert.equal(await ejecutar(["--numero", "+5216441234567", "--enviar"], env, { fetch: fetchFalso, salida }), 0);
  assert.equal(llamadas, 1, "con --enviar, un solo mensaje");
  assert.ok(salida.lineas.some((l) => /wamid\.prueba/.test(l)));

  const rechazo = async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 132001, message: "template" } }) });
  assert.equal(await ejecutar(["--numero", "+5216441234567", "--enviar"], env, { fetch: rechazo, salida }), 2);
  assert.ok(salida.lineas.some((l) => /META_132001/.test(l)));

  const hello = prepararPruebaCloudApi(["--numero", "+5216441234567", "--plantilla", "hello_world", "--idioma", "en_US", "--parametros", ""], env);
  assert.deepEqual([hello.errores, hello.vistaPrevia.cuerpo.template.components], [[], undefined]);
});
