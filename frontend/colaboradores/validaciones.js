/** Reglas compartidas de interfaz; el servidor vuelve a validarlas. */
export function idValido(id) {
  return /^\d{5,20}$/.test(String(id ?? '').trim());
}

export function puedeContinuar({ perfil, campus, campusDisponibles = [] } = {}) {
  return Boolean(perfil?.idInstitucional && campus && campusDisponibles.includes(campus));
}

export function puedeGuardarCarreras({ carreras = [], disponibles = [] } = {}) {
  return Array.isArray(carreras) && carreras.length > 0 &&
    carreras.every((carrera) => disponibles.includes(carrera));
}

// ---------- EQ-64 · HU6-17: paso 3 (revisión de distribución) ----------

/** Se puede pasar a la revisión con las mismas reglas que guardar el borrador. */
export function puedeIrARevision({ carreras = [], disponibles = [], manual = true } = {}) {
  return Boolean(manual) && puedeGuardarCarreras({ carreras, disponibles });
}

/**
 * Solo se confirma lo que se revisó: la vista previa debe ser del mismo
 * colaborador, campus y carreras que se van a enviar.
 */
export function puedeConfirmar({ vistaPrevia, idInstitucional, campus, carreras = [] } = {}) {
  if (!vistaPrevia || !idInstitucional || !campus) return false;
  const revisadas = (vistaPrevia.carreras ?? []).map((c) => c.carrera).sort();
  const enviadas = [...new Set(carreras)].sort();
  return vistaPrevia.colaborador?.idInstitucional === idInstitucional &&
    vistaPrevia.campus === campus &&
    revisadas.length === enviadas.length &&
    revisadas.every((c, i) => c === enviadas[i]);
}

/** "+12", "−5" o "sin cambio" para la tabla de cargas. */
export function describirCambioCarga({ antes = 0, despues = 0 } = {}) {
  const diferencia = despues - antes;
  if (diferencia === 0) return 'sin cambio';
  return diferencia > 0 ? `+${diferencia}` : `−${Math.abs(diferencia)}`;
}

// ---------- EQ-71 · HU6-12: listado de colaboradores ----------

/** "Campus Obregón Náinari" → "Obregón Náinari" para los botones de filtro. */
export function etiquetaCampus(nombre) {
  return String(nombre ?? '').replace(/^Campus\s+/i, '').trim();
}

/** Página de una lista (las páginas empiezan en 0 y se ajustan al rango válido). */
export function paginar(lista = [], pagina = 0, tamano = 9) {
  const paginas = Math.max(1, Math.ceil(lista.length / tamano));
  const actual = Math.min(Math.max(0, pagina), paginas - 1);
  const inicio = actual * tamano;
  return { visibles: lista.slice(inicio, inicio + tamano), pagina: actual, paginas, inicio };
}

// ---------- HU6-18 · HU7: baja de colaborador ----------

/** "2026-11-26" → "26/11/2026". */
export function formatearFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Texto de "Periodo Baja" para la tarjeta de un colaborador inactivo. */
export function describirPeriodoBaja(periodo) {
  if (!periodo || periodo.indefinido) return 'Indefinido';
  const desde = formatearFecha(periodo.desde);
  const hasta = formatearFecha(periodo.hasta);
  return desde && hasta ? `${desde} – ${hasta}` : (hasta || desde || 'Indefinido');
}

/**
 * Mensaje de error de la duración elegida, o null si es válida (el servidor vuelve a validar).
 * @param {{ tipo: 'indefinido'|'periodo', inicio?: string, fin?: string }} duracion
 * @param {string} hoy YYYY-MM-DD
 */
export function errorDuracionBaja({ tipo, inicio = '', fin = '' } = {}, hoy = '') {
  if (tipo === 'indefinido') return null;
  if (tipo !== 'periodo') return 'Indica si la baja es indefinida o por un periodo.';
  if (!inicio || !fin) return 'Indica la fecha de inicio y la de fin del periodo.';
  if (fin < inicio) return 'La fecha de fin no puede ser anterior a la de inicio.';
  if (hoy && fin < hoy) return 'El periodo de baja ya terminó; elige una fecha de fin igual o posterior a hoy.';
  return null;
}

/** Solo se da de baja con una vista previa cargada, duración válida y sin envío en curso. */
export function puedeDarDeBaja({ vistaPrevia, duracion, hoy, enviando = false } = {}) {
  return Boolean(vistaPrevia?.colaborador?.idInstitucional) && !enviando && errorDuracionBaja(duracion, hoy) === null;
}

