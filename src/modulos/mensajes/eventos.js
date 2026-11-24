/**
 * Evento de dominio: Configuración de mensajes automáticos actualizada (EQ-108 · HU9-7).
 *
 * Sigue la convención oficial de eventos del repositorio (`src/modulos/registro-escolar/eventos.js`).
 */
import { randomUUID } from "node:crypto";
import { clonarConfiguracion } from "./dominio/repositorio-configuracion.js";
import { validarConfiguracionMensajes } from "./dominio/validador-configuracion.js";

export const EXCHANGE_EVENTOS = "crm.eventos";
export const TIPO_CONFIGURACION_ACTUALIZADA = "mensajes.configuracion.actualizada";
export const VERSION_EVENTO = 1;

const FECHA_ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Verifica si un valor es una cadena de fecha ISO 8601 válida.
 * @param {unknown} valor
 * @returns {boolean}
 */
function esFechaIso(valor) {
  return (
    typeof valor === "string" &&
    FECHA_ISO.test(valor) &&
    !Number.isNaN(Date.parse(valor))
  );
}

/**
 * Construye el evento estándar `mensajes.configuracion.actualizada` después de un guardado exitoso.
 *
 * @param {Object} cambio
 * @param {string|null} [cambio.bitacoraId]
 * @param {string} cambio.usuarioId
 * @param {string} cambio.fechaCambio
 * @param {Object} cambio.valorAnterior
 * @param {Object} cambio.valorNuevo
 * @param {{ ahora?: () => Date, generarId?: () => string }} [opciones]
 */
export function crearEventoConfiguracionActualizada(
  cambio,
  { ahora = () => new Date(), generarId = randomUUID } = {}
) {
  const instante = ahora();
  const publicadoEn =
    instante instanceof Date
      ? instante.toISOString()
      : new Date(instante).toISOString();

  return {
    eventId: generarId(),
    tipo: TIPO_CONFIGURACION_ACTUALIZADA,
    version: VERSION_EVENTO,
    publicadoEn,
    datos: {
      bitacoraId: cambio.bitacoraId ?? null,
      usuarioId: cambio.usuarioId,
      fechaCambio: cambio.fechaCambio,
      valorAnterior: clonarConfiguracion(cambio.valorAnterior),
      valorNuevo: clonarConfiguracion(cambio.valorNuevo),
    },
  };
}

/**
 * Valida la estructura y el contenido de un evento `mensajes.configuracion.actualizada`.
 * Los módulos consumidores deben invocarla antes de refrescar su copia en memoria.
 *
 * @param {unknown} evento
 * @returns {{ valido: boolean, errores: string[] }}
 */
export function validarEventoConfiguracionActualizada(evento) {
  if (evento === null || typeof evento !== "object" || Array.isArray(evento)) {
    return { valido: false, errores: ["El evento debe ser un objeto."] };
  }

  const errores = [];

  if (typeof evento.eventId !== "string" || evento.eventId.trim() === "") {
    errores.push("eventId es obligatorio.");
  }
  if (evento.tipo !== TIPO_CONFIGURACION_ACTUALIZADA) {
    errores.push(`tipo debe ser ${TIPO_CONFIGURACION_ACTUALIZADA}.`);
  }
  if (evento.version !== VERSION_EVENTO) {
    errores.push(`version no soportada: ${evento.version}.`);
  }
  if (!esFechaIso(evento.publicadoEn)) {
    errores.push("publicadoEn debe ser una fecha ISO 8601.");
  }

  const d = evento.datos;
  if (d === null || typeof d !== "object" || Array.isArray(d)) {
    errores.push("datos es obligatorio.");
  } else {
    if (d.bitacoraId !== null && d.bitacoraId !== undefined) {
      if (typeof d.bitacoraId !== "string" || d.bitacoraId.trim() === "") {
        errores.push("datos.bitacoraId debe ser un identificador no vacío o null.");
      }
    }
    if (typeof d.usuarioId !== "string" || d.usuarioId.trim() === "") {
      errores.push("datos.usuarioId es obligatorio.");
    }
    if (!esFechaIso(d.fechaCambio)) {
      errores.push("datos.fechaCambio debe ser una fecha ISO 8601.");
    }
    if (
      d.valorAnterior === null ||
      typeof d.valorAnterior !== "object" ||
      Array.isArray(d.valorAnterior)
    ) {
      errores.push("datos.valorAnterior debe ser un objeto con la configuración previa.");
    }
    if (
      d.valorNuevo === null ||
      typeof d.valorNuevo !== "object" ||
      Array.isArray(d.valorNuevo)
    ) {
      errores.push("datos.valorNuevo debe ser un objeto con la nueva configuración.");
    } else {
      const validacionNueva = validarConfiguracionMensajes(d.valorNuevo);
      if (!validacionNueva.valido) {
        errores.push(
          `datos.valorNuevo no es una configuración válida: ${Object.values(
            validacionNueva.errores
          ).join(" ")}`
        );
      }
    }
  }

  return { valido: errores.length === 0, errores };
}
