/**
 * EQ-85 (HU1-9) · Adaptador real de WhatsApp Cloud API detrás del puerto de BASE-10.
 *
 * Envía una plantilla aprobada con POST /{versión}/{phone-number-id}/messages
 * (https://developers.facebook.com/documentation/business-messaging/whatsapp/).
 * Un 200 de Meta solo significa que aceptó la petición: el mensaje queda PENDIENTE
 * hasta que el webhook (EQ-115) informe enviado, entregado, leído o fallido.
 *
 * Errores: se clasifican por el código de Meta (no por el HTTP), como recomienda su
 * documentación. Los temporales (límite de ritmo, servicio no disponible, errores del
 * servidor y de red) salen con `reintentable: true`; el resto, con `false`.
 *
 * Configuración (variables de entorno de .env.example, sección 6):
 *   WHATSAPP_MOCK_ENABLED=false para usar Cloud API (si no, se usa el simulador),
 *   WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_API_URL
 *   (por omisión https://graph.facebook.com/v26.0).
 */
import { ErrorWhatsApp, ESTADOS_ENTREGA_WHATSAPP as E, validarSolicitudPlantilla } from "./interfaz.js";

export const URL_API_POR_OMISION = "https://graph.facebook.com/v26.0";

/**
 * Códigos de Meta que son temporales (página oficial «WhatsApp error codes»):
 * 4 y 80007 límite de llamadas, 130429 ritmo, 131016 y 133004 servicio no disponible,
 * 131056 demasiados mensajes al mismo número, 131057 cuenta en mantenimiento,
 * 131000 error desconocido («reintentar»).
 * 131049 no está: Meta pide esperar al menos 24 h, así que no se reintenta dentro del lote.
 */
export const CODIGOS_META_REINTENTABLES = Object.freeze(new Set([4, 80007, 130429, 131000, 131016, 131056, 131057, 133004]));

/** Motivo legible para los códigos permanentes más comunes. */
const MOTIVOS = Object.freeze({
  0: "El token de acceso de Meta no es válido.",
  10: "La app no tiene permiso para enviar mensajes.",
  100: "Meta rechazó un parámetro de la petición.",
  190: "El token de acceso de Meta expiró.",
  131026: "El número no puede recibir el mensaje (no tiene WhatsApp o no aceptó los términos).",
  131048: "Meta restringió los envíos de este número por calidad.",
  131049: "Meta no entregó el mensaje para cuidar la experiencia del usuario; reintentar en al menos 24 h.",
  131050: "El aspirante pidió no recibir mensajes de marketing.",
  132000: "El número de variables no coincide con la plantilla.",
  132001: "La plantilla no existe en ese idioma o no está aprobada.",
  132012: "Los valores de las variables no tienen el formato correcto.",
  132015: "La plantilla está pausada por baja calidad.",
  132016: "La plantilla fue deshabilitada.",
  368: "La cuenta está restringida por una violación de políticas.",
});

export function esCodigoMetaReintentable(codigo) {
  return CODIGOS_META_REINTENTABLES.has(Number(codigo));
}

/**
 * Lee la configuración del entorno. Devuelve null (usar el simulador) si
 * WHATSAPP_MOCK_ENABLED no es "false" o si falta el token o el número.
 */
