/**
 * HU 8 · Dominio del catálogo de mensajes predefinidos (EQ-95).
 * Reglas y contenido aprobados por el PO en EQ-93 (docs/decisiones/HU8-catalogo-mensajes.md).
 *
 * El catálogo es de SOLO LECTURA para Administrador y Colaborador.
 * Las variables usan la sintaxis {{nombre}}.
 */

export const CATEGORIAS = Object.freeze(["ENVIO", "RESPUESTA"]);
export const DISPARADORES = Object.freeze(["AUTOMATICO", "MANUAL", "AUTOMATICO_Y_MANUAL", "LOTE_HU1", "RESPUESTA"]);
export const ESTADOS_PLANTILLA_META = Object.freeze(["PENDIENTE", "ENVIADA", "APROBADA", "RECHAZADA"]);

/** Descripción de cada variable permitida en los textos. */
export const VARIABLES = Object.freeze({
  nombre: "Nombre del aspirante",
  carrera: "Carrera solicitada por el aspirante",
});

/** Valores de ejemplo para la vista previa cuando no se indica otro. */
export const VALORES_EJEMPLO = Object.freeze({ nombre: "Ana", carrera: "Ingeniería en Software" });

const PATRON_VARIABLE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const LIMITE_VALOR_VISTA_PREVIA = 80;

export class ErrorCatalogo extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorCatalogo";
    this.status = status;
    this.codigo = codigo;
  }
}

/** Variables usadas en un texto, sin repetir y en orden de aparición. */
export function variablesDeTexto(texto) {
  return [...new Set([...String(texto ?? "").matchAll(PATRON_VARIABLE)].map((m) => m[1]))];
}

/**
 * Sustituye las variables del texto. Si falta un valor lanza error: un mensaje al
 * aspirante nunca debe salir con «{{nombre}}» sin reemplazar.
 * @param {string} texto
 * @param {Record<string, string>} valores
 */
export function renderizarPlantilla(texto, valores = {}) {
  return String(texto).replace(PATRON_VARIABLE, (_, variable) => {
    const valor = valores[variable];
    if (valor == null || String(valor).trim() === "") {
      throw new ErrorCatalogo(400, "VARIABLE_FALTANTE", `Falta el valor de la variable «${variable}».`);
    }
    return String(valor).trim();
  });
}

/**
 * Valores para la vista previa: los de ejemplo, sustituidos por los que mande el
 * usuario (recortados, sin caracteres de control y con un máximo de 80 caracteres).
 * @param {Record<string, unknown>} [personalizados]
 */
export function valoresVistaPrevia(personalizados = {}) {
  const valores = { ...VALORES_EJEMPLO };
  for (const variable of Object.keys(VARIABLES)) {
    const crudo = personalizados[variable];
    if (crudo == null) continue;
    // eslint-disable-next-line no-control-regex
    const limpio = String(crudo).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    if (!limpio) continue;
    if (limpio.length > LIMITE_VALOR_VISTA_PREVIA) {
      throw new ErrorCatalogo(400, "VALOR_DEMASIADO_LARGO", `«${variable}» admite hasta ${LIMITE_VALOR_VISTA_PREVIA} caracteres.`);
    }
    valores[variable] = limpio;
  }
  return valores;
}

/**
 * Revisa que un mensaje del catálogo esté bien formado.
 * @returns {string[]} errores (vacío si es válido)
 */
