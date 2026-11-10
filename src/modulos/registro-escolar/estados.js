/**
 * Catálogo PROVISIONAL de estados de la solicitud.
 *
 * El catálogo definitivo se define con el PO en HU2-2. Mientras tanto, el resto
 * del código debe importar estos valores en lugar de escribir cadenas sueltas,
 * así el cambio posterior se hace en un solo lugar.
 *
 * Término oficial: «estado de la solicitud» (no "estatus de registro escolar").
 */
export const ESTADOS_SOLICITUD = Object.freeze({
  RECIBIDA: "RECIBIDA",
  EN_REVISION: "EN_REVISION",
  ACEPTADA: "ACEPTADA",
  RECHAZADA: "RECHAZADA",
});

/** @param {unknown} valor */
export function esEstadoValido(valor) {
  return Object.values(ESTADOS_SOLICITUD).includes(/** @type {any} */ (valor));
}
