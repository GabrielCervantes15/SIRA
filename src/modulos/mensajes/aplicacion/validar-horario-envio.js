/**
 * Validador y Guardia de Horario Permitido en el Servidor para Lotes de Envío (EQ-82 · HU1-6)
 *
 * Delega toda la evaluación horaria a la interfaz pública de lectura de HU9-4
 * (`src/modulos/mensajes/aplicacion/servicio-lectura-configuracion.js`), evaluando
 * siempre en la zona horaria institucional `America/Hermosillo` con el reloj del servidor.
 */
import { ZONA_HORARIA_INSTITUCIONAL } from "../dominio/repositorio-configuracion.js";
import { obtenerPartesEnZonaHoraria } from "./servicio-lectura-configuracion.js";

/**
 * Error de negocio cuando se intenta confirmar un envío de lote fuera del horario permitido.
 */
export class ErrorFueraDeHorarioPermitido extends Error {
  /**
   * @param {string} mensaje
   * @param {Object} detalle
   */
  constructor(mensaje, detalle = {}) {
    super(mensaje);
    this.name = "ErrorFueraDeHorarioPermitido";
    this.status = 409;
    this.codigo = "FUERA_DE_HORARIO_PERMITIDO";
    this.mensaje = mensaje;
    this.detalle = Object.freeze({ ...detalle });
  }
}

function normalizarFechaReloj(valor) {
  const fecha = valor instanceof Date ? new Date(valor.getTime()) : new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    const error = new Error("El instante del reloj del servidor no es una fecha válida.");
    error.status = 500;
    error.codigo = "RELOJ_INVALIDO";
    throw error;
  }
  return fecha;
}

function formatearHoraDosDigitos(hora, minuto) {
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

function describirSiguienteApertura(fechaApertura, zonaHoraria) {
  if (!fechaApertura) {
    return "No hay días habilitados configurados actualmente en la jornada.";
  }
  const partes = obtenerPartesEnZonaHoraria(fechaApertura, zonaHoraria);
  const horaTexto = formatearHoraDosDigitos(partes.hora, partes.minuto);
  return `La siguiente apertura disponible es el ${partes.diaSemana} a las ${horaTexto} (${zonaHoraria}).`;
}

/**
 * Crea el validador de horario de envío en el servidor conectado a la interfaz pública de HU9-4.
 *
 * @param {Object} dependencias
 * @param {{
 *   obtenerConfiguracionVigente: () => Object,
 *   estaDentroDeHorarioPermitido: (fecha?: Date) => boolean,
 *   calcularSiguienteApertura: (fecha?: Date) => Date|null
 * }} dependencias.interfazLectura
 * @param {() => Date|number|string} [dependencias.reloj]
 */
export function crearValidadorHorarioEnvio({
  interfazLectura,
  reloj = () => new Date(),
} = {}) {
  if (
    !interfazLectura ||
    typeof interfazLectura.obtenerConfiguracionVigente !== "function" ||
    typeof interfazLectura.estaDentroDeHorarioPermitido !== "function" ||
    typeof interfazLectura.calcularSiguienteApertura !== "function"
  ) {
    throw new Error(
      "Se requiere la interfaz pública de lectura de HU9-4 (interfazLectura) para inicializar crearValidadorHorarioEnvio."
    );
  }

  function obtenerEstadoHorario(fechaOpcional) {
    const instante =
      fechaOpcional !== undefined
        ? normalizarFechaReloj(fechaOpcional)
        : normalizarFechaReloj(reloj());

    const configuracion = interfazLectura.obtenerConfiguracionVigente();
    const zonaHoraria = configuracion?.zonaHoraria || ZONA_HORARIA_INSTITUCIONAL;
    const partesHoy = obtenerPartesEnZonaHoraria(instante, zonaHoraria);
    const diaSemana = partesHoy.diaSemana;
    const horaActual = formatearHoraDosDigitos(partesHoy.hora, partesHoy.minuto);

    const configDia = configuracion?.jornada?.[diaSemana];
    const horarioDiaActual = Object.freeze({
      habilitado: Boolean(configDia?.habilitado),
      horaInicio: configDia?.habilitado ? configDia.horaInicio : null,
      horaFin: configDia?.habilitado ? configDia.horaFin : null,
    });

    const permitido = Boolean(interfazLectura.estaDentroDeHorarioPermitido(instante));
    const aperturaDate = permitido
      ? null
      : interfazLectura.calcularSiguienteApertura(instante);
    const siguienteApertura = aperturaDate ? aperturaDate.toISOString() : null;

    let mensaje;
    if (permitido) {
      mensaje = `Dentro del horario permitido para ${diaSemana}: ${horarioDiaActual.horaInicio} a ${horarioDiaActual.horaFin} (${zonaHoraria}).`;
    } else {
      const textoApertura = describirSiguienteApertura(aperturaDate, zonaHoraria);
      if (horarioDiaActual.habilitado) {
        mensaje = `Envío fuera del horario permitido. El horario configurado para ${diaSemana} es de ${horarioDiaActual.horaInicio} a ${horarioDiaActual.horaFin} (${zonaHoraria}). ${textoApertura} El lote manual no se programa automáticamente.`;
      } else {
        mensaje = `Envío fuera del horario permitido. El día ${diaSemana} no tiene envíos habilitados (${zonaHoraria}). ${textoApertura} El lote manual no se programa automáticamente.`;
      }
    }

    return Object.freeze({
      permitido,
      zonaHoraria,
      instanteEvaluado: instante.toISOString(),
      diaSemana,
      horaActual,
      horarioDiaActual,
      siguienteApertura,
      mensaje,
    });
  }

  function validarEnvioPermitido(fechaOpcional) {
    const estado = obtenerEstadoHorario(fechaOpcional);
    if (estado.permitido) {
      return estado;
    }

    throw new ErrorFueraDeHorarioPermitido(estado.mensaje, {
      zonaHoraria: estado.zonaHoraria,
      instanteEvaluado: estado.instanteEvaluado,
      diaSemana: estado.diaSemana,
      horaActual: estado.horaActual,
      horarioDiaActual: estado.horarioDiaActual,
      siguienteApertura: estado.siguienteApertura,
      permiteConsultaYVistaPrevia: true,
      programadoAutomaticamente: false,
    });
  }

  return Object.freeze({
    obtenerEstadoHorario,
    validarEnvioPermitido,
  });
}

/**
 * Crea un guardia reutilizable para casos de uso o controladores de envío de lotes (HU1).
 *
 * @param {Object} dependencias
 * @param {ReturnType<typeof crearValidadorHorarioEnvio>} [dependencias.validadorHorarioEnvio]
 * @param {Object} [dependencias.interfazLectura]
 * @param {() => Date|number|string} [dependencias.reloj]
 */
export function crearGuardiaHorarioEnvio({
  validadorHorarioEnvio = null,
  interfazLectura = null,
  reloj = () => new Date(),
} = {}) {
  const validador =
    validadorHorarioEnvio ||
    crearValidadorHorarioEnvio({ interfazLectura, reloj });

  function guardia(fechaOpcional) {
    return validador.validarEnvioPermitido(fechaOpcional);
  }

  guardia.obtenerEstadoHorario = validador.obtenerEstadoHorario;
  guardia.validarEnvioPermitido = validador.validarEnvioPermitido;
  return Object.freeze(guardia);
}
