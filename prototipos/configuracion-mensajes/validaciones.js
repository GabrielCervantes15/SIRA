/**
 * Validaciones del prototipo EQ-103.
 * Estas funciones son puras y no realizan llamadas al servidor.
 */

export const DIAS_SEMANA = [
  { clave: "lunes", nombre: "Lunes" },
  { clave: "martes", nombre: "Martes" },
  { clave: "miercoles", nombre: "Miércoles" },
  { clave: "jueves", nombre: "Jueves" },
  { clave: "viernes", nombre: "Viernes" },
  { clave: "sabado", nombre: "Sábado" },
  { clave: "domingo", nombre: "Domingo" },
];

export const ZONA_HORARIA = "America/Hermosillo";
export const LIMITE_MINIMO_HORAS = 1;
export const LIMITE_MAXIMO_HORAS = 30 * 24;

export function crearConfiguracionInicial() {
  const jornada = {};

  for (const dia of DIAS_SEMANA) {
    const habilitado = !["sabado", "domingo"].includes(dia.clave);
    jornada[dia.clave] = {
      habilitado,
      horaInicio: habilitado ? "08:00" : null,
      horaFin: habilitado ? "18:00" : null,
    };
  }

  return {
    zonaHoraria: ZONA_HORARIA,
    tiempoMaximoEsperaRespuesta: { valor: 1, unidad: "dias" },
    tiempoEsperaContactoPrevio: { valor: 2, unidad: "dias" },
    jornada,
  };
}

function convertirHoraAMinutos(hora) {
  if (typeof hora !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    return null;
  }

  const [horas, minutos] = hora.split(":").map(Number);
  return horas * 60 + minutos;
}

function validarTiempo(parametro, etiqueta) {
  if (!parametro || typeof parametro !== "object") {
    return `${etiqueta}: captura un valor y una unidad.`;
  }

  const { valor, unidad } = parametro;

  if (!["horas", "dias"].includes(unidad)) {
    return `${etiqueta}: selecciona horas o días.`;
  }

  if (!Number.isInteger(valor)) {
    return `${etiqueta}: utiliza un número entero, sin decimales.`;
  }

  const equivalenciaHoras = unidad === "dias" ? valor * 24 : valor;

  if (equivalenciaHoras < LIMITE_MINIMO_HORAS) {
    return `${etiqueta}: el mínimo permitido es 1 hora.`;
  }

  if (equivalenciaHoras > LIMITE_MAXIMO_HORAS) {
    return `${etiqueta}: el máximo permitido es 30 días.`;
  }

  return null;
}

export function validarConfiguracion(configuracion) {
  const errores = {};

  if (!configuracion || typeof configuracion !== "object" || Array.isArray(configuracion)) {
    return {
      valido: false,
      errores: { configuracion: "La configuración debe ser un objeto válido." },
    };
  }

  const errorRespuesta = validarTiempo(
    configuracion.tiempoMaximoEsperaRespuesta,
    "Tiempo máximo de espera de respuesta"
  );
  if (errorRespuesta) errores.tiempoMaximoEsperaRespuesta = errorRespuesta;

  const errorContacto = validarTiempo(
    configuracion.tiempoEsperaContactoPrevio,
    "Tiempo de espera por contacto previo"
  );
  if (errorContacto) errores.tiempoEsperaContactoPrevio = errorContacto;

  if (!configuracion.jornada || typeof configuracion.jornada !== "object") {
    errores.jornada = "Configura la jornada laboral de los siete días.";
  } else {
    for (const dia of DIAS_SEMANA) {
      const horario = configuracion.jornada[dia.clave];

      if (!horario || typeof horario.habilitado !== "boolean") {
        errores[`jornada.${dia.clave}`] = `Configura la jornada de ${dia.nombre.toLowerCase()}.`;
        continue;
      }

      if (!horario.habilitado) continue;

      const inicio = convertirHoraAMinutos(horario.horaInicio);
      const fin = convertirHoraAMinutos(horario.horaFin);

      if (inicio === null || fin === null) {
        errores[`jornada.${dia.clave}`] = `Selecciona una hora válida de inicio y fin para ${dia.nombre.toLowerCase()}.`;
        continue;
      }

      if (inicio >= fin) {
        errores[`jornada.${dia.clave}`] = `En ${dia.nombre.toLowerCase()}, la hora de inicio debe ser anterior a la hora de fin.`;
      }
    }
  }

  return {
    valido: Object.keys(errores).length === 0,
    errores,
  };
}
