/**
 * Contrato del módulo de integración Registro Escolar (EQ-13 · BASE-8).
 *
 * Quien necesite el estado de la solicitud de un aspirante depende de esta
 * interfaz, nunca de una implementación concreta. En el Sprint 1 la única
 * implementación es el adaptador simulado (datos semilla); después se agrega
 * la que consume la API REST de Registro Escolar con la misma forma.
 *
 * Documentación completa: docs/contratos/registro-escolar.md
 */

/**
 * @typedef {Object} EstadoSolicitud
 * @property {string} aspiranteId
 * @property {string} estado              Uno de ESTADOS_SOLICITUD.
 * @property {string} fechaActualizacion  ISO 8601 (UTC).
 */

/**
 * @typedef {Object} CambioEstado
 * @property {string} aspiranteId
 * @property {string|null} estadoAnterior  null si es el primer estado conocido.
 * @property {string} estadoNuevo
 * @property {string} fechaCambio          ISO 8601 (UTC).
 * @property {string|null} motivoRechazo   Solo cuando estadoNuevo es RECHAZADA.
 */

/**
 * @typedef {Object} RegistroEscolar
 * @property {(aspiranteId: string) => Promise<EstadoSolicitud|null>} obtenerEstadoSolicitud
 *   Resuelve null si Registro Escolar no tiene la solicitud.
 * @property {(desde: string) => Promise<CambioEstado[]>} obtenerCambiosDesde
 *   Cambios con fechaCambio >= desde, en orden ascendente. Sirve para
 *   sincronizar o recuperar eventos perdidos.
 */

export const METODOS_REGISTRO_ESCOLAR = Object.freeze([
  "obtenerEstadoSolicitud",
  "obtenerCambiosDesde",
]);

/** Error de la integración (no de quien la usa). */
export class ErrorRegistroEscolar extends Error {
  /**
   * @param {"NO_DISPONIBLE" | "RESPUESTA_INVALIDA"} codigo
   * @param {string} mensaje
   */
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorRegistroEscolar";
    this.codigo = codigo;
  }
}

/**
 * ¿El objeto cumple la interfaz? Útil en pruebas y al armar los módulos.
 * @param {any} candidato
 */
export function implementaRegistroEscolar(candidato) {
  return METODOS_REGISTRO_ESCOLAR.every(
    (metodo) => typeof candidato?.[metodo] === "function",
  );
}
