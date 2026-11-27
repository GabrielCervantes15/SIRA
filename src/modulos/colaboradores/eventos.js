/**
 * Contrato y validación de eventos del módulo Colaboradores (HU 6 · EQ-69 / HU6-10 / HU6-18).
 *
 * Valida la estructura del evento `colaboradores.baja.confirmada` publicado al dar de baja
 * (marcar como inactivo) a un colaborador y reasignar su cartera equitativamente.
 */
import { randomBytes } from "node:crypto";

export const EXCHANGE_EVENTOS = "crm.eventos";
export const EVENTO_BAJA_CONFIRMADA = "colaboradores.baja.confirmada";
export const VERSION_EVENTO = 1;

const FECHA_ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const FECHA_SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

function esTextoNoVacio(valor) {
  return typeof valor === "string" && valor.trim() !== "";
}

function esFechaIso(valor) {
  return (
    typeof valor === "string" &&
    FECHA_ISO.test(valor) &&
    !Number.isNaN(Date.parse(valor))
  );
}

/**
 * Construye un evento `colaboradores.baja.confirmada` siguiendo el contrato del módulo.
 *
 * @param {Object} datos
 * @param {string} [datos.eventId]
 * @param {string} datos.colaboradorId
 * @param {string|null} [datos.nombreCompleto]
 * @param {string|null} [datos.correoInstitucional]
 * @param {string} datos.campus
 * @param {{ indefinida: boolean, desde: string, hasta: string|null }} datos.baja
 * @param {Array<Object>} datos.receptores
 * @param {string|null} [datos.realizadoPor]
 * @param {string} datos.fechaConfirmacion
 */
export function crearEventoBajaConfirmada(datos = {}) {
  return {
    eventId: datos.eventId ?? `evt-baja-${randomBytes(6).toString("hex")}`,
    tipo: EVENTO_BAJA_CONFIRMADA,
    colaboradorId: datos.colaboradorId,
    nombreCompleto: datos.nombreCompleto ?? null,
    correoInstitucional: datos.correoInstitucional ?? null,
    campus: datos.campus,
    baja: datos.baja
      ? {
          indefinida: Boolean(datos.baja.indefinida ?? datos.baja.indefinido),
          desde: datos.baja.desde,
          hasta: datos.baja.hasta ?? null,
        }
      : null,
    receptores: Array.isArray(datos.receptores)
      ? datos.receptores.map((r) => ({
          colaboradorId: r.colaboradorId,
          nombreCompleto: r.nombreCompleto ?? null,
          correoInstitucional: r.correoInstitucional ?? null,
          aspirantesRecibidos: r.aspirantesRecibidos,
          carrerasRecibidas: Array.isArray(r.carrerasRecibidas)
            ? r.carrerasRecibidas.map((c) => ({ ...c }))
            : [],
        }))
      : [],
    realizadoPor: datos.realizadoPor ?? null,
    fechaConfirmacion: datos.fechaConfirmacion,
  };
}

/**
 * Valida la estructura e integridad de un evento `colaboradores.baja.confirmada`.
 *
 * @param {unknown} evento
 * @returns {{ valido: boolean, errores: string[] }}
 */
export function validarEventoBajaConfirmada(evento) {
  if (evento === null || typeof evento !== "object" || Array.isArray(evento)) {
    return { valido: false, errores: ["El evento debe ser un objeto."] };
  }

  const errores = [];

  if (!esTextoNoVacio(evento.eventId)) {
    errores.push("eventId es obligatorio.");
  }
  if (evento.tipo !== EVENTO_BAJA_CONFIRMADA) {
    errores.push(`tipo debe ser ${EVENTO_BAJA_CONFIRMADA}.`);
  }
  if (!esTextoNoVacio(evento.colaboradorId)) {
    errores.push("colaboradorId es obligatorio.");
  }
  if (!esTextoNoVacio(evento.campus)) {
    errores.push("campus es obligatorio.");
  }
  if (!esFechaIso(evento.fechaConfirmacion)) {
    errores.push("fechaConfirmacion debe ser una fecha ISO 8601.");
  }

  if (!evento.baja || typeof evento.baja !== "object" || Array.isArray(evento.baja)) {
    errores.push("baja es obligatorio.");
  } else {
    if (typeof evento.baja.indefinida !== "boolean") {
      errores.push("baja.indefinida debe ser booleano.");
    }
    if (!FECHA_SOLO_DIA.test(String(evento.baja.desde ?? ""))) {
      errores.push("baja.desde debe tener formato YYYY-MM-DD.");
    }
    if (evento.baja.indefinida) {
      if (evento.baja.hasta !== null) {
        errores.push("baja.hasta debe ser null cuando la baja es indefinida.");
      }
    } else if (!FECHA_SOLO_DIA.test(String(evento.baja.hasta ?? ""))) {
      errores.push("baja.hasta debe tener formato YYYY-MM-DD cuando la baja es por periodo.");
    }
  }

  if (!Array.isArray(evento.receptores)) {
    errores.push("receptores debe ser un arreglo.");
  } else {
    for (const [idx, r] of evento.receptores.entries()) {
      if (!r || typeof r !== "object" || Array.isArray(r)) {
        errores.push(`receptores[${idx}] debe ser un objeto.`);
        continue;
      }
      if (!esTextoNoVacio(r.colaboradorId)) {
        errores.push(`receptores[${idx}].colaboradorId es obligatorio.`);
      }
      if (!Number.isInteger(r.aspirantesRecibidos) || r.aspirantesRecibidos < 0) {
        errores.push(`receptores[${idx}].aspirantesRecibidos debe ser un entero >= 0.`);
      }
      if (!Array.isArray(r.carrerasRecibidas)) {
        errores.push(`receptores[${idx}].carrerasRecibidas debe ser un arreglo.`);
      }
    }
  }

  return { valido: errores.length === 0, errores };
}
