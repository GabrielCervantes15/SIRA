/**
 * HU1-7 (EQ-83) · Evento `disparo.envio.solicitado`.
 *
 * Se publica UNO por cada aspirante y canal PENDIENTE de un lote, después de que
 * el lote quedó guardado. Sigue la convención de eventos del repositorio
 * (`{ eventId, tipo, version, publicadoEn, datos }`).
 *
 * Clave de enrutamiento: `disparo.envio.solicitado.<canal>` en minúsculas, para que
 * cada consumidor se suscriba solo a su canal:
 *   - `disparo.envio.solicitado.whatsapp`  → EQ-85 (WhatsApp Cloud API)
 *   - `disparo.envio.solicitado.correo`    → canal de correo
 *
 * `eventId` es el id del envío: si un consumidor recibe el mismo evento dos veces
 * (reintento de publicación), puede descartar el repetido por ese id.
 */
export const TIPO_ENVIO_SOLICITADO = "disparo.envio.solicitado";
export const VERSION_EVENTO_ENVIO = 1;

export const routingKeyEnvio = (canal) => `${TIPO_ENVIO_SOLICITADO}.${String(canal).toLowerCase()}`;

/**
 * @param {Object} lote
 * @param {Object} envio  Un envío PENDIENTE del lote.
 * @param {Date} ahora
 */
export function crearEventoEnvioSolicitado(lote, envio, ahora = new Date()) {
  return {
    eventId: envio.id,
    tipo: TIPO_ENVIO_SOLICITADO,
    version: VERSION_EVENTO_ENVIO,
    publicadoEn: ahora.toISOString(),
    datos: {
      loteId: lote.id,
      envioId: envio.id,
      colaboradorId: lote.colaboradorId,
      aspiranteId: envio.aspiranteId,
      canal: envio.canal,
      destino: envio.destino,
      mensajeId: envio.mensajeId,
      texto: envio.texto,
    },
  };
}
