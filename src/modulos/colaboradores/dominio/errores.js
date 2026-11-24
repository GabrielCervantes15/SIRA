/**
 * Error de negocio del módulo Colaboradores (HU 6).
 * Lleva el estado HTTP y el código que el controlador devuelve tal cual.
 */
export class ErrorColaboradores extends Error {
  /**
   * @param {number} status
   * @param {string} codigo
   * @param {string} mensaje
   */
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorColaboradores";
    this.status = status;
    this.codigo = codigo;
  }
}
