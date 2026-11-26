/**
 * EQ-85 (HU1-9) · Módulo WhatsApp: enviar la plantilla por Cloud API con reintentos y ritmo controlado.
 * Decisiones: docs/decisiones/HU1-envio-whatsapp.md
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearServidor } from "../src/servidor.js";
import { crearModuloMonitoreo } from "../src/modulos/monitoreo/index.js";
import { crearBusEnMemoria } from "../src/compartido/eventos/bus-en-memoria.js";
import {
  crearProveedorWhatsAppCloudApi, ErrorWhatsApp, esCodigoMetaReintentable, implementaProveedorWhatsApp, leerConfiguracionCloudApi,
} from "../src/modulos/whatsapp/index.js";
import { cuerpoMensajePlantilla, errorDesdeRespuestaMeta } from "../src/modulos/whatsapp/adaptador-cloud-api.js";
import { crearColaEnvioWhatsApp, esperaReintento } from "../src/modulos/disparo-automatico/aplicacion/cola-envio-whatsapp.js";

const AHORA = Date.parse("2026-11-16T17:00:00.000Z"); // lunes 10:00 en Hermosillo
const HORA = 3_600_000;

// ---------------------------------------------------------------------------
// Adaptador de Cloud API
// ---------------------------------------------------------------------------
function fetchFalso(respuestas) {
  const llamadas = [];
  const fn = async (url, opciones) => {
    llamadas.push({ url, ...opciones, cuerpo: JSON.parse(opciones.body) });
    const r = respuestas.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
  };
  fn.llamadas = llamadas;
  return fn;
}

const SOLICITUD = { telefono: "+526441234567", plantilla: "reactivacion_hu1", idioma: "es_MX", parametros: ["Ana", "Ingeniería en Software"] };

test("[EQ-85] Cloud API: arma la petición de plantilla y devuelve el id de Meta como PENDIENTE", async () => {
  const fetch = fetchFalso([{ status: 200, json: { messaging_product: "whatsapp", messages: [{ id: "wamid.ABC" }] } }]);
  const proveedor = crearProveedorWhatsAppCloudApi({
    token: "tkn", phoneNumberId: "1234567890", urlBase: "https://graph.facebook.com/v26.0/", fetch, reloj: () => new Date(AHORA),
  });
  assert.equal(implementaProveedorWhatsApp(proveedor), true);

  const r = await proveedor.enviarPlantilla(SOLICITUD);
  assert.deepEqual(r, { whatsappMessageId: "wamid.ABC", estadoEntrega: "PENDIENTE", fechaActualizacion: new Date(AHORA).toISOString(), motivoFalla: null });
  const [llamada] = fetch.llamadas;
  assert.equal(llamada.url, "https://graph.facebook.com/v26.0/1234567890/messages");
  assert.equal(llamada.method, "POST");
  assert.equal(llamada.headers.Authorization, "Bearer tkn");
  assert.deepEqual(llamada.cuerpo, {
    messaging_product: "whatsapp", recipient_type: "individual", to: "526441234567", type: "template",
    template: {
      name: "reactivacion_hu1", language: { code: "es_MX" },
      components: [{ type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "Ingeniería en Software" }] }],
    },
  });
  assert.deepEqual(await proveedor.obtenerEstadoEntrega("wamid.ABC"), r);
  assert.equal(await proveedor.obtenerEstadoEntrega("otro"), null);
});

test("[EQ-85] Cloud API: una plantilla sin variables no manda componentes", () => {
  assert.equal(cuerpoMensajePlantilla({ ...SOLICITUD, parametros: [] }).template.components, undefined);
});

test("[EQ-85] Cloud API: clasifica errores temporales y permanentes por el código de Meta", async () => {
  for (const codigo of [4, 80007, 130429, 131000, 131016, 131056, 131057, 133004]) assert.equal(esCodigoMetaReintentable(codigo), true, `${codigo}`);
  for (const codigo of [0, 100, 131026, 131049, 132001, 190, 368]) assert.equal(esCodigoMetaReintentable(codigo), false, `${codigo}`);

  const ritmo = errorDesdeRespuestaMeta(400, { error: { code: 130429, message: "(#130429) Rate limit hit" } });
  assert.deepEqual([ritmo.codigo, ritmo.reintentable], ["META_130429", true]);
  const sinWhatsApp = errorDesdeRespuestaMeta(400, { error: { code: 131026 } });
  assert.deepEqual([sinWhatsApp.codigo, sinWhatsApp.reintentable], ["META_131026", false]);
  assert.match(sinWhatsApp.message, /no puede recibir/);
  assert.deepEqual([errorDesdeRespuestaMeta(503, null).codigo, errorDesdeRespuestaMeta(503, null).reintentable], ["HTTP_503", true]);
  assert.equal(errorDesdeRespuestaMeta(401, null).reintentable, false);

  const crear = (respuestas) => crearProveedorWhatsAppCloudApi({ token: "t", phoneNumberId: "1", fetch: fetchFalso(respuestas) });
  await assert.rejects(crear([{ status: 400, json: { error: { code: 132001, message: "x" } } }]).enviarPlantilla(SOLICITUD),
    (e) => e instanceof ErrorWhatsApp && e.codigo === "META_132001" && !e.reintentable);
  await assert.rejects(crear([new TypeError("fetch failed")]).enviarPlantilla(SOLICITUD),
    (e) => e.codigo === "RED_NO_DISPONIBLE" && e.reintentable);
  await assert.rejects(crear([Object.assign(new Error("tiempo"), { name: "TimeoutError" })]).enviarPlantilla(SOLICITUD),
    (e) => e.codigo === "TIEMPO_AGOTADO" && e.reintentable);
  await assert.rejects(crear([{ status: 200, json: { messages: [] } }]).enviarPlantilla(SOLICITUD), (e) => e.codigo === "RESPUESTA_INVALIDA");

  const sinLlamar = fetchFalso([]);
  await assert.rejects(crearProveedorWhatsAppCloudApi({ token: "t", phoneNumberId: "1", fetch: sinLlamar })
    .enviarPlantilla({ ...SOLICITUD, telefono: "6441234567" }), (e) => e.codigo === "SOLICITUD_INVALIDA");
  assert.equal(sinLlamar.llamadas.length, 0);
});

test("[EQ-85] Cloud API solo se activa con WHATSAPP_MOCK_ENABLED=false, token y número", () => {
  assert.equal(leerConfiguracionCloudApi({}), null);
  assert.equal(leerConfiguracionCloudApi({ WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1" }), null, "por omisión, simulador");
  assert.equal(leerConfiguracionCloudApi({ WHATSAPP_MOCK_ENABLED: "false", WHATSAPP_PHONE_NUMBER_ID: "1" }), null);
  assert.deepEqual(leerConfiguracionCloudApi({ WHATSAPP_MOCK_ENABLED: "false", WHATSAPP_ACCESS_TOKEN: " t ", WHATSAPP_PHONE_NUMBER_ID: "1" }),
    { token: "t", phoneNumberId: "1", urlBase: "https://graph.facebook.com/v26.0" });
  assert.equal(leerConfiguracionCloudApi({
    WHATSAPP_MOCK_ENABLED: "FALSE", WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_API_URL: "https://graph.facebook.com/v25.0/",
  }).urlBase, "https://graph.facebook.com/v25.0");
  assert.throws(() => crearProveedorWhatsAppCloudApi({ token: "", phoneNumberId: "1" }), /WHATSAPP_ACCESS_TOKEN/);
});

// ---------------------------------------------------------------------------
// Cola de envío (reloj falso: dormir avanza el tiempo sin esperar)
// ---------------------------------------------------------------------------
function armarCola({ fallos = {}, horario = null, ...opciones } = {}) {
  const reloj = { ms: AHORA };
  const dormidos = [];
  const envios = [];
  const intentosPorTelefono = new Map();
  const proveedor = {
    async enviarPlantilla(solicitud) {
      const n = (intentosPorTelefono.get(solicitud.telefono) ?? 0) + 1;
      intentosPorTelefono.set(solicitud.telefono, n);
      envios.push({ ...solicitud, en: reloj.ms });
      const fallo = fallos[solicitud.telefono];
      if (fallo && (fallo.veces === undefined || n <= fallo.veces)) {
        throw new ErrorWhatsApp(fallo.codigo, `falla ${fallo.codigo}`, { reintentable: fallo.reintentable });
      }
      return { whatsappMessageId: `wamid.${solicitud.telefono}.${n}`, estadoEntrega: "PENDIENTE", fechaActualizacion: "", motivoFalla: null };
    },
    async obtenerEstadoEntrega() { return null; },
  };
  const bus = crearBusEnMemoria();
  const resultados = [];
  bus.suscribir("disparo.envio.#", (evento, routingKey) => { resultados.push({ routingKey, evento, en: reloj.ms }); });
  const cola = crearColaEnvioWhatsApp({
    proveedor, bus, reloj: () => new Date(reloj.ms), azar: () => 0.5,
    dormir: async (ms) => { dormidos.push(ms); reloj.ms += ms; },
    validadorHorario: horario ? { obtenerEstadoHorario: (f) => horario(f.getTime()) } : null,
    registrarError: () => {},
    ...opciones,
  });
  return { cola, envios, resultados, dormidos, reloj };
}

let secuencia = 0;
const solicitado = (telefono, extra = {}) => {
  secuencia += 1;
  return {
    eventId: `envio-${secuencia}`, tipo: "disparo.envio.solicitado", version: 1, publicadoEn: new Date(AHORA).toISOString(),
    datos: {
      loteId: "lote-1", envioId: `envio-${secuencia}`, colaboradorId: "c1", aspiranteId: `asp-${secuencia}`, canal: "WHATSAPP",
      destino: telefono, mensajeId: "reactivacion_hu1", texto: "Hola, Ana…", parametros: ["Ana", "Software"], ...extra,
    },
  };
};
const tel = (n) => `+52644000${String(n).padStart(4, "0")}`;
const deTipo = (resultados, tipo) => resultados.filter((r) => r.evento.tipo === tipo);

test("[EQ-85] Envía la plantilla con sus parámetros y publica el resultado", async () => {
  const { cola, envios, resultados } = armarCola({ plantilla: { nombre: "reactivacion_hu1", idioma: "es_MX" } });
  const evento = solicitado(tel(1));
  assert.equal(cola.encolar(evento), true);
  assert.equal(cola.encolar(evento), false, "repetido: se ignora");
  assert.equal(cola.encolar({ ...solicitado(tel(2)), datos: { ...solicitado(tel(2)).datos, canal: "CORREO" } }), false);
  await cola.esperarInactiva();

  assert.deepEqual(envios.map(({ en: _en, ...s }) => s), [{ telefono: tel(1), plantilla: "reactivacion_hu1", idioma: "es_MX", parametros: ["Ana", "Software"] }]);
  assert.equal(resultados.length, 1);
  const [{ routingKey, evento: r }] = resultados;
  assert.equal(routingKey, "disparo.envio.enviado.whatsapp");
  assert.equal(r.eventId, `${evento.datos.envioId}:disparo.envio.enviado`);
  assert.deepEqual(
    { ...r.datos, enviadoEn: undefined },
    { loteId: "lote-1", envioId: evento.datos.envioId, colaboradorId: "c1", aspiranteId: evento.datos.aspiranteId, canal: "WHATSAPP",
      whatsappMessageId: `wamid.${tel(1)}.1`, estadoEntrega: "PENDIENTE", intentos: 1, texto: "Hola, Ana…", enviadoEn: undefined },
  );
});

test("[EQ-85] Ritmo controlado: respeta los mensajes por segundo", async () => {
  const { cola, envios } = armarCola({ mensajesPorSegundo: 4 });
  for (let i = 1; i <= 6; i += 1) cola.encolar(solicitado(tel(i)));
  await cola.esperarInactiva();
  const separaciones = envios.slice(1).map((e, i) => e.en - envios[i].en);
  assert.equal(envios.length, 6);
  assert.ok(separaciones.every((ms) => ms >= 250), `separaciones: ${separaciones}`);
  assert.equal(envios.at(-1).en - envios[0].en, 1250);
});

test("[EQ-85] Reintenta los errores temporales con espera exponencial", async () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((n) => esperaReintento(n, { esperaBaseMs: 2000, esperaMaximaMs: 60000 }, () => 0.5)),
    [2000, 4000, 8000, 16000, 32000, 60000, 60000]);
  assert.equal(esperaReintento(1, { esperaBaseMs: 2000, esperaMaximaMs: 60000 }, () => 0), 1600, "−20 %");
  assert.equal(esperaReintento(1, { esperaBaseMs: 2000, esperaMaximaMs: 60000 }, () => 1), 2400, "+20 %");

  const { cola, envios, resultados } = armarCola({ fallos: { [tel(1)]: { codigo: "META_130429", reintentable: true, veces: 2 } } });
  cola.encolar(solicitado(tel(1)));
  await cola.esperarInactiva();
  assert.equal(envios.length, 3);
  assert.deepEqual(envios.slice(1).map((e, i) => e.en - envios[i].en), [2000, 4000]);
  const [enviado] = deTipo(resultados, "disparo.envio.enviado");
  assert.equal(enviado.evento.datos.intentos, 3);
  assert.equal(deTipo(resultados, "disparo.envio.fallido").length, 0);
});

test("[EQ-85] Agota los reintentos y publica el fallo con el motivo", async () => {
  const { cola, envios, resultados } = armarCola({ maxIntentos: 4, fallos: { [tel(1)]: { codigo: "RED_NO_DISPONIBLE", reintentable: true } } });
  cola.encolar(solicitado(tel(1)));
  await cola.esperarInactiva();
  assert.equal(envios.length, 4);
  const [fallido] = deTipo(resultados, "disparo.envio.fallido");
  assert.equal(fallido.routingKey, "disparo.envio.fallido.whatsapp");
  assert.deepEqual([fallido.evento.datos.codigo, fallido.evento.datos.codigoProveedor, fallido.evento.datos.intentos],
    ["REINTENTOS_AGOTADOS", "RED_NO_DISPONIBLE", 4]);
  assert.match(fallido.evento.datos.motivo, /después de 4 intentos/);
});

test("[EQ-85] Un error permanente no se reintenta y no detiene a los demás", async () => {
  const { cola, envios, resultados } = armarCola({ fallos: { [tel(2)]: { codigo: "META_131026", reintentable: false } } });
  [1, 2, 3].forEach((n) => cola.encolar(solicitado(tel(n))));
  await cola.esperarInactiva();
  assert.equal(envios.filter((e) => e.telefono === tel(2)).length, 1);
  assert.equal(deTipo(resultados, "disparo.envio.enviado").length, 2);
  const [fallido] = deTipo(resultados, "disparo.envio.fallido");
  assert.deepEqual([fallido.evento.datos.codigo, fallido.evento.datos.intentos], ["META_131026", 1]);
});

test("[EQ-85] Límite de 24 h: difiere lo que no cabe y lo envía al liberarse cupo", async () => {
  const { cola, envios, resultados } = armarCola({ limiteContactos24h: 3, mensajesPorSegundo: 1000 });
  [1, 2, 3, 4, 5].forEach((n) => cola.encolar(solicitado(tel(n))));
  // Un número que ya recibió mensaje en la ventana no cuenta otra vez.
  cola.encolar(solicitado(tel(1)));
  await cola.esperarInactiva();

  const enviados = deTipo(resultados, "disparo.envio.enviado");
  assert.equal(enviados.length, 6);
  const antesDe24h = enviados.filter((r) => r.en < AHORA + 24 * HORA).map((r) => r.evento.datos.aspiranteId);
  assert.equal(antesDe24h.length, 4, "3 contactos nuevos + el número repetido");

  const diferidos = deTipo(resultados, "disparo.envio.diferido");
  assert.equal(diferidos.length, 2, "un aviso por envío diferido");
  assert.ok(diferidos.every((r) => r.evento.datos.codigo === "LIMITE_24H"));
  assert.equal(diferidos[0].evento.datos.reanudaEn, new Date(envios[0].en + 24 * HORA).toISOString());
  assert.match(diferidos[0].evento.datos.motivo, /límite de 3 contactos/);
  // En ninguna ventana de 24 h hubo más de 3 números nuevos.
  const primeros = [...new Map(enviados.map((r) => [r.evento.datos.aspiranteId, r.en])).values()];
  const porNumero = new Map();
  for (const e of envios) if (!porNumero.has(e.telefono)) porNumero.set(e.telefono, e.en);
  const inicios = [...porNumero.values()].sort((x, y) => x - y);
  assert.ok(inicios.every((t) => inicios.filter((u) => u >= t && u < t + 24 * HORA).length <= 3), `inicios: ${inicios.map((t) => t - AHORA)}`);
  assert.equal(primeros.length, 6);
  assert.ok(cola.estado().contactos24h <= cola.estado().limiteContactos24h);
});

test("[EQ-85] Fuera del horario de HU9 difiere hasta la siguiente apertura", async () => {
  const apertura = AHORA + 2 * HORA;
  const horario = (ms) => (ms >= apertura
    ? { permitido: true }
    : { permitido: false, siguienteApertura: new Date(apertura).toISOString() });
  const { cola, envios, resultados } = armarCola({ horario });
  cola.encolar(solicitado(tel(1)));
  await cola.esperarInactiva();
  assert.equal(envios[0].en, apertura);
  const [diferido] = deTipo(resultados, "disparo.envio.diferido");
  assert.deepEqual([diferido.evento.datos.codigo, diferido.evento.datos.reanudaEn], ["FUERA_DE_HORARIO", new Date(apertura).toISOString()]);
  assert.equal(deTipo(resultados, "disparo.envio.enviado").length, 1);
});

test("[EQ-85] Lo que sigue pendiente más de 72 h se da por fallido (CADUCADO)", async () => {
  const { cola, envios, resultados } = armarCola({ horario: () => ({ permitido: false, siguienteApertura: null }) });
  cola.encolar(solicitado(tel(1)));
  await cola.esperarInactiva();
  assert.equal(envios.length, 0);
  const [fallido] = deTipo(resultados, "disparo.envio.fallido");
  assert.equal(fallido.evento.datos.codigo, "CADUCADO");
  assert.ok(fallido.en - AHORA > 72 * HORA);
});

test("[EQ-85] Si publicar un resultado falla, la cola sigue con los demás", async () => {
  const errores = [];
  const reloj = { ms: AHORA };
  const proveedor = { enviarPlantilla: async () => ({ whatsappMessageId: "w", estadoEntrega: "PENDIENTE" }), obtenerEstadoEntrega: async () => null };
  let publicados = 0;
  const bus = { publicar: async () => { publicados += 1; if (publicados === 1) throw new Error("bus caído"); } };
  const cola = crearColaEnvioWhatsApp({
    proveedor, bus, reloj: () => new Date(reloj.ms), dormir: async (ms) => { reloj.ms += ms; }, registrarError: (e) => errores.push(e),
  });
  [1, 2].forEach((n) => cola.encolar(solicitado(tel(n))));
  await cola.esperarInactiva();
  assert.equal(publicados, 2);
  assert.match(errores[0].message, /bus caído/);
});

// ---------------------------------------------------------------------------
// HTTP: del lote de EQ-83 a WhatsApp
// ---------------------------------------------------------------------------
const CUERPO = {
  semaforos: ["ROJO", "NARANJA"], carreras: ["Ingeniería en Software", "Licenciatura en Administración"],
  inactividadValor: 7, inactividadUnidad: "DIAS",
};

async function conServidor(opciones, fn) {
  const moduloMonitoreo = crearModuloMonitoreo();
  const bus = crearBusEnMemoria();
  const resultados = [];
  bus.suscribir("disparo.envio.#", (evento, routingKey) => { resultados.push({ routingKey, evento }); });
  const servidor = crearServidor({
    port: 0, reloj: () => AHORA, duracionSesionMs: 86_400_000, moduloMonitoreo, bus,
    colaEnvioWhatsApp: { mensajesPorSegundo: 10_000 }, ...opciones,
  });
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const login = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: "00000252115", password: "Password123!" }),
    });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const enviar = async () => (await fetch(`${base}/api/v1/disparo-mensajes/enviar`, {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": "eq85-lote-000001" },
      body: JSON.stringify(CUERPO),
    })).json();
    await fn({ enviar, resultados, repositorio: moduloMonitoreo.repositorio, servidor });
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
}

test("[EQ-85] HTTP: el lote sale por el simulador de BASE-10 y queda en el Chat con su id de WhatsApp", async () => {
  await conServidor({}, async ({ enviar, resultados, repositorio, servidor }) => {
    const antes = repositorio.conversaciones.length;
    const lote = await enviar();
    await servidor.colaEnvioWhatsApp.esperarInactiva();

    const enviados = resultados.filter((r) => r.routingKey === "disparo.envio.enviado.whatsapp");
    assert.equal(enviados.length, lote.envios.whatsapp);
    assert.ok(enviados.every((r) => r.evento.datos.loteId === lote.loteId && r.evento.datos.whatsappMessageId.startsWith("sim-wa-")));
    const nuevos = repositorio.conversaciones.slice(antes);
    assert.equal(nuevos.length, lote.envios.whatsapp);
    assert.ok(nuevos.every((m) => m.whatsappMessageId?.startsWith("sim-wa-") && m.estadoEntrega === "ENVIADO"));
  });
});

test("[EQ-85] HTTP: con Cloud API, cada aspirante recibe la plantilla con su nombre y carrera; los fallos no llegan al Chat", async () => {
  let n = 0;
  const peticiones = [];
  const fetch = async (url, opciones) => {
    const cuerpo = JSON.parse(opciones.body);
    peticiones.push(cuerpo);
    n += 1;
    if (n === 2) return { ok: false, status: 400, json: async () => ({ error: { code: 131026, message: "Message undeliverable" } }) };
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: `wamid.${n}` }] }) };
  };
  const proveedorWhatsApp = crearProveedorWhatsAppCloudApi({ token: "t", phoneNumberId: "99", fetch, reloj: () => new Date(AHORA) });

  await conServidor({ proveedorWhatsApp }, async ({ enviar, resultados, repositorio, servidor }) => {
    const antes = repositorio.conversaciones.length;
    const lote = await enviar();
    await servidor.colaEnvioWhatsApp.esperarInactiva();

    assert.equal(peticiones.length, lote.envios.whatsapp);
    const carlos = repositorio.aspirantes.find((a) => a.nombreCompleto === "Carlos Mendoza Armenta");
    const suya = peticiones.find((p) => p.to === carlos.telefono.replace("+", ""));
    assert.deepEqual(suya.template, {
      name: "reactivacion_hu1", language: { code: "es_MX" },
      components: [{ type: "body", parameters: [{ type: "text", text: "Carlos" }, { type: "text", text: "Ingeniería en Software" }] }],
    });

    const fallidos = resultados.filter((r) => r.routingKey === "disparo.envio.fallido.whatsapp");
    assert.equal(fallidos.length, 1);
    assert.equal(fallidos[0].evento.datos.codigo, "META_131026");
    assert.equal(repositorio.conversaciones.length - antes, lote.envios.whatsapp - 1);
    assert.ok(!repositorio.conversaciones.some((m) => m.aspiranteId === fallidos[0].evento.datos.aspiranteId && m.remitenteId === "disparo-automatico"));
  });
});
