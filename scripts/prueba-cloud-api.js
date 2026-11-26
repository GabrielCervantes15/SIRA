#!/usr/bin/env node
/**
 * EQ-92 (HU1-16) · Prueba controlada con el número de pruebas de WhatsApp Cloud API.
 *
 * Manda UNA plantilla a UN número (el de pruebas de la cuenta de Meta, EQ-115) usando el
 * mismo adaptador que usa el lote de HU1 (src/modulos/whatsapp/adaptador-cloud-api.js).
 * Por omisión NO envía nada: muestra la petición (con el token oculto). Para enviar, --enviar.
 *
 * Uso (las credenciales salen del entorno; Node 22 puede leer el .env con --env-file):
 *   node --env-file=.env scripts/prueba-cloud-api.js --numero +5216441234567
 *   node --env-file=.env scripts/prueba-cloud-api.js --numero +5216441234567 --enviar
 *   # Plantilla de ejemplo de Meta, por si reactivacion_hu1 aún no está aprobada:
 *   node --env-file=.env scripts/prueba-cloud-api.js --numero +52… --plantilla hello_world --idioma en_US --parametros "" --enviar
 *
 * Variables: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_URL (opcional).
 */
import { pathToFileURL } from "node:url";
import { crearProveedorWhatsAppCloudApi, cuerpoMensajePlantilla, URL_API_POR_OMISION } from "../src/modulos/whatsapp/adaptador-cloud-api.js";
import { validarSolicitudPlantilla } from "../src/modulos/whatsapp/interfaz.js";

export const AYUDA = `Prueba controlada de WhatsApp Cloud API (EQ-92)
  --numero +52…        Número de pruebas registrado en Meta (obligatorio)
  --plantilla nombre   Plantilla aprobada (por omisión reactivacion_hu1)
  --idioma es_MX       Idioma de la plantilla (por omisión es_MX)
  --parametros "a,b"   Valores de {{1}}, {{2}}… separados por comas ("" para ninguno)
  --enviar             Envía de verdad; sin esto solo muestra la petición`;

/** Lee los argumentos y el entorno; no envía nada. */
export function prepararPruebaCloudApi(argv = [], env = {}) {
  const opcion = (nombre, porOmision = null) => {
    const i = argv.indexOf(`--${nombre}`);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : porOmision;
  };
  const errores = [];
  const token = String(env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
  const phoneNumberId = String(env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  if (!token || token.startsWith("mock_")) errores.push("Falta WHATSAPP_ACCESS_TOKEN real.");
  if (!phoneNumberId || phoneNumberId.startsWith("mock_")) errores.push("Falta WHATSAPP_PHONE_NUMBER_ID real.");

  const textoParametros = opcion("parametros", "Ana,Ingeniería en Software");
  const solicitud = {
    telefono: opcion("numero", ""),
    plantilla: opcion("plantilla", "reactivacion_hu1"),
    idioma: opcion("idioma", "es_MX"),
    parametros: textoParametros ? textoParametros.split(",").map((p) => p.trim()).filter(Boolean) : [],
  };
  try {
    validarSolicitudPlantilla(solicitud);
  } catch (error) {
    errores.push(error.message);
  }

  const urlBase = String(env.WHATSAPP_API_URL ?? "").trim().replace(/\/+$/, "") || URL_API_POR_OMISION;
  return {
    errores,
    enviar: argv.includes("--enviar"),
    solicitud,
    configuracion: { token, phoneNumberId, urlBase },
    vistaPrevia: {
      url: `${urlBase}/${phoneNumberId || "<PHONE_NUMBER_ID>"}/messages`,
      autorizacion: token ? `Bearer ${token.slice(0, 4)}…${token.slice(-4)}` : "(sin token)",
      cuerpo: cuerpoMensajePlantilla({ ...solicitud, telefono: solicitud.telefono || "+0" }),
    },
  };
}

export async function ejecutar(argv = process.argv.slice(2), env = process.env, { fetch: fetchFn = globalThis.fetch, salida = console } = {}) {
  if (argv.includes("--ayuda") || argv.includes("-h")) {
    salida.log(AYUDA);
    return 0;
  }
  const prueba = prepararPruebaCloudApi(argv, env);
  salida.log(JSON.stringify(prueba.vistaPrevia, null, 2));
  if (prueba.errores.length) {
    salida.error(`No se puede hacer la prueba:\n- ${prueba.errores.join("\n- ")}\n\n${AYUDA}`);
    return 1;
  }
  if (!prueba.enviar) {
    salida.log("Simulacro: no se envió nada. Agrega --enviar para mandar el mensaje al número de pruebas.");
    return 0;
  }
  const proveedor = crearProveedorWhatsAppCloudApi({ ...prueba.configuracion, fetch: fetchFn });
  try {
    const resultado = await proveedor.enviarPlantilla(prueba.solicitud);
    salida.log(`Meta aceptó el mensaje: ${resultado.whatsappMessageId} (${resultado.estadoEntrega}). Revisa el teléfono de pruebas.`);
    return 0;
  } catch (error) {
    salida.error(`Meta rechazó el envío: ${error.codigo} · ${error.message}${error.reintentable ? " (temporal: reintentar)" : ""}`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await ejecutar();
}
