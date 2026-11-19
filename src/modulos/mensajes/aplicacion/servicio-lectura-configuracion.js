/**
 * Servicio de Interfaz Pública de Lectura de Configuración de Mensajes
 * Tarea: EQ-105 · HU9-4 (Sprint 2)
 *
 * Provee a los módulos consumidores (HU1, HU8, etc.) acceso desacoplado y de solo
 * lectura a los parámetros vigentes y evaluación de horarios en `America/Hermosillo`,
 * sin leer tablas internas ni depender del huso horario local del servidor.
 */
import {
  ZONA_HORARIA_INSTITUCIONAL,
  crearConfiguracionInicial,
  clonarConfiguracion,
} from "../dominio/repositorio-configuracion.js";
import { convertirHoraAMinutos } from "../dominio/validador-configuracion.js";

const MAPA_DIA_INGLES_A_ESPANOL = Object.freeze({
  Mon: "lunes",
  Tue: "martes",
  Wed: "miercoles",
  Thu: "jueves",
  Fri: "viernes",
  Sat: "sabado",
  Sun: "domingo",
});

const DIAS_POR_INDICE_UTC = Object.freeze([
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
]);

/**
 * Extrae las componentes de fecha y hora en la zona horaria indicada usando Intl.DateTimeFormat.
 * No depende de la zona horaria local del sistema operativo.
 *
 * @param {Date} fecha
 * @param {string} [zonaHoraria="America/Hermosillo"]
 * @returns {{ anio: number, mes: number, dia: number, hora: number, minuto: number, segundo: number, diaSemana: string }}
 */
