/**
 * Validador de Dominio: Configuración del Envío de Mensajes Automáticos
 * Tareas: EQ-104 (HU9-3) y EQ-107 (HU9-6)
 */
import {
  ZONA_HORARIA_INSTITUCIONAL,
  DIAS_SEMANA,
  UNIDADES_TIEMPO_PERMITIDAS,
  LIMITES_TIEMPO_HORAS,
  calcularEquivalenciaHoras,
} from "./repositorio-configuracion.js";

const REGEX_HORA_24H = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * Convierte una cadena "HH:MM" válida a minutos desde las 00:00.
 * @param {string} hora
 * @returns {number}
 */
export function convertirHoraAMinutos(hora) {
  const [hh, mm] = String(hora).split(":").map(Number);
  return hh * 60 + mm;
}

/**
 * Valida un parámetro de tiempo ({ valor, unidad }).
 * Reglas aprobadas por el PO:
 * - Unidades permitidas: únicamente "horas" o "dias".
 * - Valor: entero positivo estricto (sin decimales, sin strings, > 0).
 * - Rango equivalente: mínimo 1 hora y máximo 30 días (720 horas).
 *
 * @param {unknown} parametro
 * @param {string} etiqueta
 * @returns {{ error: string|null, normalizado: { valor: number, unidad: "horas"|"dias", equivalenciaHoras: number }|null }}
 */
function validarParametroTiempo(parametro, etiqueta) {
  if (!parametro || typeof parametro !== "object" || Array.isArray(parametro)) {
    return {
      error: `${etiqueta} es obligatorio y debe ser un objeto con 'valor' y 'unidad'.`,
      normalizado: null,
    };
  }

  const { valor, unidad } = parametro;

  if (typeof unidad !== "string" || !UNIDADES_TIEMPO_PERMITIDAS.includes(unidad)) {
    return {
      error: `La unidad de ${etiqueta} debe ser únicamente 'horas' o 'dias'.`,
      normalizado: null,
    };
  }

  if (typeof valor !== "number" || !Number.isFinite(valor) || !Number.isInteger(valor)) {
    return {
      error: `El valor de ${etiqueta} debe ser un número entero positivo sin decimales.`,
      normalizado: null,
    };
  }

  if (valor < 1) {
    return {
      error: `El valor de ${etiqueta} debe ser un entero positivo mayor o igual a 1.`,
      normalizado: null,
    };
  }

  const equivalenciaHoras = calcularEquivalenciaHoras({ valor, unidad });
  if (
    equivalenciaHoras < LIMITES_TIEMPO_HORAS.MINIMO ||
    equivalenciaHoras > LIMITES_TIEMPO_HORAS.MAXIMO
  ) {
    return {
      error: `${etiqueta} debe estar entre ${LIMITES_TIEMPO_HORAS.MINIMO} hora y ${LIMITES_TIEMPO_HORAS.MAXIMO_DIAS} días (${LIMITES_TIEMPO_HORAS.MAXIMO} horas).`,
      normalizado: null,
    };
  }

  return {
    error: null,
    normalizado: {
      valor,
      unidad,
      equivalenciaHoras,
    },
  };
}

/**
 * Valida de forma exhaustiva un objeto de configuración de mensajes automáticos.
 * Retorna los errores por campo para que el frontend los muestre junto a cada control.
 *
 * @param {unknown} entrada
 * @returns {{
 *   valido: boolean,
 *   errores: Record<string, string>,
 *   configuracionNormalizada: Object|null
 * }}
 */
