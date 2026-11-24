/**
 * Puerto de Dominio y Valores Iniciales: Configuración del Envío de Mensajes Automáticos
 * Tareas: EQ-104 (HU9-3) y EQ-108 (HU9-7)
 * Módulo: Mensajes (`src/modulos/mensajes/dominio/repositorio-configuracion.js`)
 */

export const ZONA_HORARIA_INSTITUCIONAL = "America/Hermosillo";

export const DIAS_SEMANA = Object.freeze([
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
]);

export const ORDEN_DIAS_SEMANA = Object.freeze({
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  domingo: 7,
});

export const UNIDADES_TIEMPO_PERMITIDAS = Object.freeze(["horas", "dias"]);

export const LIMITES_TIEMPO_HORAS = Object.freeze({
  MINIMO: 1,
  MAXIMO: 720,
  MAXIMO_DIAS: 30,
});

export const METODOS_REPOSITORIO_CONFIGURACION = Object.freeze([
  "obtenerConfiguracion",
  "guardarConfiguracion",
  "listarBitacora",
]);

/**
 * Calcula la equivalencia en horas de un parámetro de tiempo.
 * @param {{ valor: number, unidad: "horas"|"dias" }} parametro
 * @returns {number}
 */
export function calcularEquivalenciaHoras(parametro) {
  if (!parametro || typeof parametro.valor !== "number") return 0;
  return parametro.unidad === "dias" ? parametro.valor * 24 : parametro.valor;
}

/**
 * Construye una nueva instancia con los valores iniciales aprobados por el PO (EQ-102 / EQ-104).
 * - Zona horaria: "America/Hermosillo"
 * - Lunes a Viernes: habilitados 08:00 a 18:00
 * - Sábado y Domingo: deshabilitados (horaInicio: null, horaFin: null)
 * - Tiempo máximo de espera de respuesta: 24 horas (equivalenciaHoras: 24)
 * - Tiempo de espera por contacto previo: 48 horas (equivalenciaHoras: 48)
 */
export function crearConfiguracionInicial() {
  return {
    zonaHoraria: ZONA_HORARIA_INSTITUCIONAL,
    jornada: {
      lunes: { habilitado: true, horaInicio: "08:00", horaFin: "18:00" },
      martes: { habilitado: true, horaInicio: "08:00", horaFin: "18:00" },
      miercoles: { habilitado: true, horaInicio: "08:00", horaFin: "18:00" },
      jueves: { habilitado: true, horaInicio: "08:00", horaFin: "18:00" },
      viernes: { habilitado: true, horaInicio: "08:00", horaFin: "18:00" },
      sabado: { habilitado: false, horaInicio: null, horaFin: null },
      domingo: { habilitado: false, horaInicio: null, horaFin: null },
    },
    tiempoMaximoEsperaRespuesta: {
      valor: 24,
      unidad: "horas",
      equivalenciaHoras: 24,
    },
    tiempoEsperaContactoPrevio: {
      valor: 48,
      unidad: "horas",
      equivalenciaHoras: 48,
    },
    actualizadoEn: null,
    actualizadoPor: null,
  };
}

/**
 * Clona profundamente un objeto de configuración y recalcula sus equivalencias en horas.
 * Si `congelar` es true, aplica Object.freeze recursivamente para garantizar inmutabilidad.
 *
 * @param {Object} config
 * @param {{ congelar?: boolean }} [opciones]
 * @returns {Object}
 */
export function clonarConfiguracion(config, opciones = {}) {
  const base = config || crearConfiguracionInicial();
  const jornadaClonada = {};

  for (const dia of DIAS_SEMANA) {
    const origenDia = base.jornada?.[dia];
    const habilitado = Boolean(origenDia?.habilitado);
    const diaObj = {
      habilitado,
      horaInicio: habilitado ? String(origenDia.horaInicio) : null,
      horaFin: habilitado ? String(origenDia.horaFin) : null,
    };
    jornadaClonada[dia] = opciones.congelar ? Object.freeze(diaObj) : diaObj;
  }

  const esperaResp = {
    valor: Number(base.tiempoMaximoEsperaRespuesta?.valor ?? 24),
    unidad: base.tiempoMaximoEsperaRespuesta?.unidad ?? "horas",
  };
  esperaResp.equivalenciaHoras = calcularEquivalenciaHoras(esperaResp);

  const esperaContacto = {
    valor: Number(base.tiempoEsperaContactoPrevio?.valor ?? 48),
    unidad: base.tiempoEsperaContactoPrevio?.unidad ?? "horas",
  };
  esperaContacto.equivalenciaHoras = calcularEquivalenciaHoras(esperaContacto);

  const clon = {
    zonaHoraria: base.zonaHoraria || ZONA_HORARIA_INSTITUCIONAL,
    jornada: opciones.congelar ? Object.freeze(jornadaClonada) : jornadaClonada,
    tiempoMaximoEsperaRespuesta: opciones.congelar ? Object.freeze(esperaResp) : esperaResp,
    tiempoEsperaContactoPrevio: opciones.congelar ? Object.freeze(esperaContacto) : esperaContacto,
    actualizadoEn: base.actualizadoEn ?? null,
    actualizadoPor: base.actualizadoPor ?? null,
  };

  return opciones.congelar ? Object.freeze(clon) : clon;
}

/**
 * Clona un registro de bitácora de configuración (EQ-108 / HU9-7).
 *
 * @param {Object} registro
 * @param {{ congelar?: boolean }} [opciones]
 * @returns {Object}
 */
export function clonarRegistroBitacora(registro, opciones = {}) {
  const clon = {
    id: String(registro.id),
    usuarioId: String(registro.usuarioId),
    fechaCambio:
      registro.fechaCambio instanceof Date
        ? registro.fechaCambio.toISOString()
        : String(registro.fechaCambio),
    valorAnterior: clonarConfiguracion(registro.valorAnterior, opciones),
    valorNuevo: clonarConfiguracion(registro.valorNuevo, opciones),
  };
  return opciones.congelar ? Object.freeze(clon) : clon;
}

/**
 * Verifica si un objeto cumple con el contrato IRepositorioConfiguracionMensajes.
 * @param {unknown} candidato
 * @returns {boolean}
 */
export function implementaRepositorioConfiguracion(candidato) {
  if (!candidato || typeof candidato !== "object") return false;
  return METODOS_REPOSITORIO_CONFIGURACION.every(
    (metodo) => typeof candidato[metodo] === "function"
  );
}