export function validarMensaje(m) {
  const errores = [];
  const id = m?.id ?? "(sin id)";
  if (!/^[a-z][a-z0-9_]{2,59}$/.test(m?.id ?? "")) errores.push(`${id}: id inválido (minúsculas, números y _).`);
  if (!CATEGORIAS.includes(m?.categoria)) errores.push(`${id}: categoría inválida.`);
  if (!DISPARADORES.includes(m?.disparador)) errores.push(`${id}: disparador inválido.`);
  if (!m?.nombre?.trim()) errores.push(`${id}: falta nombre.`);
  if (!m?.texto?.trim()) errores.push(`${id}: falta texto.`);
  if (!Array.isArray(m?.reglas) || m.reglas.length === 0) errores.push(`${id}: falta al menos una regla de negocio.`);
  if (!Array.isArray(m?.llaves) || m.llaves.length === 0) errores.push(`${id}: falta al menos una llave.`);

  const usadas = variablesDeTexto(m?.texto).sort();
  const declaradas = [...(m?.variables ?? [])].sort();
  if (usadas.join() !== declaradas.join()) {
    errores.push(`${id}: variables declaradas (${declaradas.join(", ") || "ninguna"}) ≠ usadas en el texto (${usadas.join(", ") || "ninguna"}).`);
  }
  for (const v of usadas) if (!(v in VARIABLES)) errores.push(`${id}: variable desconocida «${v}».`);
  if (/\d{1,2}:\d{2}/.test(m?.texto ?? "")) errores.push(`${id}: el texto no debe fijar un horario (se consulta en HU9).`);

  if (m?.categoria === "RESPUESTA" && m?.disparador !== "RESPUESTA" && m?.disparador !== "AUTOMATICO") {
    errores.push(`${id}: un mensaje de respuesta solo puede ser RESPUESTA o AUTOMATICO.`);
  }
  if (m?.pregunta != null && m?.categoria !== "RESPUESTA") errores.push(`${id}: solo las FAQ (RESPUESTA) llevan pregunta.`);
  if (m?.requierePlantillaMeta) {
    if (!m.plantillaMeta || !ESTADOS_PLANTILLA_META.includes(m.plantillaMeta.estado)) {
      errores.push(`${id}: requiere plantilla de Meta pero no indica su estado.`);
    }
  } else if (m?.plantillaMeta) {
    errores.push(`${id}: tiene plantilla de Meta pero requierePlantillaMeta es false.`);
  }
  return errores;
}

/** Valida todo el catálogo (incluye ids únicos y orden sin repetir por categoría). */
export function validarCatalogo(mensajes) {
  const errores = mensajes.flatMap(validarMensaje);
  const ids = mensajes.map((m) => m.id);
  for (const repetido of ids.filter((id, i) => ids.indexOf(id) !== i)) errores.push(`${repetido}: id repetido.`);
  for (const categoria of CATEGORIAS) {
    const ordenes = mensajes.filter((m) => m.categoria === categoria).map((m) => m.orden);
    if (new Set(ordenes).size !== ordenes.length) errores.push(`${categoria}: hay órdenes repetidos.`);
  }
  return errores;
}

/**
 * Forma de un mensaje en la LISTA (EQ-96). Conserva `mensaje` y `llaves` porque la
 * pantalla de EQ-98/99 ya los usa.
 */
export function aResumen(m) {
  return {
    id: m.id,
    categoria: m.categoria,
    nombre: m.nombre,
    grupo: m.grupo ?? null,
    pregunta: m.pregunta ?? null,
    disparador: m.disparador,
    requierePlantillaMeta: Boolean(m.requierePlantillaMeta),
    llaves: m.llaves.map((l) => ({ tipo: l.tipo, valor: l.valor })),
    mensaje: m.texto,
  };
}

/** Forma del DETALLE (EQ-97): todo lo de la lista más reglas, variables y vista previa. */
export function aDetalle(m, valores) {
  return {
    ...aResumen(m),
    canal: m.canal,
    plantillaMeta: m.plantillaMeta ? { ...m.plantillaMeta } : null,
    variables: m.variables.map((nombre) => ({ nombre, descripcion: VARIABLES[nombre] })),
    reglas: [...m.reglas],
    vistaPrevia: {
      texto: renderizarPlantilla(m.texto, valores),
      valores: Object.fromEntries(m.variables.map((v) => [v, valores[v]])),
    },
    soloLectura: true,
  };
}