export function validarConfiguracionMensajes(entrada) {
  const errores = {};

  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
    return {
      valido: false,
      errores: {
        configuracion: "El cuerpo de la configuración debe ser un objeto JSON válido.",
      },
      configuracionNormalizada: null,
    };
  }

  // Prohibir segunda ventana horaria (Decisión PO 2.3 / 8.3)
  if (
    entrada.horarioPermitido !== undefined ||
    entrada.ventanaEnvio !== undefined ||
    entrada.horarioEnvio !== undefined
  ) {
    errores.horarioPermitido =
      "El horario permitido abarca toda la jornada configurada del día; no se permite configurar una segunda ventana horaria.";
  }

  // 1. Validar zona horaria
  const zonaHoraria =
    entrada.zonaHoraria === undefined ? ZONA_HORARIA_INSTITUCIONAL : entrada.zonaHoraria;
  if (zonaHoraria !== ZONA_HORARIA_INSTITUCIONAL) {
    errores.zonaHoraria = `La zona horaria institucional debe ser '${ZONA_HORARIA_INSTITUCIONAL}'.`;
  }

  // 2. Validar tiempo máximo de espera de respuesta
  const validacionRespuesta = validarParametroTiempo(
    entrada.tiempoMaximoEsperaRespuesta,
    "Tiempo máximo de espera de respuesta"
  );
  if (validacionRespuesta.error) {
    errores.tiempoMaximoEsperaRespuesta = validacionRespuesta.error;
  }

  // 3. Validar tiempo de espera por contacto previo
  const validacionContacto = validarParametroTiempo(
    entrada.tiempoEsperaContactoPrevio,
    "Tiempo de espera por contacto previo"
  );
  if (validacionContacto.error) {
    errores.tiempoEsperaContactoPrevio = validacionContacto.error;
  }

  // 4. Validar jornada de los 7 días
  const jornadaNormalizada = {};
  if (!entrada.jornada || typeof entrada.jornada !== "object" || Array.isArray(entrada.jornada)) {
    errores.jornada = "La jornada laboral es obligatoria y debe incluir los 7 días de la semana.";
  } else {
    const clavesRecibidas = Object.keys(entrada.jornada);
    const diasFaltantes = DIAS_SEMANA.filter((dia) => !(dia in entrada.jornada));
    const diasDesconocidos = clavesRecibidas.filter((clave) => !DIAS_SEMANA.includes(clave));

    if (diasFaltantes.length > 0) {
      errores.jornada = `La jornada debe incluir los 7 días de la semana. Faltan: ${diasFaltantes.join(", ")}.`;
      for (const diaFaltante of diasFaltantes) {
        errores[`jornada.${diaFaltante}`] = `Falta la configuración del día '${diaFaltante}'.`;
      }
    }

    if (diasDesconocidos.length > 0) {
      errores.jornada = `La jornada contiene días no reconocidos: ${diasDesconocidos.join(", ")}.`;
    }

    for (const dia of DIAS_SEMANA) {
      if (!(dia in entrada.jornada)) continue;
      const configDia = entrada.jornada[dia];
      const campoErrorDia = `jornada.${dia}`;

      if (!configDia || typeof configDia !== "object" || Array.isArray(configDia)) {
        errores[campoErrorDia] = `La configuración de '${dia}' debe ser un objeto válido.`;
        continue;
      }

      if (
        configDia.horarioPermitido !== undefined ||
        configDia.ventanaEnvio !== undefined ||
        configDia.horarioEnvio !== undefined
      ) {
        errores.horarioPermitido =
          "El horario permitido abarca toda la jornada del día; no se permite una segunda ventana horaria.";
        errores[campoErrorDia] =
          "El horario permitido abarca toda la jornada del día; no se permite una segunda ventana horaria.";
        continue;
      }

      if (typeof configDia.habilitado !== "boolean") {
        errores[campoErrorDia] = `El campo 'habilitado' de '${dia}' debe ser un valor booleano (true o false).`;
        continue;
      }

      if (configDia.habilitado) {
        const { horaInicio, horaFin } = configDia;
        if (typeof horaInicio !== "string" || !REGEX_HORA_24H.test(horaInicio)) {
          errores[campoErrorDia] = `La hora de inicio de '${dia}' debe tener formato válido HH:MM (00:00 a 23:59).`;
          continue;
        }
        if (typeof horaFin !== "string" || !REGEX_HORA_24H.test(horaFin)) {
          errores[campoErrorDia] = `La hora de fin de '${dia}' debe tener formato válido HH:MM (00:00 a 23:59).`;
          continue;
        }
        if (convertirHoraAMinutos(horaInicio) >= convertirHoraAMinutos(horaFin)) {
          errores[campoErrorDia] = `En '${dia}', la hora de inicio (${horaInicio}) debe ser estrictamente anterior a la hora de fin (${horaFin}).`;
          continue;
        }

        jornadaNormalizada[dia] = {
          habilitado: true,
          horaInicio,
          horaFin,
        };
      } else {
        jornadaNormalizada[dia] = {
          habilitado: false,
          horaInicio: null,
          horaFin: null,
        };
      }
    }
  }

  const valido = Object.keys(errores).length === 0;
  if (!valido) {
    return {
      valido: false,
      errores,
      configuracionNormalizada: null,
    };
  }

  return {
    valido: true,
    errores: {},
    configuracionNormalizada: {
      zonaHoraria: ZONA_HORARIA_INSTITUCIONAL,
      jornada: jornadaNormalizada,
      tiempoMaximoEsperaRespuesta: validacionRespuesta.normalizado,
      tiempoEsperaContactoPrevio: validacionContacto.normalizado,
    },
  };
}
