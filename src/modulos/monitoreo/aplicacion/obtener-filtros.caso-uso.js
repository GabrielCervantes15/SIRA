/**
 * Caso de Uso: Obtener Opciones de Filtros para el Colaborador (HU2-7)
 */

export class ObtenerFiltrosCasoUso {
  /**
   * @param {Object} dependencias
   * @param {import('../dominio/repositorio-monitoreo.js')} dependencias.repositorioMonitoreo
   */
  constructor({ repositorioMonitoreo }) {
    if (!repositorioMonitoreo) {
      throw new Error("Se requiere repositorioMonitoreo para inicializar ObtenerFiltrosCasoUso.");
    }
    this.repositorio = repositorioMonitoreo;
  }

  /**
   * @param {string} colaboradorId - ID institucional o de usuario del colaborador autenticado.
   * @returns {Promise<import('../dominio/repositorio-monitoreo.js').OpcionesFiltros>}
   */
  async ejecutar(colaboradorId) {
    if (!colaboradorId || typeof colaboradorId !== "string") {
      const error = new Error("El ID del colaborador autenticado es requerido.");
      error.status = 401;
      error.codigo = "NO_AUTORIZADO";
      throw error;
    }

    const opciones = await this.repositorio.obtenerFiltrosColaborador(colaboradorId.trim());

    return {
      carreras: opciones.carreras || [],
      preparatorias: opciones.preparatorias || [],
      periodos: opciones.periodos || [],
      estadosSolicitud: opciones.estadosSolicitud || [],
      semaforos: opciones.semaforos || ["Verde", "Amarillo", "Naranja", "Rojo"],
    };
  }
}

