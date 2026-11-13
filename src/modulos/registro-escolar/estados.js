/**
 * Catálogo PROVISIONAL de estados de la solicitud.
 *
 * El catálogo definitivo se define con el PO en HU2-2. Mientras tanto, el resto
 * del código debe importar estos valores en lugar de escribir cadenas sueltas,
 * así el cambio posterior se hace en un solo lugar.
 *
 * Flujo típico (provisional):
 *   RECIBIDA → EN_REVISION → ACEPTADA
 *                          → CONSTANCIA_RECHAZADA → EN_REVISION (la corrige y la vuelve a entregar)
 *                          → RECHAZADA (definitivo)
 *
 * Término oficial: «estado de la solicitud» (no "estatus de registro escolar").
 */
export const ESTADOS_SOLICITUD = Object.freeze({
  /** La solicitud existe, pero el aspirante aún no entrega su constancia de calificaciones. */
  RECIBIDA: "RECIBIDA",
  /** El aspirante entregó la constancia y Registro Escolar la está revisando. */
  EN_REVISION: "EN_REVISION",
  /** Registro Escolar rechazó la constancia (por ejemplo, falta una hoja). El aspirante puede corregirla. */
  CONSTANCIA_RECHAZADA: "CONSTANCIA_RECHAZADA",
  /** Solicitud aceptada. Estado final. */
  ACEPTADA: "ACEPTADA",
  /** Solicitud rechazada de forma definitiva. Estado final. */
  RECHAZADA: "RECHAZADA",
});

/** Estados en los que el proceso ya terminó (el interruptor «aceptados o rechazados» de HU 2 los oculta). */
export const ESTADOS_FINALES = Object.freeze([
  ESTADOS_SOLICITUD.ACEPTADA,
  ESTADOS_SOLICITUD.RECHAZADA,
]);

/** Estados que pueden traer motivo de rechazo. */
export const ESTADOS_CON_MOTIVO = Object.freeze([
  ESTADOS_SOLICITUD.CONSTANCIA_RECHAZADA,
  ESTADOS_SOLICITUD.RECHAZADA,
]);

/** @param {unknown} valor */
export function esEstadoValido(valor) {
  return Object.values(ESTADOS_SOLICITUD).includes(/** @type {any} */ (valor));
}

/** @param {unknown} valor */
export function esEstadoFinal(valor) {
  return ESTADOS_FINALES.includes(/** @type {any} */ (valor));
}
