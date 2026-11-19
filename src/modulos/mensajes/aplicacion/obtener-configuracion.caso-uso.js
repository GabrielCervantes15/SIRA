/**
 * Caso de Uso: Obtener Configuración de Mensajes Automáticos (Administrativo)
 * Tarea: EQ-106 · HU9-5 (Sprint 2)
 */
import { clonarConfiguracion } from "../dominio/repositorio-configuracion.js";

export class ObtenerConfiguracionCasoUso {
  /**
   * @param {Object} dependencias
   * @param {import('../dominio/repositorio-configuracion.js')} dependencias.repositorioConfiguracion
   */
  constructor({ repositorioConfiguracion }) {
    if (!repositorioConfiguracion) {
      throw new Error(
        "Se requiere repositorioConfiguracion para inicializar ObtenerConfiguracionCasoUso."
      );
    }
    this.repositorio = repositorioConfiguracion;
  }

  /**
   * Ejecuta la consulta administrativa de la configuración vigente.
   * Restringida exclusivamente al rol 'administrador'.
   *
   * @param {{ usuario?: { idInstitucional?: string, rol?: string }|null }} [contexto]
   * @returns {Promise<Object>}
   */
  async ejecutar(contexto = {}) {
    const usuario = contexto?.usuario || null;

    if (!usuario || !usuario.idInstitucional) {
      const error = new Error(
        "Debes iniciar sesión para acceder a la configuración de mensajes."
      );
      error.status = 401;
      error.codigo = "SESION_NO_VALIDA";
      throw error;
    }

    if (usuario.rol !== "administrador") {
      const error = new Error(
        "No tienes permisos para acceder a la configuración de mensajes automáticos."
      );
      error.status = 403;
      error.codigo = "SIN_PERMISO";
      throw error;
    }

    const configuracion = await this.repositorio.obtenerConfiguracion();
    return clonarConfiguracion(configuracion);
  }
}
