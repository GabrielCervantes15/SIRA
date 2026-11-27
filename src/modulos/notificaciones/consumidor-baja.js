/**
 * Consumidor del bus: avisa por correo a quien recibe aspirantes cuando se da de baja
 * a un colaborador (HU6-18 / HU7). Escucha `colaboradores.baja.confirmada`.
 *
 * Mismas garantías que el consumidor de registro: idempotente por (eventId, receptor),
 * reintenta fallos temporales con la cola compartida y, si no puede enviar, deja el caso
 * en `fallidos()` sin revertir la baja (el correo es consecuencia, no condición).
 */
import { correoReasignacionPorBaja } from "./plantillas.js";
import { enviarConReintentos } from "./cola-envio.js";

export const PATRON_BAJA_CONFIRMADA = "colaboradores.baja.confirmada";

export function crearConsumidorBajaConfirmada({
  bus,
  servicioCorreo,
  intentos = 3,
  esperaBaseMs = 200,
  urlSira = process.env.SIRA_URL_PUBLICA || "http://localhost:3000",
  registrar = (mensaje, error) => console.error(`[notificaciones] ${mensaje}`, error ?? ""),
}) {
  const procesados = new Map(); // `${eventId}:${receptor}` → { correoId }
  const fallidos = [];

  async function enviarA(evento, receptor) {
    const clave = `${evento.eventId}:${receptor.colaboradorId}`;
    if (procesados.has(clave)) return;
    if (!receptor.correoInstitucional) {
      fallidos.push({ eventId: evento.eventId, colaboradorId: receptor.colaboradorId, motivo: "SIN_CORREO" });
      registrar(`el receptor ${receptor.colaboradorId} no tiene correo; no se le avisó de la baja`);
      return;
    }
    procesados.set(clave, { correoId: null });
    const correo = correoReasignacionPorBaja(evento, receptor, { urlSira });
    const resultado = await enviarConReintentos({ servicioCorreo, correo, intentos, esperaBaseMs });
    if (resultado.ok) {
      procesados.set(clave, { correoId: resultado.id });
      return;
    }
    procesados.delete(clave);
    fallidos.push({ eventId: evento.eventId, colaboradorId: receptor.colaboradorId, motivo: resultado.error?.codigo ?? "ERROR_ENVIO", intentos: resultado.intentos });
    registrar(`no se pudo avisar de la baja a ${receptor.colaboradorId}`, resultado.error);
  }

  async function manejar(evento) {
    if (!evento?.eventId || !evento.colaboradorId || !Array.isArray(evento.receptores)) {
      fallidos.push({ eventId: evento?.eventId ?? null, motivo: "EVENTO_INCOMPLETO" });
      registrar("evento de baja incompleto, se descarta", evento);
      return;
    }
    // Un receptor con problemas no impide avisar a los demás.
    await Promise.all(evento.receptores.map((r) => enviarA(evento, r).catch((e) => registrar(`falló el aviso a ${r.colaboradorId}`, e))));
  }

  const enCurso = new Set();
  const cancelar = bus.suscribir(PATRON_BAJA_CONFIRMADA, (evento) => {
    const tarea = manejar(evento).catch((e) => registrar("falló el consumidor de baja", e));
    enCurso.add(tarea);
    tarea.finally(() => enCurso.delete(tarea));
  });

  return {
    manejar,
    detener: cancelar,
    esperarPendientes: () => Promise.all([...enCurso]),
    procesados: () => [...procesados].map(([clave, datos]) => ({ clave, ...datos })),
    fallidos: () => fallidos.map((f) => ({ ...f })),
  };
}
