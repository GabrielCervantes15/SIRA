/** EQ-114 · BASE-10: proveedor de WhatsApp en memoria, sin red ni credenciales. */
import { randomUUID } from "node:crypto";
import { ErrorWhatsApp, ESTADOS_ENTREGA_WHATSAPP as E, validarSolicitudPlantilla } from "./interfaz.js";

const TRANSICIONES = Object.freeze({
  [E.PENDIENTE]: [E.ENVIADO, E.ENTREGADO, E.LEIDO, E.FALLIDO],
  [E.ENVIADO]: [E.ENTREGADO, E.LEIDO, E.FALLIDO],
  [E.ENTREGADO]: [E.LEIDO],
  [E.LEIDO]: [],
  [E.FALLIDO]: [],
});

/** @returns {import('./interfaz.js').IProveedorWhatsApp & Object} */
export function crearProveedorWhatsAppSimulado({ indisponible = false, reloj = () => new Date(), generarId = randomUUID } = {}) {
  let servicioCaido = Boolean(indisponible);
  let rechazoSiguiente = false;
  const mensajes = new Map();

  function comprobarDisponibilidad() {
    if (servicioCaido) {
      throw new ErrorWhatsApp("SERVICIO_NO_DISPONIBLE", "El proveedor simulado no está disponible.", { reintentable: true });
    }
  }

  function validarId(id) {
    if (typeof id !== "string" || !id.trim()) {
      throw new ErrorWhatsApp("SOLICITUD_INVALIDA", "Indica el identificador del mensaje.");
    }
  }

  function fecha() {
    const valor = reloj();
    return (valor instanceof Date ? valor : new Date(valor)).toISOString();
  }

  return {
    async enviarPlantilla(solicitud) {
      validarSolicitudPlantilla(solicitud);
      comprobarDisponibilidad();
      if (rechazoSiguiente) {
        rechazoSiguiente = false;
        throw new ErrorWhatsApp("ENVIO_RECHAZADO", "El proveedor simulado rechazó la plantilla.");
      }
      // Prefijo deliberadamente distinto a un wamid real de Meta.
      const whatsappMessageId = `sim-wa-${generarId()}`;
      if (mensajes.has(whatsappMessageId)) {
        throw new ErrorWhatsApp("RESPUESTA_INVALIDA", "El simulador generó un identificador duplicado.");
      }
      const resultado = {
        whatsappMessageId,
        estadoEntrega: E.ENVIADO,
        fechaActualizacion: fecha(),
        motivoFalla: null,
      };
      mensajes.set(whatsappMessageId, resultado);
      return { ...resultado };
    },

    async obtenerEstadoEntrega(whatsappMessageId) {
      validarId(whatsappMessageId);
      comprobarDisponibilidad();
      const resultado = mensajes.get(whatsappMessageId);
      return resultado ? { ...resultado } : null;
    },

    // Controles exclusivos del simulador; no forman parte del puerto de producción.
    simularIndisponibilidad(valor) {
      servicioCaido = Boolean(valor);
    },

    simularRechazoSiguiente() {
      rechazoSiguiente = true;
    },

    simularEstadoEntrega(whatsappMessageId, estadoEntrega, motivoFalla = null) {
      validarId(whatsappMessageId);
      const anterior = mensajes.get(whatsappMessageId);
      if (!anterior) throw new ErrorWhatsApp("MENSAJE_NO_ENCONTRADO", "No existe ese mensaje simulado.");
      if (estadoEntrega === anterior.estadoEntrega) return { ...anterior };
      if (!TRANSICIONES[anterior.estadoEntrega].includes(estadoEntrega)) {
        throw new ErrorWhatsApp("ESTADO_INVALIDO", "La transición de estado no es válida.");
      }
      if (estadoEntrega === E.FALLIDO && (typeof motivoFalla !== "string" || !motivoFalla.trim())) {
        throw new ErrorWhatsApp("ESTADO_INVALIDO", "El estado FALLIDO requiere un motivo.");
      }
      const actualizado = {
        ...anterior,
        estadoEntrega,
        fechaActualizacion: fecha(),
        motivoFalla: estadoEntrega === E.FALLIDO ? motivoFalla.trim() : null,
      };
      mensajes.set(whatsappMessageId, actualizado);
      return { ...actualizado };
    },

    reiniciar() {
      mensajes.clear();
      servicioCaido = false;
      rechazoSiguiente = false;
    },
  };
}
