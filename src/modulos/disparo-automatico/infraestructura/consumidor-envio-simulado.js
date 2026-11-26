/**
 * HU1 · Consumidor PROVISIONAL de `disparo.envio.enviado.whatsapp` (EQ-83 / EQ-85).
 *
 * Cuando la cola de envío (EQ-85) confirma que WhatsApp aceptó la plantilla, deja el
 * mensaje en la conversación del aspirante (HU3), registra «Mensaje automático de
 * reactivación» en su historial y actualiza vecesNotificado y fechaUltimaActividad,
 * como hacía antes el endpoint de envío, para que la aplicación siga igual.
 *
 * Descarta eventos repetidos por `eventId`.
 * EQ-87 debe sustituirlo: decide qué resultados actualizan el conteo de notificados,
 * la última actividad (EQ-77 §6.3 dice que el saliente no debería) y el historial.
 */
import { TIPO_ENVIO_ENVIADO } from "../eventos.js";

/**
 * @param {Object} d
 * @param {{ suscribir: Function }} d.bus
 * @param {Object} d.repositorioMonitoreo  conversaciones, aspirantes y registrarActividad (memoria)
 * @param {Array|null} [d.historialMonitoreo]
 * @returns {() => void} cancelar la suscripción
 */
export function conectarConsumidorEnvioSimulado({ bus, repositorioMonitoreo, historialMonitoreo = null }) {
  const procesados = new Set();

  return bus.suscribir(`${TIPO_ENVIO_ENVIADO}.whatsapp`, async (evento) => {
    if (procesados.has(evento.eventId)) return;
    procesados.add(evento.eventId);

    const { aspiranteId, envioId, texto, whatsappMessageId, estadoEntrega, enviadoEn } = evento.datos;
    const fecha = enviadoEn || evento.publicadoEn;

    repositorioMonitoreo.conversaciones?.push({
      id: `mia-${envioId}`, aspiranteId, direccion: "SALIENTE",
      remitenteTipo: "BOT_IA", remitenteId: "disparo-automatico", contenido: texto,
      tipoContenido: "TEXTO", estadoEntrega: estadoEntrega === "PENDIENTE" ? "ENVIADO" : estadoEntrega,
      whatsappMessageId: whatsappMessageId ?? null, fechaEnvio: fecha,
    });

    const actividad = {
      id: `h-mia-${envioId}`, aspiranteId, tipoEvento: "MENSAJE_ENVIADO",
      titulo: "Mensaje automático de reactivación", detalle: texto, motivoRechazo: null,
      autorTipo: "SISTEMA", fechaEvento: fecha,
    };
    await repositorioMonitoreo.registrarActividad?.(actividad);
    if (historialMonitoreo) historialMonitoreo.push(actividad);

    const registro = repositorioMonitoreo.aspirantes?.find((a) => a.id === aspiranteId);
    if (registro) {
      registro.fechaUltimaActividad = fecha;
      registro.vecesNotificado = (registro.vecesNotificado || 0) + 1;
    }
  });
}
