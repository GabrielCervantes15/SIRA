import { createHmac } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearServidor } from "../src/servidor.js";
import { crearBusEnMemoria } from "../src/compartido/eventos/bus-en-memoria.js";
import {
  crearServicioWebhookWhatsApp,
  leerConfiguracionWebhookWhatsApp,
  RUTA_WEBHOOK_WHATSAPP,
  TAMANO_MAXIMO_WEBHOOK_WHATSAPP,
  verificarFirmaWebhookWhatsApp,
} from "../src/modulos/whatsapp/webhook.js";

const VERIFY_TOKEN = "verify-token-solo-para-pruebas";
const APP_SECRET = "app-secret-solo-para-pruebas";
const payloadMeta = {
  object: "whatsapp_business_account",
  entry: [{
    id: "waba-test-001",
    changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "15550001111", phone_number_id: "123456789" },
        statuses: [{
          id: "wamid.test-001",
          status: "delivered",
          timestamp: "1795651200",
          recipient_id: "15550002222",
        }],
      },
    }],
  }],
};

function firma(rawBody, secreto = APP_SECRET) {
  return `sha256=${createHmac("sha256", secreto).update(rawBody).digest("hex")}`;
}

function crearServicio({ verifyToken = VERIFY_TOKEN, appSecret = APP_SECRET, maxBodyBytes, alRecibirEvento } = {}) {
  return crearServicioWebhookWhatsApp({
    verifyToken,
    appSecret,
    ...(maxBodyBytes ? { maxBodyBytes } : {}),
    alRecibirEvento,
  });
}

