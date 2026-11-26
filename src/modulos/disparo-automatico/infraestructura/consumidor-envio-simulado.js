/**
 * HU1-7 (EQ-83) · Consumidor SIMULADO de `disparo.envio.solicitado`.
 *
 * Mientras no exista el envío real (EQ-85 conectará WhatsApp Cloud API con el puerto
 * de `src/modulos/whatsapp/`), este consumidor hace lo mismo que hacía antes el
 * endpoint de envío, para que la aplicación siga funcionando igual:
 *
 *   WHATSAPP → agrega el mensaje a la conversación del aspirante (canal simulado de HU3),
 *              registra «Mensaje automático de reactivación» en su historial y
 *              actualiza vecesNotificado y fechaUltimaActividad.
 *   CORREO   → no hace nada (no hay SMTP; BASE-9 no se construyó).
 *
 * Descarta eventos repetidos por `eventId`.
 * EQ-85 debe reemplazar el canal WHATSAPP de este consumidor; EQ-87 decide qué
 * resultados actualizan la última actividad (EQ-77 §6.3 dice que el saliente no debería).
 */
import { TIPO_ENVIO_SOLICITADO } from "../eventos.js";

/**
 * @param {Object} d
 * @param {{ suscribir: Function }} d.bus
 * @param {Object} d.repositorioMonitoreo  conversaciones, aspirantes y registrarActividad (memoria)
 * @param {Array|null} [d.historialMonitoreo]
 * @returns {() => void} cancelar la suscripción
 */
export function conectarConsumidorEnvioSimulado({ bus, repositorioMonitoreo, historialMonitoreo = null }) {
  const procesados = new Set();

  return bus.suscribir(`${TIPO_ENVIO_SOLICITADO}.whatsapp`, async (evento) => {
    if (procesados.has(evento.eventId)) return;
    procesados.add(evento.eventId);

    const { aspiranteId, envioId, texto } = evento.datos;
    const fecha = evento.publicadoEn;

    repositorioMonitoreo.conversaciones?.push({
      id: `mia-${envioId}`, aspiranteId, direccion: "SALIENTE",
      remitenteTipo: "BOT_IA", remitenteId: "disparo-automatico", contenido: texto,
      tipoContenido: "TEXTO", estadoEntrega: "ENVIADO", whatsappMessageId: null, fechaEnvio: fecha,
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
