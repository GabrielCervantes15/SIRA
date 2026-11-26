/**
 * HU1-5 (EQ-81) · Vista previa del lote: conteo de aspirantes aplicables.
 *
 * Recibe semáforo, carreras e inactividad mínima y devuelve cuántos aspirantes
 * aplican, siguiendo docs/decisiones/HU1-reglas-lote-envio.md (EQ-77):
 *
 *   1. Solo la cartera del colaborador autenticado (el id sale de la sesión).
 *   2. Nunca VERDE.
 *   3. Nunca solicitudes ACEPTADAS ni RECHAZADAS definitivamente.
 *   4. Última actividad igual o anterior a la fecha de corte.
 *   5. Fuera del tiempo de espera por contacto previo de HU9 (48 h por omisión):
 *      cuenta desde el último mensaje SALIENTE enviado correctamente (el más reciente
 *      entre la conversación y la fecha de última notificación de EQ-87).
 *
 * Las opciones de cada filtro se toman de HU2-7 (ObtenerFiltrosCasoUso) sin VERDE,
 * y se valida que el lote tenga al menos un semáforo y una carrera de esas opciones.
 *
 * Fecha de corte (EQ-77 pide documentarla):
 *   - DIAS y SEMANAS se restan en bloques exactos de 24 h y 7 × 24 h.
 *   - MESES se restan como meses de calendario en UTC; si el día no existe en el
 *     mes de destino se usa el último día de ese mes (31 mar − 1 mes = 28/29 feb).
 *   - El límite es inclusivo: aplica quien tiene última actividad <= fecha de corte.
 *
 * Pendiente fuera de EQ-81: el criterio 6 de EQ-77 (al menos un canal válido y
 * consentimiento de WhatsApp) no tiene datos en el modelo actual; lo aplica el envío.
 */
import { ObtenerFiltrosCasoUso } from "../monitoreo/index.js";

export const UNIDADES_INACTIVIDAD = Object.freeze(["DIAS", "SEMANAS", "MESES"]);
export const ESTADOS_EXCLUIDOS = Object.freeze(["ACEPTADA", "RECHAZADA"]);
export const NIVEL_EXCLUIDO = "VERDE";
export const HORAS_CONTACTO_PREVIO_POR_OMISION = 48;
export const INACTIVIDAD_MAXIMA = 999;

const ESTADOS_ENTREGA_EXITOSOS = new Set(["ENVIADO", "ENTREGADO", "LEIDO"]);
const MS_HORA = 3_600_000;
const MS_DIA = 24 * MS_HORA;

const normalizar = (texto) => String(texto ?? "").trim().toUpperCase();

/** Convierte lo que llega en la URL o en el cuerpo a filtros con tipos uniformes. */
export function normalizarFiltrosLote(entrada = {}) {
  const lista = (valor) => {
    if (Array.isArray(valor)) return valor.map((v) => String(v).trim()).filter(Boolean);
    return String(valor ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  };
  return {
    semaforos: [...new Set(lista(entrada.semaforos).map(normalizar))],
    carreras: [...new Set(lista(entrada.carreras))],
    inactividadValor: Number(entrada.inactividadValor),
    inactividadUnidad: normalizar(entrada.inactividadUnidad),
  };
}

/** Opciones de HU2-7 para el lote: semáforos en mayúsculas y sin VERDE; carreras de la cartera. */
export function opcionesDesdeFiltrosHU27(opciones = {}) {
  const semaforos = [...new Set((opciones.semaforos || []).map(normalizar))]
    .filter((nivel) => nivel && nivel !== NIVEL_EXCLUIDO);
  return { semaforos, carreras: [...(opciones.carreras || [])] };
}

/**
 * @param {{ semaforos: string[], carreras: string[], inactividadValor: number, inactividadUnidad: string }} filtros
 * @param {{ semaforos: string[], carreras: string[] }} opciones
 */
export function validarFiltrosVistaPrevia(filtros, opciones) {
  const errores = {};

  if (filtros.semaforos.length === 0) {
    errores.semaforos = "Selecciona al menos un semáforo.";
  } else if (filtros.semaforos.includes(NIVEL_EXCLUIDO)) {
    errores.semaforos = "El semáforo verde no se puede incluir en un lote.";
  } else if (filtros.semaforos.some((s) => !opciones.semaforos.includes(s))) {
    errores.semaforos = `Solo se permite: ${opciones.semaforos.join(", ")}.`;
  }

  if (filtros.carreras.length === 0) {
    errores.carreras = "Selecciona al menos una carrera.";
  } else if (filtros.carreras.some((c) => !opciones.carreras.includes(c))) {
    errores.carreras = "Solo puedes elegir carreras de tu cartera.";
  }

  const valor = filtros.inactividadValor;
  if (!Number.isInteger(valor) || valor <= 0 || valor > INACTIVIDAD_MAXIMA) {
    errores.inactividadValor = `Debe ser un número entero entre 1 y ${INACTIVIDAD_MAXIMA}.`;
  }
  if (!UNIDADES_INACTIVIDAD.includes(filtros.inactividadUnidad)) {
    errores.inactividadUnidad = "La unidad debe ser días, semanas o meses.";
  }

  return { valido: Object.keys(errores).length === 0, errores };
}

/** Resta meses de calendario en UTC; si el día no existe en el mes destino, usa su último día. */
function restarMeses(fecha, meses) {
  const destino = new Date(fecha.getTime());
  const dia = destino.getUTCDate();
  destino.setUTCDate(1);
  destino.setUTCMonth(destino.getUTCMonth() - meses);
  const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(dia, ultimoDia));
  return destino;
}