export function obtenerPartesEnZonaHoraria(
  fecha,
  zonaHoraria = ZONA_HORARIA_INSTITUCIONAL
) {
  const formateador = new Intl.DateTimeFormat("en-US", {
    timeZone: zonaHoraria,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const partes = formateador.formatToParts(fecha);
  const mapa = {};
  for (const parte of partes) {
    if (parte.type !== "literal") {
      mapa[parte.type] = parte.value;
    }
  }

  return {
    anio: Number(mapa.year),
    mes: Number(mapa.month),
    dia: Number(mapa.day),
    hora: Number(mapa.hour),
    minuto: Number(mapa.minute),
    segundo: Number(mapa.second),
    diaSemana: MAPA_DIA_INGLES_A_ESPANOL[mapa.weekday] || "lunes",
  };
}

/**
 * Construye un objeto Date (instante UTC exacto) correspondiente a una fecha y hora local
 * dentro de la zona horaria institucional (`America/Hermosillo`).
 *
 * @param {{ anio: number, mes: number, dia: number, hora: number, minuto: number, segundo?: number }} componentes
 * @param {string} [zonaHoraria="America/Hermosillo"]
 * @returns {Date}
 */
export function construirFechaEnZonaHoraria(
  { anio, mes, dia, hora, minuto, segundo = 0 },
  zonaHoraria = ZONA_HORARIA_INSTITUCIONAL
) {
  const marcaComoUtc = Date.UTC(anio, mes - 1, dia, hora, minuto, segundo, 0);
  const partesEnZona = obtenerPartesEnZonaHoraria(new Date(marcaComoUtc), zonaHoraria);
  const interpretadoComoUtc = Date.UTC(
    partesEnZona.anio,
    partesEnZona.mes - 1,
    partesEnZona.dia,
    partesEnZona.hora,
    partesEnZona.minuto,
    partesEnZona.segundo,
    0
  );
  const desfaseMs = interpretadoComoUtc - marcaComoUtc;
  return new Date(marcaComoUtc - desfaseMs);
}

/**
 * Normaliza un argumento de fecha (Date, número o cadena ISO) o lanza error si es inválido.
 * @param {Date|string|number} [fecha]
 * @returns {Date}
 */
function normalizarInstante(fecha = new Date()) {
  const instante = fecha instanceof Date ? new Date(fecha.getTime()) : new Date(fecha);
  if (Number.isNaN(instante.getTime())) {
    const error = new Error("La fecha proporcionada no es válida.");
    error.codigo = "FECHA_INVALIDA";
    throw error;
  }
  return instante;
}

/**
 * Evalúa de forma pura si un instante cae dentro del horario permitido según la configuración dada.
 * Criterio aprobado por el PO: `horaInicio <= horaActual < horaFin` en `America/Hermosillo`.
 *
 * @param {Date|string|number} [fecha=new Date()]
 * @param {Object} [configuracion]
 * @returns {boolean}
 */
export function evaluarHorarioPermitido(fecha = new Date(), configuracion = crearConfiguracionInicial()) {
  const instante = normalizarInstante(fecha);
  const zonaHoraria = configuracion?.zonaHoraria || ZONA_HORARIA_INSTITUCIONAL;
  const partes = obtenerPartesEnZonaHoraria(instante, zonaHoraria);
  const diaConfig = configuracion?.jornada?.[partes.diaSemana];

  if (!diaConfig || !diaConfig.habilitado || !diaConfig.horaInicio || !diaConfig.horaFin) {
    return false;
  }

  const minutosInicio = convertirHoraAMinutos(diaConfig.horaInicio);
  const minutosFin = convertirHoraAMinutos(diaConfig.horaFin);
  const minutosActuales = partes.hora * 60 + partes.minuto + partes.segundo / 60;

  return minutosActuales >= minutosInicio && minutosActuales < minutosFin;
}

/**
 * Calcula de forma pura el siguiente instante de apertura (`horaInicio`) de un día habilitado
 * en la zona horaria `America/Hermosillo` a partir de la fecha dada.
 *
 * Ejemplo aprobado por el PO: si un envío vence el viernes a las 19:00, retorna el lunes a las 08:00
 * en `America/Hermosillo`. Si es viernes a las 06:30 (antes de abrir), retorna ese mismo viernes a las 08:00.
 *
 * @param {Date|string|number} [fecha=new Date()]
 * @param {Object} [configuracion]
 * @returns {Date|null}
 */
export function calcularSiguienteAperturaDesdeConfig(
  fecha = new Date(),
  configuracion = crearConfiguracionInicial()
) {
  const instante = normalizarInstante(fecha);
  const zonaHoraria = configuracion?.zonaHoraria || ZONA_HORARIA_INSTITUCIONAL;
  const partesHoy = obtenerPartesEnZonaHoraria(instante, zonaHoraria);

  for (let desplazamientoDias = 0; desplazamientoDias <= 7; desplazamientoDias++) {
    const fechaCalendarioUtc = new Date(
      Date.UTC(partesHoy.anio, partesHoy.mes - 1, partesHoy.dia + desplazamientoDias, 12, 0, 0)
    );
    const nombreDia = DIAS_POR_INDICE_UTC[fechaCalendarioUtc.getUTCDay()];
    const diaConfig = configuracion?.jornada?.[nombreDia];

    if (!diaConfig || !diaConfig.habilitado || !diaConfig.horaInicio) {
      continue;
    }

    const [horaInicio, minutoInicio] = String(diaConfig.horaInicio).split(":").map(Number);
    const instanteApertura = construirFechaEnZonaHoraria(
      {
        anio: fechaCalendarioUtc.getUTCFullYear(),
        mes: fechaCalendarioUtc.getUTCMonth() + 1,
        dia: fechaCalendarioUtc.getUTCDate(),
        hora: horaInicio,
        minuto: minutoInicio,
        segundo: 0,
      },
      zonaHoraria
    );

    if (instanteApertura.getTime() > instante.getTime()) {
      return instanteApertura;
    }
  }

  return null;
}

/**
 * Crea la interfaz pública de lectura de configuración del módulo Mensajes (EQ-105 / HU9-4).
 *
 * @param {Object} dependencias
 * @param {import('../dominio/repositorio-configuracion.js')} dependencias.repositorioConfiguracion
 * @returns {{
 *   obtenerConfiguracionVigente: () => Object,
 *   estaDentroDeHorarioPermitido: (fecha?: Date|string|number) => boolean,
 *   calcularSiguienteApertura: (fecha?: Date|string|number) => Date|null,
 *   actualizarInstantanea: (config: Object) => void,
 *   sincronizarDesdeRepositorio: () => Promise<Object>
 * }}
 */
export function crearInterfazLecturaConfiguracion({ repositorioConfiguracion }) {
  if (!repositorioConfiguracion) {
    throw new Error(
      "Se requiere repositorioConfiguracion para crear la interfaz pública de lectura."
    );
  }

  let instantaneaVigente =
    typeof repositorioConfiguracion.obtenerInstantanea === "function"
      ? repositorioConfiguracion.obtenerInstantanea()
      : clonarConfiguracion(crearConfiguracionInicial(), { congelar: true });

  function obtenerInstantaneaActual() {
    if (typeof repositorioConfiguracion.obtenerInstantanea === "function") {
      instantaneaVigente = repositorioConfiguracion.obtenerInstantanea();
    }
    return instantaneaVigente;
  }

  return Object.freeze({
    /**
     * Retorna una copia inmutable (congelada) de los parámetros vigentes,
     * incluyendo las equivalencias en horas.
     */
    obtenerConfiguracionVigente() {
      return clonarConfiguracion(obtenerInstantaneaActual(), { congelar: true });
    },

    /**
     * Evalúa en `America/Hermosillo` si la fecha/hora dada cae dentro de la jornada habilitada.
     * @param {Date|string|number} [fecha=new Date()]
     * @returns {boolean}
     */
    estaDentroDeHorarioPermitido(fecha = new Date()) {
      return evaluarHorarioPermitido(fecha, obtenerInstantaneaActual());
    },

    /**
     * Calcula el siguiente instante de apertura de jornada habilitada en `America/Hermosillo`.
     * @param {Date|string|number} [fecha=new Date()]
     * @returns {Date|null}
     */
    calcularSiguienteApertura(fecha = new Date()) {
      return calcularSiguienteAperturaDesdeConfig(fecha, obtenerInstantaneaActual());
    },

    /**
     * Actualiza la instantánea en memoria tras un guardado exitoso.
     * @param {Object} nuevaConfiguracion
     */
    actualizarInstantanea(nuevaConfiguracion) {
      instantaneaVigente = clonarConfiguracion(nuevaConfiguracion, { congelar: true });
    },

    /**
     * Sincroniza la instantánea desde el repositorio (útil para adaptadores asíncronos como PostgreSQL).
     * @returns {Promise<Object>}
     */
    async sincronizarDesdeRepositorio() {
      const desdeRepo = await repositorioConfiguracion.obtenerConfiguracion();
      instantaneaVigente = clonarConfiguracion(desdeRepo, { congelar: true });
      return instantaneaVigente;
    },
  });
}
