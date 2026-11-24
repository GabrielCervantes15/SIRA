/**
 * Consumidor del bus: correo de bienvenida al confirmar un registro (HU6-14 / EQ-61)
 *
 * Escucha `colaboradores.registro.confirmado` y manda el correo al colaborador.
 *  - Idempotente: si el mismo `eventId` llega dos veces (reentrega de RabbitMQ), solo
 *    se manda un correo.
 *  - Reintenta los fallos temporales (`reintentable: true`) hasta `intentos` veces con
 *    espera creciente; los permanentes (destinatario inválido) no se reintentan.
 *  - Si no se pudo mandar, el evento queda en `fallidos()` y NO revierte el registro:
 *    el alta ya está confirmada y el correo es una consecuencia, no una condición.
 */
import { correoBienvenidaColaborador } from "./plantillas.js";

export const PATRON_REGISTRO_CONFIRMADO = "colaboradores.registro.confirmado";

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {Object} dependencias
 * @param {{ suscribir(patron: string, manejador: Function): () => void }} dependencias.bus
 * @param {{ enviar(correo: Object): Promise<{ id: string }> }} dependencias.servicioCorreo
 * @param {number} [dependencias.intentos=3]
 * @param {number} [dependencias.esperaBaseMs=200]
 * @param {string} [dependencias.urlSira]
 * @param {(mensaje: string, error?: unknown) => void} [dependencias.registrar]
 */
export function crearConsumidorRegistroConfirmado({
  bus,
  servicioCorreo,
  intentos = 3,
  esperaBaseMs = 200,
  urlSira = process.env.SIRA_URL_PUBLICA || "http://localhost:3000",
  registrar = (mensaje, error) => console.error(`[notificaciones] ${mensaje}`, error ?? ""),
}) {
  const procesados = new Map(); // eventId → { correoId }
  const fallidos = [];

  async function manejar(evento) {
    const eventId = evento?.eventId;
    if (!eventId || !evento.colaboradorId || !evento.correoInstitucional) {
      fallidos.push({ eventId: eventId ?? null, motivo: "EVENTO_INCOMPLETO" });
      registrar("evento de registro incompleto, se descarta", evento);
      return;
    }
    if (procesados.has(eventId)) return;
    procesados.set(eventId, { correoId: null }); // reserva: evita duplicados concurrentes

    const correo = correoBienvenidaColaborador(evento, { urlSira });
    for (let intento = 1; intento <= intentos; intento++) {
      try {
        const { id } = await servicioCorreo.enviar(correo);
        procesados.set(eventId, { correoId: id });
        return;
      } catch (error) {
        const ultimo = intento === intentos || error?.reintentable === false;
        if (ultimo) {
          procesados.delete(eventId); // permite reprocesarlo si el evento se vuelve a entregar
          fallidos.push({ eventId, colaboradorId: evento.colaboradorId, motivo: error?.codigo ?? "ERROR_ENVIO", intentos: intento });
          registrar(`no se pudo enviar el correo de ${evento.colaboradorId}`, error);
          return;
        }
        await esperar(esperaBaseMs * 2 ** (intento - 1));
      }
    }
  }

  // Igual que con RabbitMQ, quien publica no espera al correo: el envío corre aparte.
  const enCurso = new Set();
  const cancelar = bus.suscribir(PATRON_REGISTRO_CONFIRMADO, (evento) => {
    const tarea = manejar(evento).catch((error) => registrar("falló el consumidor de registro", error));
    enCurso.add(tarea);
    tarea.finally(() => enCurso.delete(tarea));
  });

  return {
    manejar,
    detener: cancelar,
    /** Espera a que terminen los envíos en curso (útil en pruebas y al apagar). */
    esperarPendientes: () => Promise.all([...enCurso]),
    procesados: () => [...procesados].map(([eventId, datos]) => ({ eventId, ...datos })),
    fallidos: () => fallidos.map((f) => ({ ...f })),
  };
}
