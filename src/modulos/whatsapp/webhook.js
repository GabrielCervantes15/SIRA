/**
 * EQ-115 (BASE-11) · Verificación y recepción del webhook de WhatsApp Cloud API.
 *
 * Meta usa dos verificaciones distintas:
 * - GET: compara el Verify Token configurado en el dashboard y devuelve hub.challenge.
 * - POST: valida X-Hub-Signature-256 = HMAC-SHA256(cuerpo HTTP original, App Secret).
 *
 * El cuerpo se verifica como Buffer antes de interpretar el JSON. Nunca se registran
 * tokens, secretos, firmas ni el contenido de los mensajes en logs.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const RUTA_WEBHOOK_WHATSAPP = "/api/v1/webhooks/whatsapp";
export const TAMANO_MAXIMO_WEBHOOK_WHATSAPP = 1_048_576;

function compararTextoConstante(valor, esperado) {
  if (typeof valor !== "string" || typeof esperado !== "string" || !valor || !esperado) return false;
  const a = Buffer.from(valor, "utf8");
  const b = Buffer.from(esperado, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Lee únicamente la configuración del webhook; nunca imprime ni persiste secretos. */
export function leerConfiguracionWebhookWhatsApp(env = process.env) {
  const solicitado = Number(env.WHATSAPP_WEBHOOK_MAX_BODY_BYTES ?? TAMANO_MAXIMO_WEBHOOK_WHATSAPP);
  const maxBodyBytes = Number.isSafeInteger(solicitado) && solicitado > 0
    ? Math.min(solicitado, 5_242_880)
    : TAMANO_MAXIMO_WEBHOOK_WHATSAPP;

  return {
    verifyToken: String(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "").trim(),
    appSecret: String(env.WHATSAPP_APP_SECRET ?? "").trim(),
    maxBodyBytes,
  };
}

/**
 * Valida la firma de Meta sobre los bytes originales del cuerpo HTTP.
 * @param {Buffer} rawBody Cuerpo sin parsear ni volver a serializar.
 * @param {string} firma Encabezado X-Hub-Signature-256.
 * @param {string} appSecret App Secret de Meta (no es el Verify Token ni el access token).
 */
export function verificarFirmaWebhookWhatsApp(rawBody, firma, appSecret) {
  if (!Buffer.isBuffer(rawBody) || typeof firma !== "string" || typeof appSecret !== "string" || !appSecret) {
    return false;
  }

  const coincidencia = /^sha256=([a-f0-9]{64})$/i.exec(firma.trim());
  if (!coincidencia) return false;

  const recibida = Buffer.from(coincidencia[1], "hex");
  const esperada = createHmac("sha256", appSecret).update(rawBody).digest();
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

/**
 * Servicio independiente del servidor HTTP para probar el handshake y los POST.
 * `alRecibirEvento` recibe solo notificaciones autenticadas y con estructura Meta.
 */
export function crearServicioWebhookWhatsApp({
  verifyToken = "",
  appSecret = "",
  maxBodyBytes = TAMANO_MAXIMO_WEBHOOK_WHATSAPP,
  alRecibirEvento = async () => {},
} = {}) {
  const tokenConfigurado = typeof verifyToken === "string" ? verifyToken.trim() : "";
  const secretoConfigurado = typeof appSecret === "string" ? appSecret.trim() : "";
  const limite = Number.isSafeInteger(maxBodyBytes) && maxBodyBytes > 0
    ? Math.min(maxBodyBytes, 5_242_880)
    : TAMANO_MAXIMO_WEBHOOK_WHATSAPP;

  if (typeof alRecibirEvento !== "function") {
    throw new TypeError("alRecibirEvento debe ser una función.");
  }

  return {
    maxBodyBytes: limite,

    /** GET de verificación que Meta ejecuta al registrar la URL de callback. */
    verificarSuscripcion({ mode, token, challenge } = {}) {
      if (!tokenConfigurado) {
        return { statusCode: 503, body: "Webhook de WhatsApp no configurado." };
      }
      if (mode !== "subscribe" || typeof challenge !== "string" || !challenge ||
          !compararTextoConstante(token, tokenConfigurado)) {
        return { statusCode: 403, body: "Forbidden" };
      }
      return { statusCode: 200, body: challenge };
    },

    /** POST de notificación: firma primero, JSON después. */
    async procesarNotificacion({ rawBody, signature } = {}) {
      if (!secretoConfigurado) {
        return {
          statusCode: 503,
          body: { codigo: "WEBHOOK_NO_CONFIGURADO", mensaje: "Falta configurar WHATSAPP_APP_SECRET." },
        };
      }
      if (!Buffer.isBuffer(rawBody)) {
        return {
          statusCode: 400,
          body: { codigo: "CUERPO_INVALIDO", mensaje: "Se requiere el cuerpo HTTP original." },
        };
      }
      if (rawBody.length > limite) {
        return {
          statusCode: 413,
          body: { codigo: "PAYLOAD_DEMASIADO_GRANDE", mensaje: "La notificación excede el tamaño permitido." },
        };
      }
      if (!verificarFirmaWebhookWhatsApp(rawBody, signature, secretoConfigurado)) {
        return {
          statusCode: 401,
          body: { codigo: "FIRMA_NO_VALIDA", mensaje: "La firma de la notificación no es válida." },
        };
      }

      let payload;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        return {
          statusCode: 400,
          body: { codigo: "JSON_INVALIDO", mensaje: "La notificación no contiene JSON válido." },
        };
      }

      if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
        return {
          statusCode: 400,
          body: { codigo: "EVENTO_WHATSAPP_INVALIDO", mensaje: "La estructura no corresponde a un webhook de WhatsApp Business." },
        };
      }

      try {
        await alRecibirEvento(payload);
      } catch {
        // Un 5xx permite que Meta vuelva a entregar la notificación.
        return {
          statusCode: 500,
          body: { codigo: "ERROR_PROCESANDO_WEBHOOK", mensaje: "No fue posible aceptar la notificación." },
        };
      }

      return { statusCode: 200, body: { recibido: true } };
    },
  };
}
