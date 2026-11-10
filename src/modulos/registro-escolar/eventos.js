/**
 * Evento de cambio de estado de la solicitud (EQ-13 · BASE-8).
 *
 * Los nombres de exchange y routing key siguen la propuesta de este contrato;
 * BASE-3 define la convención oficial de eventos y, si cambia, se ajusta aquí.
 */
import { randomUUID } from "node:crypto";
import { ESTADOS_SOLICITUD, esEstadoValido } from "./estados.js";

export const EXCHANGE_EVENTOS = "crm.eventos";
export const TIPO_ESTADO_CAMBIADO = "registro_escolar.solicitud.estado_cambiado";
export const VERSION_EVENTO = 1;

const FECHA_ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** @param {unknown} valor */
function esFechaIso(valor) {
  return (
    typeof valor === "string" &&
    FECHA_ISO.test(valor) &&
    !Number.isNaN(Date.parse(valor))
  );
}

/**
 * Arma el evento a partir de un cambio de estado.
 * @param {import("./interfaz.js").CambioEstado} cambio
 * @param {{ ahora?: () => Date, generarId?: () => string }} [opciones]
 */
export function crearEventoEstadoCambiado(
  cambio,
  { ahora = () => new Date(), generarId = randomUUID } = {},
) {
  return {
    eventId: generarId(),
    tipo: TIPO_ESTADO_CAMBIADO,
    version: VERSION_EVENTO,
    publicadoEn: ahora().toISOString(),
    datos: {
      aspiranteId: cambio.aspiranteId,
      estadoAnterior: cambio.estadoAnterior ?? null,
      estadoNuevo: cambio.estadoNuevo,
      fechaCambio: cambio.fechaCambio,
      motivoRechazo: cambio.motivoRechazo ?? null,
    },
  };
}

/**
 * Valida la forma y las reglas del evento. Los consumidores deben llamarla
 * antes de procesar un evento recibido del bus.
 * @param {any} evento
 * @returns {{ valido: boolean, errores: string[] }}
 */
export function validarEventoEstadoCambiado(evento) {
  if (evento === null || typeof evento !== "object") {
    return { valido: false, errores: ["El evento debe ser un objeto."] };
  }

  const errores = [];

  if (typeof evento.eventId !== "string" || evento.eventId === "") {
    errores.push("eventId es obligatorio.");
  }
  if (evento.tipo !== TIPO_ESTADO_CAMBIADO) {
    errores.push(`tipo debe ser ${TIPO_ESTADO_CAMBIADO}.`);
  }
  if (evento.version !== VERSION_EVENTO) {
    errores.push(`version no soportada: ${evento.version}.`);
  }
  if (!esFechaIso(evento.publicadoEn)) {
    errores.push("publicadoEn debe ser una fecha ISO 8601.");
  }

  const d = evento.datos;
  if (d === null || typeof d !== "object") {
    errores.push("datos es obligatorio.");
  } else {
    if (typeof d.aspiranteId !== "string" || d.aspiranteId === "") {
      errores.push("datos.aspiranteId es obligatorio.");
    }
    if (d.estadoAnterior !== null && !esEstadoValido(d.estadoAnterior)) {
      errores.push("datos.estadoAnterior debe ser null o un estado válido.");
    }
    if (!esEstadoValido(d.estadoNuevo)) {
      errores.push("datos.estadoNuevo debe ser un estado válido.");
    }
    if (!esFechaIso(d.fechaCambio)) {
      errores.push("datos.fechaCambio debe ser una fecha ISO 8601.");
    }
    if (d.motivoRechazo !== null && d.motivoRechazo !== undefined) {
      if (typeof d.motivoRechazo !== "string" || d.motivoRechazo.trim() === "") {
        errores.push("datos.motivoRechazo debe ser texto no vacío o null.");
      }
      if (d.estadoNuevo !== ESTADOS_SOLICITUD.RECHAZADA) {
        errores.push(
          "datos.motivoRechazo solo se permite cuando estadoNuevo es RECHAZADA.",
        );
      }
    }
  }

  return { valido: errores.length === 0, errores };
}
