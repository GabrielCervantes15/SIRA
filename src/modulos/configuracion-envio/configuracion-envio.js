/**
 * HU 9 · Configuración del Envío de Mensajes Automáticos (EQ-109, EQ-110).
 *
 * Parámetros generales que usará HU 1 (disparo de mensajes): el horario
 * permitido de envío, el tiempo máximo de espera de respuesta y el tiempo de
 * espera de notificación por inactividad (HU 5 también usará este último).
 *
 * PROVISIONAL: la jornada laboral (06:00–21:00) y los límites de valor/unidad
 * son un supuesto razonable, no un acuerdo con el PO. Confirmar antes de
 * cerrar HU 1 y HU 5, que dependen de estos mismos campos.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const JORNADA_LABORAL = { inicio: '06:00', fin: '21:00' };
export const UNIDADES_TIEMPO = ['HORAS', 'DIAS'];

export const CONFIGURACION_POR_DEFECTO = Object.freeze({
  tiempoMaximoRespuesta: { valor: 24, unidad: 'HORAS' },
  tiempoInactividad: { valor: 48, unidad: 'HORAS' },
  horario: { inicio: '08:00', fin: '10:00' },
});

const PATRON_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/**
 * @param {unknown} payload
 * @returns {{ valida: boolean, errores: Record<string,string>, datos?: typeof CONFIGURACION_POR_DEFECTO }}
 */
export function validarConfiguracion(payload) {
  const errores = {};
  const p = payload && typeof payload === 'object' ? payload : {};

  function validarTiempo(valorCampo, campo, erroresRef) {
    const v = valorCampo && typeof valorCampo === 'object' ? valorCampo : {};
    const valorNum = Number(v.valor);
    if (!Number.isInteger(valorNum) || valorNum <= 0) {
      erroresRef[`${campo}.valor`] = 'Debe ser un número entero mayor a 0.';
    }
    if (!UNIDADES_TIEMPO.includes(v.unidad)) {
      erroresRef[`${campo}.unidad`] = `La unidad debe ser ${UNIDADES_TIEMPO.join(' o ')}.`;
    }
    return { valor: valorNum, unidad: v.unidad };
  }

  const tiempoMaximoRespuesta = validarTiempo(p.tiempoMaximoRespuesta, 'tiempoMaximoRespuesta', errores);
  const tiempoInactividad = validarTiempo(p.tiempoInactividad, 'tiempoInactividad', errores);

  const h = p.horario && typeof p.horario === 'object' ? p.horario : {};
  if (typeof h.inicio !== 'string' || !PATRON_HORA.test(h.inicio)) {
    errores['horario.inicio'] = 'Hora inválida (usa HH:MM).';
  }
  if (typeof h.fin !== 'string' || !PATRON_HORA.test(h.fin)) {
    errores['horario.fin'] = 'Hora inválida (usa HH:MM).';
  }
  if (!errores['horario.inicio'] && !errores['horario.fin']) {
    if (minutos(h.inicio) >= minutos(h.fin)) {
      errores['horario.fin'] = 'La hora de fin debe ser posterior a la hora de inicio.';
    } else if (minutos(h.inicio) < minutos(JORNADA_LABORAL.inicio) || minutos(h.fin) > minutos(JORNADA_LABORAL.fin)) {
      errores.horario = `El horario debe caer dentro de la jornada laboral (${JORNADA_LABORAL.inicio}–${JORNADA_LABORAL.fin}).`;
    }
  }

  if (Object.keys(errores).length > 0) return { valida: false, errores };
  return {
    valida: true,
    errores: {},
    datos: { tiempoMaximoRespuesta, tiempoInactividad, horario: { inicio: h.inicio, fin: h.fin } },
  };
}

export function crearRepositorioConfiguracionEnvio({ ruta } = {}) {
  const archivo = ruta || new URL('../../../datos-semilla/configuracion-envio.json', import.meta.url);
  return {
    leer() {
      if (!existsSync(archivo)) return { ...CONFIGURACION_POR_DEFECTO };
      try { return JSON.parse(readFileSync(archivo, 'utf8')); }
      catch { return { ...CONFIGURACION_POR_DEFECTO }; }
    },
    guardar(configuracion) {
      writeFileSync(archivo, JSON.stringify(configuracion, null, 2), 'utf8');
      return configuracion;
    },
  };
}