async function conServidor(opciones, ejecutar) {
  const servidor = crearServidor(opciones);
  await new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", resolve);
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    await ejecutar(base, servidor);
  } finally {
    await new Promise((resolve, reject) => {
      servidor.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("[EQ-115] lee Verify Token, App Secret y límite de cuerpo sin exponerlos", () => {
  assert.deepEqual(leerConfiguracionWebhookWhatsApp({}), {
    verifyToken: "",
    appSecret: "",
    maxBodyBytes: TAMANO_MAXIMO_WEBHOOK_WHATSAPP,
  });
  assert.deepEqual(leerConfiguracionWebhookWhatsApp({
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: " verify ",
    WHATSAPP_APP_SECRET: " secret ",
    WHATSAPP_WEBHOOK_MAX_BODY_BYTES: "2048",
  }), { verifyToken: "verify", appSecret: "secret", maxBodyBytes: 2048 });
  assert.equal(leerConfiguracionWebhookWhatsApp({ WHATSAPP_WEBHOOK_MAX_BODY_BYTES: "-1" }).maxBodyBytes,
    TAMANO_MAXIMO_WEBHOOK_WHATSAPP);
});

test("[EQ-115] verifica la firma HMAC-SHA256 sobre el cuerpo original", () => {
  const rawBody = Buffer.from('{\n  "object": "whatsapp_business_account"\n}', "utf8");
  const signature = firma(rawBody);
  assert.equal(verificarFirmaWebhookWhatsApp(rawBody, signature, APP_SECRET), true);
  assert.equal(verificarFirmaWebhookWhatsApp(Buffer.from(rawBody.toString().replace("account", "changed")), signature, APP_SECRET), false);
  assert.equal(verificarFirmaWebhookWhatsApp(rawBody, signature, "otro-secreto"), false);
  assert.equal(verificarFirmaWebhookWhatsApp(rawBody, "sha1=incorrecta", APP_SECRET), false);
  assert.equal(verificarFirmaWebhookWhatsApp(rawBody, "", APP_SECRET), false);
  assert.equal(verificarFirmaWebhookWhatsApp(rawBody.toString(), signature, APP_SECRET), false);
});

test("[EQ-115] GET de Meta devuelve hub.challenge exacto cuando Verify Token coincide", () => {
  const servicio = crearServicio();
  assert.deepEqual(servicio.verificarSuscripcion({
    mode: "subscribe", token: VERIFY_TOKEN, challenge: "987654321",
  }), { statusCode: 200, body: "987654321" });
});

test("[EQ-115] GET rechaza token o modo incorrectos y falla cerrado si no hay Verify Token", () => {
  const servicio = crearServicio();
  assert.equal(servicio.verificarSuscripcion({ mode: "subscribe", token: "incorrecto", challenge: "123" }).statusCode, 403);
  assert.equal(servicio.verificarSuscripcion({ mode: "unsubscribe", token: VERIFY_TOKEN, challenge: "123" }).statusCode, 403);
  assert.equal(servicio.verificarSuscripcion({ mode: "subscribe", token: VERIFY_TOKEN, challenge: "" }).statusCode, 403);
  assert.equal(crearServicio({ verifyToken: "" }).verificarSuscripcion({
    mode: "subscribe", token: VERIFY_TOKEN, challenge: "123",
  }).statusCode, 503);
});

test("[EQ-115] POST válido procesa solo una notificación autenticada de WhatsApp Business", async () => {
  const recibidos = [];
  const servicio = crearServicio({ alRecibirEvento: async (evento) => recibidos.push(evento) });
  const rawBody = Buffer.from(JSON.stringify(payloadMeta, null, 2));
  const resultado = await servicio.procesarNotificacion({ rawBody, signature: firma(rawBody) });
  assert.deepEqual(resultado, { statusCode: 200, body: { recibido: true } });
  assert.deepEqual(recibidos, [payloadMeta]);
});

test("[EQ-115] POST rechaza firma ausente o inválida antes de procesar el JSON", async () => {
  let procesados = 0;
  const servicio = crearServicio({ alRecibirEvento: async () => { procesados += 1; } });
  const rawBody = Buffer.from(JSON.stringify(payloadMeta));
  assert.equal((await servicio.procesarNotificacion({ rawBody, signature: undefined })).statusCode, 401);
  assert.equal((await servicio.procesarNotificacion({ rawBody, signature: firma(rawBody, "secreto-incorrecto") })).statusCode, 401);
  assert.equal(procesados, 0);
});

test("[EQ-115] POST rechaza JSON inválido y objetos que no sean WhatsApp Business", async () => {
  const servicio = crearServicio();
  const jsonInvalido = Buffer.from("{no-json");
  assert.equal((await servicio.procesarNotificacion({
    rawBody: jsonInvalido, signature: firma(jsonInvalido),
  })).statusCode, 400);

  const otroObjeto = Buffer.from(JSON.stringify({ object: "page", entry: [] }));
  assert.equal((await servicio.procesarNotificacion({
    rawBody: otroObjeto, signature: firma(otroObjeto),
  })).statusCode, 400);
});

test("[EQ-115] POST no acepta notificaciones si falta App Secret", async () => {
  const rawBody = Buffer.from(JSON.stringify(payloadMeta));
  const servicio = crearServicio({ appSecret: "" });
  const resultado = await servicio.procesarNotificacion({ rawBody, signature: firma(rawBody) });
  assert.equal(resultado.statusCode, 503);
  assert.equal(resultado.body.codigo, "WEBHOOK_NO_CONFIGURADO");
});

test("[EQ-115] servidor HTTP expone el GET de Meta sin exigir sesión", async () => {
  const servicio = crearServicio();
  await conServidor({ servicioWebhookWhatsApp: servicio }, async (base) => {
    const query = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "meta-challenge-123",
    });
    const response = await fetch(`${base}${RUTA_WEBHOOK_WHATSAPP}?${query}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/plain/);
    assert.equal(await response.text(), "meta-challenge-123");
  });
});

test("[EQ-115] servidor HTTP valida firma POST y publica evento en el bus", async () => {
  const bus = crearBusEnMemoria();
  const servicio = crearServicio({
    alRecibirEvento: (evento) => bus.publicar("whatsapp.webhook.recibido", {
      tipo: "whatsapp.webhook.recibido", datos: evento,
    }),
  });
  const rawBody = Buffer.from(JSON.stringify(payloadMeta, null, 2));

  await conServidor({ busEventos: bus, servicioWebhookWhatsApp: servicio }, async (base) => {
    const response = await fetch(`${base}${RUTA_WEBHOOK_WHATSAPP}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": firma(rawBody) },
      body: rawBody,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { recibido: true });
    const [evento] = bus.publicados();
    assert.equal(evento.routingKey, "whatsapp.webhook.recibido");
    assert.deepEqual(evento.evento.datos, payloadMeta);
  });
});

test("[EQ-115] servidor HTTP rechaza firma incorrecta y no publica eventos", async () => {
  const bus = crearBusEnMemoria();
  const servicio = crearServicio({
    alRecibirEvento: (evento) => bus.publicar("whatsapp.webhook.recibido", evento),
  });
  const rawBody = Buffer.from(JSON.stringify(payloadMeta));

  await conServidor({ busEventos: bus, servicioWebhookWhatsApp: servicio }, async (base) => {
    const response = await fetch(`${base}${RUTA_WEBHOOK_WHATSAPP}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": firma(rawBody, "otro-secreto") },
      body: rawBody,
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).codigo, "FIRMA_NO_VALIDA");
    assert.equal(bus.publicados().length, 0);
  });
});

test("[EQ-115] servidor HTTP limita el tamaño del cuerpo y rechaza otros métodos", async () => {
  const servicio = crearServicio({ maxBodyBytes: 32 });
  await conServidor({ servicioWebhookWhatsApp: servicio }, async (base) => {
    const grande = Buffer.from(JSON.stringify(payloadMeta));
    const response = await fetch(`${base}${RUTA_WEBHOOK_WHATSAPP}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": firma(grande) },
      body: grande,
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).codigo, "PAYLOAD_DEMASIADO_GRANDE");

    const put = await fetch(`${base}${RUTA_WEBHOOK_WHATSAPP}`, { method: "PUT" });
    assert.equal(put.status, 405);
    assert.equal(put.headers.get("allow"), "GET, POST");
  });
});

test("[EQ-115] error al aceptar la notificación devuelve 500 para permitir reentrega de Meta", async () => {
  const servicio = crearServicio({
    alRecibirEvento: async () => { throw new Error("fallo interno de prueba"); },
  });
  const rawBody = Buffer.from(JSON.stringify(payloadMeta));
  const resultado = await servicio.procesarNotificacion({ rawBody, signature: firma(rawBody) });
  assert.equal(resultado.statusCode, 500);
  assert.equal(resultado.body.codigo, "ERROR_PROCESANDO_WEBHOOK");
});
