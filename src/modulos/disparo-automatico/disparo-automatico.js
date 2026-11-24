/**
 * HU 1 · Disparo de Mensajes Automáticos (EQ-86, EQ-88, EQ-89).
 *
 * SIMPLIFICACIÓN DELIBERADA frente a docs/decisiones/HU1-reglas-lote-envio.md
 * (EQ-77, aprobado por el PO): esa versión pide consentimiento de WhatsApp,
 * periodo de exclusión de 48 h y separar "último contacto" de "última
 * actividad académica". El usuario pidió construir solo el criterio de
 * aceptación original (sin WhatsApp real), así que aquí:
 *   - El "canal de mensajería principal" se simula igual que el chat de HU 3
 *     (se agrega a conversaciones/historial, sin API externa).
 *   - fechaUltimaActividad SÍ se actualiza con cada envío (como pide el
 *     criterio original), aunque EQ-77 ya decidió que no debería ser así.
 *   - El horario es el simple de HU9 (un rango HH:MM para toda la semana),
 *     no el de por-día que pide EQ-77/EQ-102.
 * Falta reconciliar esto con el equipo antes de dar HU 1 por cerrada de verdad.
 */
import { readFileSync } from 'node:fs';

export const SEMAFOROS_ELEGIBLES = ['ROJO', 'NARANJA']; // Verde nunca es elegible (no es un filtro, es una regla fija).
export const UNIDADES_INACTIVIDAD = ['DIAS', 'SEMANAS', 'MESES'];
const DIAS_POR_UNIDAD = { DIAS: 1, SEMANAS: 7, MESES: 30 };

let catalogoMensajesIA = null;
function obtenerCatalogoEnvio() {
  if (!catalogoMensajesIA) {
    const ruta = new URL('../../../datos-semilla/mensajes-ia.json', import.meta.url);
    catalogoMensajesIA = JSON.parse(readFileSync(ruta, 'utf8')).mensajes.filter((m) => m.categoria === 'ENVIO');
  }
  return catalogoMensajesIA;
}

/** @returns {{ valido: boolean, errores: Record<string,string> }} */
export function validarFiltrosLote({ semaforos, carreras, inactividadValor, inactividadUnidad }) {
  const errores = {};
  if (!Array.isArray(semaforos) || semaforos.length === 0) errores.semaforos = 'Selecciona al menos un semáforo.';
  else if (semaforos.some((s) => !SEMAFOROS_ELEGIBLES.includes(s))) errores.semaforos = `Solo se permite ${SEMAFOROS_ELEGIBLES.join(' o ')}.`;
  if (!Array.isArray(carreras) || carreras.length === 0) errores.carreras = 'Selecciona al menos una carrera.';
  if (!Number.isInteger(Number(inactividadValor)) || Number(inactividadValor) <= 0) errores.inactividadValor = 'Debe ser un entero mayor a 0.';
  if (!UNIDADES_INACTIVIDAD.includes(inactividadUnidad)) errores.inactividadUnidad = `Unidad inválida (${UNIDADES_INACTIVIDAD.join('/')}).`;
  return { valido: Object.keys(errores).length === 0, errores };
}

/** @param {Date} ahora */
export function fechaCorteInactividad(inactividadValor, inactividadUnidad, ahora = new Date()) {
  const dias = Number(inactividadValor) * DIAS_POR_UNIDAD[inactividadUnidad];
  return new Date(ahora.getTime() - dias * 86400000);
}

/**
 * @param {any[]} aspirantesCartera  Ya filtrados por cartera del colaborador.
 * @param {{ semaforos: string[], carreras: string[], inactividadValor: number, inactividadUnidad: string }} filtros
 */
export function calcularElegibles(aspirantesCartera, filtros, ahora = new Date()) {
  const corte = fechaCorteInactividad(filtros.inactividadValor, filtros.inactividadUnidad, ahora);
  return aspirantesCartera.filter((a) =>
    SEMAFOROS_ELEGIBLES.includes(a.semaforo) &&
    filtros.semaforos.includes(a.semaforo) &&
    filtros.carreras.includes(a.carreraSolicitada) &&
    new Date(a.fechaUltimaActividad).getTime() <= corte.getTime());
}

/** Mensaje de ENVIO del catálogo de HU 8 cuyas llaves de Semáforo coincidan; si ninguna aplica, usa un genérico. */
export function generarMensajePersonalizado(aspirante) {
  const catalogo = obtenerCatalogoEnvio();
  const porSemaforo = catalogo.find((m) => m.llaves.some((l) => l.tipo === 'Semáforo' && l.valor.toUpperCase() === aspirante.semaforo));
  const plantilla = porSemaforo?.mensaje
    ?? 'Hola {aspirante}. Tu proceso de admisión con ITSON sigue en curso; contáctanos si necesitas ayuda para continuar.';
  const primerNombre = aspirante.nombreCompleto.split(' ')[0];
  return plantilla.replaceAll('{aspirante}', primerNombre).replaceAll('{nombre aspirante}', primerNombre);
}

/** Simulación del canal de correo (no hay SMTP real todavía: BASE-9 no se construyó). */
export function intentarEnvioCorreo(aspirante) {
  const correo = (aspirante.correo || '').trim();
  if (!correo) return { exito: false, motivo: 'El aspirante no tiene correo registrado.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { exito: false, motivo: 'El correo registrado no tiene un formato válido.' };
  return { exito: true };
}

/** @param {{ inicio: string, fin: string }} horario */
export function dentroDeHorario(horario, ahora = new Date()) {
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const [hi, mi] = horario.inicio.split(':').map(Number);
  const [hf, mf] = horario.fin.split(':').map(Number);
  return minutosAhora >= hi * 60 + mi && minutosAhora <= hf * 60 + mf;
}
