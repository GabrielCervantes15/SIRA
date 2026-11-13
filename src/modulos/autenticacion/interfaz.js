/**
 * Contrato del módulo de integración de Autenticación (EQ-12 · BASE-7).
 *
 * Arquitectura Hexagonal / Puertos y Adaptadores:
 * Cualquier módulo que requiera validar identidad o consultar los datos personales
 * de un colaborador institucional depende de este puerto, nunca del Active Directory real.
 *
 * En Sprint 1 se utiliza el adaptador simulado en memoria. En producción se sustituirá
 * por el adaptador real con soporte Kerberos / LDAP / SSO institucional ITSON.
 *
 * Documentación completa: docs/contratos/autenticacion.md
 */

/**
 * @typedef {Object} PerfilColaborador
 * @property {string} idInstitucional      ID numérico institucional del ITSON (ej. "00000252115").
 * @property {string} nombreCompleto       Nombre y apellidos del colaborador.
 * @property {string} correoInstitucional  Correo electrónico institucional (@itson.edu.mx / @potros.itson.edu.mx).
 * @property {string} telefono             Teléfono de contacto con código de área (ej. "+526441234567").
 * @property {string} fotoUrl              URL o Data URI de la fotografía de perfil institucional.
 */

/**
 * @typedef {Object} ResultadoAutenticacion
 * @property {boolean} autenticado                 Indica si la autenticación fue exitosa.
 * @property {PerfilColaborador|null} colaborador  Perfil del colaborador si tuvo éxito, o null si falló.
 * @property {string|null} [motivoFalla]           Motivo de rechazo: "USUARIO_INEXISTENTE" | "CREDENCIALES_INVALIDAS" | "CUENTA_BLOQUEADA".
 */

/**
 * @typedef {Object} IProveedorAutenticacion
 * @property {(idInstitucional: string, password?: string) => Promise<ResultadoAutenticacion>} autenticar
 *   Valida credenciales contra el directorio. Devuelve ResultadoAutenticacion.
 * @property {(idInstitucional: string) => Promise<PerfilColaborador|null>} obtenerPorIdInstitucional
 *   Consulta los datos institucionales por ID. Devuelve null si no existe.
 */

export const METODOS_PROVEEDOR_AUTENTICACION = Object.freeze([
  "autenticar",
  "obtenerPorIdInstitucional",
]);

/**
 * Errores de infraestructura del proveedor de autenticación.
 */
export class ErrorAutenticacion extends Error {
  /**
   * @param {"SERVICIO_NO_DISPONIBLE" | "RESPUESTA_INVALIDA" | "ERROR_INTERNO"} codigo
   * @param {string} mensaje
   * @param {unknown} [causa]
   */
  constructor(codigo, mensaje, causa = null) {
    super(mensaje);
    this.name = "ErrorAutenticacion";
    this.codigo = codigo;
    this.causa = causa;
  }
}

/**
 * Verifica si un objeto cumple con el contrato IProveedorAutenticacion.
 * @param {unknown} objeto
 * @returns {boolean}
 */
export function implementaProveedorAutenticacion(objeto) {
  if (!objeto || typeof objeto !== "object") return false;
  return METODOS_PROVEEDOR_AUTENTICACION.every(
    (metodo) => typeof /** @type {any} */ (objeto)[metodo] === "function"
  );
}