// ---------- EQ-73 · HU6-19: casos especiales y transferencia manual ----------

function normalizarTextoBusqueda(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Valida que el identificador interno del expediente (`aspiranteId`) sea texto
 * no vacío tras `.trim()` y de máximo 50 caracteres (alineado a EQ-70).
 * @param {unknown} valor
 * @returns {boolean}
 */
export function aspiranteIdValido(valor) {
  if (typeof valor !== 'string') return false;
  const limpio = valor.trim();
  return limpio.length >= 1 && limpio.length <= 50;
}

/**
 * Filtra únicamente colaboradores activos con la casilla `casosEspeciales` habilitada
 * (criterio C5 / CP-HU6-18), permitiendo filtrar por campus y buscar por nombre o ID.
 *
 * @param {Array<Object>} [colaboradores]
 * @param {{ campus?: string, busqueda?: string }} [filtros]
 * @returns {Array<Object>}
 */
export function filtrarColaboradoresCasosEspeciales(
  colaboradores = [],
  { campus = '', busqueda = '' } = {}
) {
  if (!Array.isArray(colaboradores)) return [];
  const campusLimpio = String(campus ?? '').trim();
  const termino = normalizarTextoBusqueda(busqueda);

  return colaboradores.filter((c) => {
    if (!c || c.activo !== true || c.casosEspeciales !== true) return false;
    if (campusLimpio && c.campus !== campusLimpio) return false;
    if (!termino) return true;
    const nombreNorm = normalizarTextoBusqueda(c.nombreCompleto);
    const idNorm = normalizarTextoBusqueda(c.idInstitucional);
    return nombreNorm.includes(termino) || idNorm.includes(termino);
  });
}

/**
 * Determina si se puede enviar el formulario de transferencia manual:
 * requiere `aspiranteId` válido, sin envío en curso y un `colaboradorDestino`
 * que exista en `colaboradores` con `activo === true` y `casosEspeciales === true`.
 *
 * @param {{
 *   aspiranteId?: unknown,
 *   colaboradorDestino?: unknown,
 *   colaboradores?: Array<Object>,
 *   enviando?: boolean
 * }} [params]
 * @returns {boolean}
 */
export function puedeTransferirManual({
  aspiranteId,
  colaboradorDestino,
  colaboradores = [],
  enviando = false,
} = {}) {
  if (enviando) return false;
  if (!aspiranteIdValido(aspiranteId)) return false;
  const idDestino = String(colaboradorDestino ?? '').trim();
  if (!idValido(idDestino) || !Array.isArray(colaboradores)) return false;
  const destino = colaboradores.find((c) => String(c?.idInstitucional ?? '').trim() === idDestino);
  return Boolean(destino && destino.activo === true && destino.casosEspeciales === true);
}

const MENSAJES_ERROR_TRANSFERENCIA = Object.freeze({
  ASPIRANTE_ID_INVALIDO: 'Ingresa un identificador interno de expediente válido (máximo 50 caracteres, ej. asp-003).',
  ID_INVALIDO: 'Selecciona un colaborador destino con un ID institucional válido.',
  ASPIRANTE_NO_ENCONTRADO: 'No se encontró un expediente con ese ID. Verifica que sea el ID interno (ej. asp-003) y no el folio.',
  COLABORADOR_DESTINO_NO_ENCONTRADO: 'No se encontró el colaborador destino seleccionado.',
  COLABORADOR_DESTINO_INACTIVO: 'El colaborador destino está inactivo. Solo puedes transferir expedientes a colaboradores activos.',
  COLABORADOR_SIN_CASOS_ESPECIALES: 'El colaborador seleccionado no tiene activa la casilla «Casos especiales».',
  YA_ASIGNADO: 'Este expediente ya se encuentra asignado al colaborador seleccionado.',
  MISMO_CAMPUS: 'El expediente pertenece al mismo campus base del colaborador destino. La transferencia manual solo aplica entre campus diferentes.',
});

/**
 * Devuelve un mensaje claro y accionable para los códigos de error de EQ-70.
 * @param {string} [codigo]
 * @param {string} [mensajeServidor]
 * @returns {string}
 */
export function describirErrorTransferencia(codigo, mensajeServidor) {
  if (codigo && MENSAJES_ERROR_TRANSFERENCIA[codigo]) {
    return MENSAJES_ERROR_TRANSFERENCIA[codigo];
  }
  const respaldo = typeof mensajeServidor === 'string' ? mensajeServidor.trim() : '';
  return respaldo || 'No se pudo completar la transferencia manual del expediente.';
}
