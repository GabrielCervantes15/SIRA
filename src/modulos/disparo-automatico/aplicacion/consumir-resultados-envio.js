/**
 * HU1-11 (EQ-87) · Consumir los resultados del envío.
 *
 * Escucha `disparo.envio.enviado | fallido | diferido` (EQ-85, cualquier canal) y:
 *
 *   ENVIADO   guarda el resultado en el lote; actualiza la fecha de última notificación
 *             del aspirante y suma uno a su conteo (una vez por lote, aunque reciba por
 *             dos canales); registra MENSAJE_AUTOMATICO en su historial con canal, fecha
 *             y mensaje; y deja el mensaje en su conversación (HU3-5, decisión del equipo).
 *   FALLIDO   guarda el resultado y lo registra en el historial, sin tocar conteo ni fecha.
 *   DIFERIDO  solo guarda el resultado en el lote (no es definitivo; luego llega otro).
 *
 * Nunca toca la fecha de última actividad: un mensaje saliente no es actividad del
 * aspirante y no debe reiniciar la inactividad ni cambiar el semáforo (EQ-77 §6.3 y §11).
 *
 * Es idempotente: si el lote ya tiene un resultado final para ese envío, el evento
 * repetido se ignora (no suma dos veces ni duplica el historial).
 * Los cambios en el aspirante se piden a Monitoreo por su repositorio, sin escribir en
 * su esquema (EQ-77 §12).
 */
import { TIPO_ENVIO_DIFERIDO, TIPO_ENVIO_ENVIADO, TIPO_ENVIO_FALLIDO } from "../eventos.js";

export const TIPO_EVENTO_HISTORIAL = "MENSAJE_AUTOMATICO";

const NOMBRE_CANAL = Object.freeze({ WHATSAPP: "WhatsApp", CORREO: "correo" });
const RESULTADO_POR_TIPO = Object.freeze({
  [TIPO_ENVIO_ENVIADO]: "ENVIADO",
  [TIPO_ENVIO_FALLIDO]: "FALLIDO",
  [TIPO_ENVIO_DIFERIDO]: "DIFERIDO",
});

/** Título del evento en la línea de tiempo (HU3-1). */
export function tituloEventoHistorial(resultado, canal) {
  const medio = NOMBRE_CANAL[canal] ?? String(canal).toLowerCase();
  return resultado === "ENVIADO" ? `Mensaje automático enviado por ${medio}` : `Mensaje automático no enviado por ${medio}`;
}

/**
 * @param {Object} d
 * @param {Object} d.repositorioLotes  registrarResultado
 * @param {Object} d.repositorioMonitoreo  registrarNotificacion, registrarActividad, registrarMensajeConversacion
 * @param {Array|null} [d.historialMonitoreo]  Copia del historial que usan algunas pruebas.
 * @param {boolean} [d.mostrarEnConversacion]
 * @param {() => Date} [d.reloj]
 */
export function crearConsumidorResultadosEnvio({
  repositorioLotes, repositorioMonitoreo, historialMonitoreo = null, mostrarEnConversacion = true, reloj = () => new Date(),
}) {
  if (!repositorioLotes?.registrarResultado) throw new Error("Se requiere el repositorio de lotes.");
  if (!repositorioMonitoreo?.registrarActividad) throw new Error("Se requiere el repositorio de Monitoreo.");

  async function registrarEnHistorial(evento) {
    await repositorioMonitoreo.registrarActividad(evento);
    if (historialMonitoreo) historialMonitoreo.push(evento);
  }

  /** @param {Object} evento  Evento de resultado de EQ-85. */
  async function procesar(evento) {
    const resultado = RESULTADO_POR_TIPO[evento?.tipo];
    if (!resultado) return { procesado: false };
    const datos = evento.datos;
    const fecha = datos.enviadoEn || evento.publicadoEn || reloj().toISOString();

    const registro = await repositorioLotes.registrarResultado({
      envioId: datos.envioId, resultado,
      codigo: datos.codigo ?? null, motivo: datos.motivo ?? null,
      whatsappMessageId: datos.whatsappMessageId ?? null, intentos: datos.intentos ?? null, fecha,
    });
    if (!registro.aplicado) return { procesado: false };
    if (resultado === "DIFERIDO") return { procesado: true, resultado };

    const metadatos = {
      canal: datos.canal, loteId: datos.loteId, envioId: datos.envioId, resultado,
      ...(datos.whatsappMessageId ? { whatsappMessageId: datos.whatsappMessageId } : {}),
      ...(resultado === "FALLIDO" ? { codigo: datos.codigo ?? null } : {}),
    };

    if (resultado === "ENVIADO") {
      await repositorioMonitoreo.registrarNotificacion?.({
        aspiranteId: datos.aspiranteId, fecha, contar: !registro.yaNotificadoEnLote,
      });
      if (mostrarEnConversacion && datos.canal === "WHATSAPP" && registro.envio?.texto) {
        await repositorioMonitoreo.registrarMensajeConversacion?.(mensajeConversacion(datos, registro.envio, fecha));
      }
    }

    await registrarEnHistorial({
      id: `h-mia-${datos.envioId}`,
      aspiranteId: datos.aspiranteId,
      tipoEvento: TIPO_EVENTO_HISTORIAL,
      titulo: tituloEventoHistorial(resultado, datos.canal),
      detalle: resultado === "ENVIADO" ? registro.envio?.texto ?? null : datos.motivo ?? null,
      motivoRechazo: null,
      autorTipo: "SISTEMA",
      fechaEvento: fecha,
      metadatos,
    });
    return { procesado: true, resultado };
  }

  return {
    procesar,
    /** Suscribe el consumidor al bus; devuelve la función para cancelar. */
    conectar(bus) {
      const cancelar = [TIPO_ENVIO_ENVIADO, TIPO_ENVIO_FALLIDO, TIPO_ENVIO_DIFERIDO]
        .map((tipo) => bus.suscribir(`${tipo}.#`, (evento) => procesar(evento)));
      return () => cancelar.forEach((c) => c?.());
    },
  };
}

/** Mensaje saliente para la conversación; el id usa el envío para no duplicarlo. */
function mensajeConversacion(datos, envio, fecha) {
  return {
    id: envio.id,
    aspiranteId: datos.aspiranteId,
    direccion: "SALIENTE",
    remitenteTipo: "BOT_IA",
    remitenteId: "disparo-automatico",
    contenido: envio.texto,
    tipoContenido: "TEXTO",
    estadoEntrega: "ENVIADO",
    whatsappMessageId: datos.whatsappMessageId ?? null,
    fechaEnvio: fecha,
  };
}
