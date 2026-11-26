/**
 * HU1-8 (EQ-84) · Mensaje predefinido personalizado desde el catálogo de HU8.
 *
 * Arma el texto del lote de reactivación a partir del mensaje `reactivacion_hu1`
 * del catálogo de HU8 (texto aprobado por el PO en EQ-93 §4.4, el mismo de la
 * plantilla de Meta de EQ-79), con las variables del aspirante:
 *
 *   {aspirante} → nombre del aspirante (campo `nombre` o primera palabra de `nombreCompleto`)
 *   {carrera}   → carrera solicitada (`carreraSolicitada`)
 *
 * Si al aspirante le falta alguna variable que use el texto, el mensaje NO se arma:
 * se devuelve `enviable: false` con las variables faltantes para registrar el fallo.
 * Un mensaje nunca sale con «{carrera}» sin sustituir ni con un hueco.
 */
import { renderizarPlantilla, variablesDeTexto } from "../mensajes-ia/dominio/catalogo.js";

export const ID_MENSAJE_REACTIVACION = "reactivacion_hu1";
export const TITULO_FALLO = "Mensaje automático no enviado";

export class ErrorMensajeReactivacion extends Error {
  constructor(codigo, mensaje, status = 409) {
    super(mensaje);
    this.name = "ErrorMensajeReactivacion";
    this.codigo = codigo;
    this.status = status;
  }
}

const limpio = (valor) => String(valor ?? "").replace(/\s+/g, " ").trim();

/** Valores de las variables que se pueden sacar del aspirante. */
export function valoresDelAspirante(aspirante = {}) {
  const nombre = limpio(aspirante.nombre) || limpio(aspirante.nombreCompleto).split(" ")[0] || "";
  return { aspirante: nombre, carrera: limpio(aspirante.carreraSolicitada) };
}

/**
 * Personaliza un texto del catálogo para un aspirante.
 * @returns {{ enviable: true, texto: string } | { enviable: false, codigo: string, faltantes: string[], motivo: string }}
 */
export function personalizarTexto(texto, aspirante) {
  const valores = valoresDelAspirante(aspirante);
  const faltantes = variablesDeTexto(texto).filter((v) => !valores[v]);
  if (faltantes.length > 0) {
    return {
      enviable: false,
      codigo: "VARIABLE_FALTANTE",
      faltantes,
      motivo: `Falta ${faltantes.map((v) => `«${v}»`).join(" y ")} del aspirante; el mensaje no se envió.`,
    };
  }
  return { enviable: true, texto: renderizarPlantilla(texto, valores) };
}

/**
 * @param {Object} dependencias
 * @param {{ obtenerPorId: (id: string) => Promise<Object|null> }} dependencias.repositorioCatalogo  Repositorio de HU8.
 * @param {string} [dependencias.idMensaje]
 */
export function crearGeneradorMensajeReactivacion({ repositorioCatalogo, idMensaje = ID_MENSAJE_REACTIVACION }) {
  if (!repositorioCatalogo?.obtenerPorId) throw new Error("Se requiere el repositorio del catálogo de HU8.");

  /** Mensaje de reactivación del catálogo; error si no existe o no es de envío. */
  async function obtenerPlantilla() {
    const mensaje = await repositorioCatalogo.obtenerPorId(idMensaje);
    if (!mensaje || mensaje.categoria !== "ENVIO" || !String(mensaje.texto ?? "").trim()) {
      throw new ErrorMensajeReactivacion(
        "MENSAJE_REACTIVACION_NO_DISPONIBLE",
        `El catálogo de HU8 no tiene el mensaje de reactivación «${idMensaje}».`,
      );
    }
    return mensaje;
  }

  /** Personaliza el mensaje para cada aspirante con una sola lectura del catálogo. */
  async function personalizarLote(aspirantes) {
    const plantilla = await obtenerPlantilla();
    return aspirantes.map((aspirante) => ({
      aspirante,
      mensajeId: plantilla.id,
      ...personalizarTexto(plantilla.texto, aspirante),
    }));
  }

  return { obtenerPlantilla, personalizarLote };
}