export function leerConfiguracionCloudApi(env = process.env) {
  if (String(env.WHATSAPP_MOCK_ENABLED ?? "true").trim().toLowerCase() !== "false") return null;
  const token = String(env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
  const phoneNumberId = String(env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  if (!token || !phoneNumberId) return null;
  const urlBase = String(env.WHATSAPP_API_URL ?? "").trim().replace(/\/+$/, "") || URL_API_POR_OMISION;
  return { token, phoneNumberId, urlBase };
}

/** Cuerpo del mensaje de plantilla con variables de texto en el cuerpo. */
export function cuerpoMensajePlantilla({ telefono, plantilla, idioma, parametros }) {
  const template = { name: plantilla, language: { code: idioma } };
  if (parametros.length) {
    template.components = [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }];
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: telefono.replace(/^\+/, ""),
    type: "template",
    template,
  };
}

/** Convierte una respuesta de error de Meta en ErrorWhatsApp. */
export function errorDesdeRespuestaMeta(status, cuerpo) {
  const error = cuerpo?.error ?? {};
  const codigo = Number(error.code);
  if (Number.isFinite(codigo)) {
    const detalle = error.error_data?.details || error.message || "Error de WhatsApp Cloud API.";
    return new ErrorWhatsApp(`META_${codigo}`, MOTIVOS[codigo] ?? detalle, { reintentable: esCodigoMetaReintentable(codigo) });
  }
  // Sin código de Meta: los 5xx y el 429 son temporales.
  const reintentable = status >= 500 || status === 429;
  return new ErrorWhatsApp(`HTTP_${status}`, `WhatsApp Cloud API respondió ${status}.`, { reintentable });
}

/**
 * @param {Object} opciones
 * @param {string} opciones.token
 * @param {string} opciones.phoneNumberId
 * @param {string} [opciones.urlBase]  Con la versión, p. ej. https://graph.facebook.com/v26.0
 * @param {typeof fetch} [opciones.fetch]
 * @param {number} [opciones.tiempoLimiteMs]
 * @param {() => Date} [opciones.reloj]
 * @returns {import('./interfaz.js').IProveedorWhatsApp}
 */
export function crearProveedorWhatsAppCloudApi({
  token, phoneNumberId, urlBase = URL_API_POR_OMISION, fetch: fetchFn = globalThis.fetch,
  tiempoLimiteMs = 10_000, reloj = () => new Date(),
} = {}) {
  if (!token || !phoneNumberId) throw new Error("El adaptador de Cloud API requiere WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID.");
  if (typeof fetchFn !== "function") throw new Error("El adaptador de Cloud API requiere fetch.");
  const url = `${urlBase.replace(/\/+$/, "")}/${encodeURIComponent(phoneNumberId)}/messages`;
  // Último estado conocido por mensaje; el webhook de EQ-115 lo irá actualizando.
  const estados = new Map();

  return {
    async enviarPlantilla(solicitud) {
      const valida = validarSolicitudPlantilla(solicitud);
      let respuesta;
      try {
        respuesta = await fetchFn(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(cuerpoMensajePlantilla(valida)),
          signal: AbortSignal.timeout(tiempoLimiteMs),
        });
      } catch (error) {
        const tiempo = error?.name === "TimeoutError" || error?.name === "AbortError";
        throw new ErrorWhatsApp(tiempo ? "TIEMPO_AGOTADO" : "RED_NO_DISPONIBLE",
          tiempo ? "WhatsApp Cloud API no respondió a tiempo." : "No se pudo conectar con WhatsApp Cloud API.",
          { reintentable: true });
      }

      const cuerpo = await respuesta.json().catch(() => null);
      if (!respuesta.ok) throw errorDesdeRespuestaMeta(respuesta.status, cuerpo);

      const whatsappMessageId = cuerpo?.messages?.[0]?.id;
      if (typeof whatsappMessageId !== "string" || !whatsappMessageId) {
        throw new ErrorWhatsApp("RESPUESTA_INVALIDA", "WhatsApp Cloud API no devolvió el id del mensaje.");
      }
      const resultado = {
        whatsappMessageId,
        estadoEntrega: E.PENDIENTE,
        fechaActualizacion: reloj().toISOString(),
        motivoFalla: null,
      };
      estados.set(whatsappMessageId, resultado);
      return { ...resultado };
    },

    async obtenerEstadoEntrega(whatsappMessageId) {
      if (typeof whatsappMessageId !== "string" || !whatsappMessageId.trim()) {
        throw new ErrorWhatsApp("SOLICITUD_INVALIDA", "Indica el identificador del mensaje.");
      }
      const estado = estados.get(whatsappMessageId);
      return estado ? { ...estado } : null;
    },
  };
}