/** Fecha de corte de la inactividad mínima. Ver reglas al inicio del archivo. */
export function calcularFechaCorte(valor, unidad, ahora = new Date()) {
  const instante = ahora instanceof Date ? ahora : new Date(ahora);
  switch (normalizar(unidad)) {
    case "DIAS": return new Date(instante.getTime() - valor * MS_DIA);
    case "SEMANAS": return new Date(instante.getTime() - valor * 7 * MS_DIA);
    case "MESES": return restarMeses(instante, valor);
    default: throw new RangeError(`Unidad de inactividad desconocida: ${unidad}`);
  }
}

/** Horas de espera por contacto previo según la configuración vigente de HU9. */
export function horasContactoPrevio(configuracion) {
  const tiempo = configuracion?.tiempoEsperaContactoPrevio;
  const horas = Number(tiempo?.equivalenciaHoras ??
    (normalizar(tiempo?.unidad) === "DIAS" ? Number(tiempo?.valor) * 24 : tiempo?.valor));
  return Number.isFinite(horas) && horas > 0 ? horas : HORAS_CONTACTO_PREVIO_POR_OMISION;
}

/** Fecha del último mensaje saliente enviado correctamente, o null. */
export function ultimoContactoSaliente(mensajes = []) {
  let ultimo = null;
  for (const m of mensajes) {
    if (normalizar(m.direccion) !== "SALIENTE") continue;
    if (!ESTADOS_ENTREGA_EXITOSOS.has(normalizar(m.estadoEntrega))) continue;
    const ms = new Date(m.fechaEnvio).getTime();
    if (Number.isFinite(ms) && (ultimo === null || ms > ultimo)) ultimo = ms;
  }
  return ultimo === null ? null : new Date(ultimo);
}

function fechaReferenciaActividad(aspirante) {
  const ms = new Date(aspirante.fechaUltimaActividad ?? aspirante.fechaSolicitud).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {Object} dependencias
 * @param {Object} dependencias.repositorioMonitoreo  listarAspirantes, obtenerFiltrosColaborador, obtenerConversacionAspirante
 * @param {{ obtenerConfiguracionVigente: () => Object }} [dependencias.interfazLecturaConfiguracion]  HU9
 * @param {() => Date} [dependencias.reloj]
 */
export function crearServicioVistaPreviaLote({ repositorioMonitoreo, interfazLecturaConfiguracion = null, reloj = () => new Date() }) {
  if (!repositorioMonitoreo) throw new Error("Se requiere repositorioMonitoreo para la vista previa del lote.");
  const casoFiltros = new ObtenerFiltrosCasoUso({ repositorioMonitoreo });

  async function obtenerOpciones(colaboradorId) {
    return opcionesDesdeFiltrosHU27(await casoFiltros.ejecutar(colaboradorId));
  }

  /**
   * @param {string} colaboradorId  Siempre el de la sesión.
   * @param {Object} entrada  Filtros sin normalizar (query string o cuerpo JSON).
   */
  async function calcular(colaboradorId, entrada) {
    const ahora = reloj();
    const filtros = normalizarFiltrosLote(entrada);
    const opciones = await obtenerOpciones(colaboradorId);
    const { valido, errores } = validarFiltrosVistaPrevia(filtros, opciones);
    const horasEspera = horasContactoPrevio(interfazLecturaConfiguracion?.obtenerConfiguracionVigente?.());

    const base = { filtros, opciones, horasContactoPrevio: horasEspera };
    if (!valido) {
      return { ...base, valido, errores, fechaCorte: null, total: 0, elegibles: [], excluidos: null };
    }

    const fechaCorte = calcularFechaCorte(filtros.inactividadValor, filtros.inactividadUnidad, ahora);
    const { aspirantes: cartera } = await repositorioMonitoreo.listarAspirantes({
      colaboradorId, mostrarAceptados: true, limit: 100000,
    });

    const excluidos = { verde: 0, estadoSolicitud: 0, contactoReciente: 0 };
    const candidatos = [];
    for (const a of cartera) {
      const nivel = normalizar(a.semaforo);
      if (nivel === NIVEL_EXCLUIDO) { excluidos.verde += 1; continue; }
      if (ESTADOS_EXCLUIDOS.includes(normalizar(a.estadoSolicitud))) { excluidos.estadoSolicitud += 1; continue; }
      if (!filtros.semaforos.includes(nivel) || !filtros.carreras.includes(a.carreraSolicitada)) continue;
      const actividad = fechaReferenciaActividad(a);
      if (actividad === null || actividad > fechaCorte.getTime()) continue;
      candidatos.push(a);
    }

    // El historial de mensajes solo se consulta para quienes ya pasaron los filtros baratos.
    const limiteContacto = ahora.getTime() - horasEspera * MS_HORA;
    const elegibles = [];
    for (const a of candidatos) {
      const contactos = [
        ultimoContactoSaliente(await repositorioMonitoreo.obtenerConversacionAspirante(a.id))?.getTime(),
        Date.parse(a.fechaUltimaNotificacion),
      ].filter(Number.isFinite);
      const contacto = contactos.length ? new Date(Math.max(...contactos)) : null;
      if (contacto && contacto.getTime() > limiteContacto) { excluidos.contactoReciente += 1; continue; }
      elegibles.push(a);
    }

    return { ...base, valido: true, errores: {}, fechaCorte, total: elegibles.length, elegibles, excluidos };
  }

  return { calcular, obtenerOpciones };
}
