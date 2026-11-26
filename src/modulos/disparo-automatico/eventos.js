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
      // EQ-85: valores de las variables {{1}}, {{2}}… de la plantilla de Meta, en orden.
      parametros: [...(envio.parametros ?? [])],
    },
  };
}

/**
 * EQ-85 (HU1-9) · Resultado de cada envío por WhatsApp (los consume EQ-87).
 * Clave de enrutamiento: `<tipo>.whatsapp`. `eventId` = `<envioId>:<tipo>`, así un
 * consumidor puede descartar repetidos.
 *
 *   disparo.envio.enviado   Meta aceptó la plantilla (`whatsappMessageId`, `estadoEntrega`).
 *   disparo.envio.fallido   No se envió: `codigo` y `motivo` (error permanente, reintentos
 *                           agotados o pendiente caducado).
 *   disparo.envio.diferido  Se pospuso (límite de 24 h o fuera de horario): `motivo` y
 *                           `reanudaEn`. Se publica una vez por motivo; después llega
 *                           `enviado` o `fallido`.
 */
export const TIPO_ENVIO_ENVIADO = "disparo.envio.enviado";
export const TIPO_ENVIO_FALLIDO = "disparo.envio.fallido";
export const TIPO_ENVIO_DIFERIDO = "disparo.envio.diferido";

export function crearEventoResultadoEnvio(tipo, solicitado, extra, ahora = new Date()) {
  const { loteId, envioId, colaboradorId, aspiranteId, canal } = solicitado.datos;
  const sufijo = tipo === TIPO_ENVIO_DIFERIDO ? `:${extra.codigo}` : "";
  return {
    eventId: `${envioId}:${tipo}${sufijo}`,
    tipo,
    version: 1,
    publicadoEn: ahora.toISOString(),
    datos: { loteId, envioId, colaboradorId, aspiranteId, canal, ...extra },
  };
}
