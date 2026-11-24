/**
 * Servicio de Interfaz Pública de Lectura de Configuración de Mensajes
 * Tareas: EQ-105 (HU9-4) y EQ-108 (HU9-7: Refresco reactivo mediante bus de eventos)
 *
 * Provee a los módulos consumidores (HU1, HU8, etc.) acceso desacoplado y de solo
 * lectura a los parámetros vigentes y evaluación de horarios en `America/Hermosillo`,
 * suscribiéndose opcionalmente a `mensajes.configuracion.actualizada` para refrescar
 * su copia en memoria de manera reactiva.
 */
import {
  ZONA_HORARIA_INSTITUCIONAL,
  crearConfiguracionInicial,
  clonarConfiguracion,
} from "../dominio/repositorio-configuracion.js";
import { convertirHoraAMinutos } from "../dominio/validador-configuracion.js";
import {
  TIPO_CONFIGURACION_ACTUALIZADA,
  validarEventoConfiguracionActualizada,
} from "../eventos.js";

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
 * Crea la interfaz pública de lectura de configuración del módulo Mensajes (EQ-105 / EQ-108).
 * Si recibe `busEventos`, se suscribe automáticamente a `mensajes.configuracion.actualizada`
 * y refresca su instantánea en memoria cuando recibe un evento válido.
 *
 * @param {Object} [dependencias]
 * @param {import('../dominio/repositorio-configuracion.js')} [dependencias.repositorioConfiguracion]
 * @param {{ suscribir?: Function }|null} [dependencias.busEventos]
 * @returns {{
 *   obtenerConfiguracionVigente: () => Object,
 *   estaDentroDeHorarioPermitido: (fecha?: Date|string|number) => boolean,
 *   calcularSiguienteApertura: (fecha?: Date|string|number) => Date|null,
 *   actualizarInstantanea: (config: Object) => void,
 *   sincronizarDesdeRepositorio: () => Promise<Object>,
 *   detenerSuscripcion: () => void
 * }}
 */
export function crearInterfazLecturaConfiguracion({
  repositorioConfiguracion = null,
  busEventos = null,
} = {}) {
  if (!repositorioConfiguracion && !busEventos) {
    throw new Error(
      "Se requiere repositorioConfiguracion o busEventos para crear la interfaz pública de lectura."
    );
  }

  let versionRepositorioSincronizada =
    typeof repositorioConfiguracion?.versionEstado === "number"
      ? repositorioConfiguracion.versionEstado
      : -1;

  let instantaneaVigente =
    typeof repositorioConfiguracion?.obtenerInstantanea === "function"
      ? repositorioConfiguracion.obtenerInstantanea()
      : clonarConfiguracion(crearConfiguracionInicial(), { congelar: true });

  function obtenerInstantaneaActual() {
    if (
      repositorioConfiguracion &&
      typeof repositorioConfiguracion.obtenerInstantanea === "function" &&
      typeof repositorioConfiguracion.versionEstado === "number" &&
      repositorioConfiguracion.versionEstado !== versionRepositorioSincronizada
    ) {
      instantaneaVigente = repositorioConfiguracion.obtenerInstantanea();
      versionRepositorioSincronizada = repositorioConfiguracion.versionEstado;
    }
    return instantaneaVigente;
  }

  function actualizarInstantanea(nuevaConfiguracion) {
    instantaneaVigente = clonarConfiguracion(nuevaConfiguracion, { congelar: true });
    if (typeof repositorioConfiguracion?.versionEstado === "number") {
      versionRepositorioSincronizada = repositorioConfiguracion.versionEstado;
    }
  }

  let cancelarSuscripcion = null;
  if (busEventos && typeof busEventos.suscribir === "function") {
    cancelarSuscripcion = busEventos.suscribir(
      TIPO_CONFIGURACION_ACTUALIZADA,
      (evento) => {
        const validacion = validarEventoConfiguracionActualizada(evento);
        if (validacion.valido) {
          actualizarInstantanea(evento.datos.valorNuevo);
        }
      }
    );
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
     * Actualiza la instantánea en memoria tras un guardado exitoso o evento recibido.
     * @param {Object} nuevaConfiguracion
     */
    actualizarInstantanea,

    /**
     * Sincroniza la instantánea desde el repositorio (útil para adaptadores asíncronos como PostgreSQL).
     * @returns {Promise<Object>}
     */
    async sincronizarDesdeRepositorio() {
      if (!repositorioConfiguracion) return instantaneaVigente;
      const desdeRepo = await repositorioConfiguracion.obtenerConfiguracion();
      actualizarInstantanea(desdeRepo);
      return instantaneaVigente;
    },

    /**
     * Cancela la suscripción al bus de eventos (útil para limpieza en pruebas).
     */
    detenerSuscripcion() {
      if (typeof cancelarSuscripcion === "function") {
        cancelarSuscripcion();
        cancelarSuscripcion = null;
      }
    },
  });
}
