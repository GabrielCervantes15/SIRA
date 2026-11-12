/**
 * Textos que se muestran en el panel del aspirante (EQ-40 · HU3-1).
 * Provisionales: la redacción final sale del Figma y del PO.
 */

/** «Estatus» del panel de contacto. */
const TEXTO_ESTADO = Object.freeze({
  RECIBIDA: "Solicitud recibida; aún no entrega su constancia de calificaciones",
  EN_REVISION: "Entregó la constancia de calificaciones; Registro Escolar la está revisando",
  CONSTANCIA_RECHAZADA: "Entregó la constancia de calificaciones pero fue rechazada",
  ACEPTADA: "Solicitud aceptada por Registro Escolar",
  RECHAZADA: "Solicitud rechazada por Registro Escolar",
});

/** @param {string} codigo */
export function textoEstado(codigo) {
  return TEXTO_ESTADO[codigo] ?? "Estado de la solicitud no reconocido";
}

/** Tipos de evento de la línea de tiempo (HU 3, criterio 1). */
export const TIPOS_ACTIVIDAD = Object.freeze({
  MENSAJE_ENVIADO: "MENSAJE_ENVIADO",
  CONSTANCIA_ENTREGADA: "CONSTANCIA_ENTREGADA",
  RECHAZO: "RECHAZO",
});

/**
 * Redacta el evento desde la perspectiva del aspirante, como en el Figma.
 * El motivo se escribe después de «debido a que…», así que debe ser una frase
 * que continúe esa oración.
 * @param {{ tipo: string, origen?: string, objeto?: string, motivo?: string | null }} actividad
 */
export function textoActividad(actividad) {
  switch (actividad.tipo) {
    case TIPOS_ACTIVIDAD.MENSAJE_ENVIADO:
      return actividad.origen === "colaborador"
        ? "Recibió un mensaje de un colaborador."
        : "Recibió un mensaje automático.";

    case TIPOS_ACTIVIDAD.CONSTANCIA_ENTREGADA:
      return "Entregó la constancia de calificaciones a Registro Escolar.";

    case TIPOS_ACTIVIDAD.RECHAZO: {
      const sujeto = actividad.objeto === "solicitud" ? "La solicitud" : "La constancia de calificaciones";
      const motivo = (actividad.motivo ?? "").replace(/[.\s]+$/u, "").trim();
      return `${sujeto} fue rechazada por Registro Escolar${motivo ? ` debido a que ${motivo}` : ""}.`;
    }

    default:
      return "Actividad registrada.";
  }
}
