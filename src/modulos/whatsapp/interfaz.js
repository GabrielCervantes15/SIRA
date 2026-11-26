/**
 * EQ-114 · BASE-10: puerto de integración con WhatsApp.
 * Los consumidores dependen de este contrato, no de Meta ni del simulador.
 */
export const METODOS_PROVEEDOR_WHATSAPP = Object.freeze([
  "enviarPlantilla",
  "obtenerEstadoEntrega",
]);

// Coinciden con el catálogo de estados de entrega del esquema aspirantes.
export const ESTADOS_ENTREGA_WHATSAPP = Object.freeze({
  PENDIENTE: "PENDIENTE",
  ENVIADO: "ENVIADO",
  ENTREGADO: "ENTREGADO",
  LEIDO: "LEIDO",
  FALLIDO: "FALLIDO",
});

/**
 * @typedef {Object} SolicitudPlantilla
 * @property {string} telefono Número internacional con + y código de país.
 * @property {string} plantilla Nombre técnico de la plantilla.
 * @property {string} idioma Código de idioma configurado para la plantilla.
 * @property {string[]} [parametros] Valores de texto, en el orden de la plantilla.
 */

/**
 * @typedef {Object} EstadoEntregaWhatsApp
 * @property {string} whatsappMessageId Identificador opaco del proveedor.
 * @property {keyof typeof ESTADOS_ENTREGA_WHATSAPP} estadoEntrega
 * @property {string} fechaActualizacion Fecha ISO 8601 del estado.
 * @property {string|null} motivoFalla Motivo si el estado es FALLIDO; null en otro caso.
 */

/**
 * @typedef {Object} IProveedorWhatsApp
 * @property {(solicitud: SolicitudPlantilla) => Promise<EstadoEntregaWhatsApp>} enviarPlantilla
 * @property {(whatsappMessageId: string) => Promise<EstadoEntregaWhatsApp|null>} obtenerEstadoEntrega
 *   Lee el último estado conocido; null si no existe. No promete consultar Meta directamente.
 */

export class ErrorWhatsApp extends Error {
  constructor(codigo, mensaje, { reintentable = false } = {}) {
    super(mensaje);
    this.name = "ErrorWhatsApp";
    this.codigo = codigo;
    this.reintentable = reintentable === true;
  }
}

export function implementaProveedorWhatsApp(objeto) {
  return Boolean(objeto && typeof objeto === "object" &&
    METODOS_PROVEEDOR_WHATSAPP.every((metodo) => typeof objeto[metodo] === "function"));
}

/** Validación estructural compartida. No comprueba consentimiento ni aprobación en Meta. */
export function validarSolicitudPlantilla(solicitud) {
  if (!solicitud || typeof solicitud !== "object" || Array.isArray(solicitud)) {
    throw new ErrorWhatsApp("SOLICITUD_INVALIDA", "Se requiere una solicitud de plantilla.");
  }
  const { telefono, plantilla, idioma, parametros = [] } = solicitud;
  if (typeof telefono !== "string" || !/^\+[1-9]\d{7,14}$/.test(telefono)) {
    throw new ErrorWhatsApp("SOLICITUD_INVALIDA", "El teléfono debe tener formato internacional (+ y 8 a 15 dígitos).");
  }
  if (typeof plantilla !== "string" || !/^[a-z0-9_]{1,512}$/.test(plantilla)) {
    throw new ErrorWhatsApp("SOLICITUD_INVALIDA", "Indica el nombre técnico de la plantilla.");
  }
  if (typeof idioma !== "string" || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(idioma)) {
    throw new ErrorWhatsApp("SOLICITUD_INVALIDA", "Indica un código de idioma válido, por ejemplo es_MX.");
  }
  if (!Array.isArray(parametros) || Array.from(parametros).some((p) => typeof p !== "string" || !p.trim())) {
    throw new ErrorWhatsApp("SOLICITUD_INVALIDA", "Los parámetros deben ser textos no vacíos en el orden de la plantilla.");
  }
  return { telefono, plantilla, idioma, parametros: [...parametros] };
}
