/**
 * Caso de Uso: Listar Aspirantes del Colaborador con Filtros Combinables (HU2-4)
 *
 * Aplica Clean Architecture: contiene la lógica de aplicación para validar
 * las reglas de consulta, paginación, ordenamiento y filtros del colaborador.
 */

export class ListarAspirantesCasoUso {
  /**
   * @param {Object} dependencias
   * @param {import('../dominio/repositorio-monitoreo.js')} dependencias.repositorioMonitoreo
   */
  constructor({ repositorioMonitoreo }) {
    if (!repositorioMonitoreo) {
      throw new Error("Se requiere repositorioMonitoreo para inicializar ListarAspirantesCasoUso.");
    }
    this.repositorio = repositorioMonitoreo;
  }

  /**
   * Ejecuta la consulta de aspirantes para el colaborador autenticado.
   *
   * @param {Object} params
   * @param {string} params.colaboradorId - ID institucional o de usuario del colaborador autenticado (obligatorio).
   * @param {string} [params.nombre] - Búsqueda parcial de texto por nombre.
   * @param {string} [params.semaforo] - Filtro de semáforo ('VERDE', 'NARANJA', 'ROJO').
   * @param {string} [params.carrera] - Filtro por carrera solicitada.
   * @param {string} [params.preparatoria] - Filtro por preparatoria de procedencia.
   * @param {string} [params.periodo] - Filtro por período de admisión.
   * @param {string} [params.estadoSolicitud] - Filtro por estado de la solicitud.
   * @param {boolean|string} [params.mostrarAceptados] - Interruptor para incluir o excluir aceptados.
   * @param {number|string} [params.limit] - Cantidad de registros por página.
   * @param {number|string} [params.offset] - Desplazamiento de registros.
   * @param {string} [params.ordenarPor] - Columna por la cual ordenar.
   * @param {"ASC"|"DESC"|"asc"|"desc"} [params.ordenDireccion] - Sentido del ordenamiento.
   * @returns {Promise<{ aspirantes: Array, total: number, limit: number, offset: number }>}
   */
  async ejecutar(params = {}) {
    const colaboradorId = params.colaboradorId ? String(params.colaboradorId).trim() : "";

    if (!colaboradorId) {
      const error = new Error("El ID del colaborador autenticado es obligatorio para consultar aspirantes.");
      error.status = 401;
      error.codigo = "NO_AUTORIZADO";
      throw error;
    }

    // Paginación
    const limitNum = parseInt(params.limit, 10);
    const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(limitNum, 100) : 20;

    const offsetNum = parseInt(params.offset, 10);
    const offset = Number.isFinite(offsetNum) && offsetNum >= 0 ? offsetNum : 0;

    // Interruptor mostrar_aceptados (por defecto true, false sólo si explícitamente se pide ocultar)
    let mostrarAceptados = true;
    if (params.mostrarAceptados === false || params.mostrarAceptados === "false" || params.mostrarAceptados === "0") {
      mostrarAceptados = false;
    }

    // Ordenamiento
    const ordenarPor = params.ordenarPor ? String(params.ordenarPor).trim() : "fechaSolicitud";
    const direccionUpper = params.ordenDireccion ? String(params.ordenDireccion).trim().toUpperCase() : "DESC";
    const ordenDireccion = direccionUpper === "ASC" ? "ASC" : "DESC";

    const filtros = {
      colaboradorId,
      nombre: params.nombre ? String(params.nombre).trim() : undefined,
      semaforo: params.semaforo ? String(params.semaforo).trim() : undefined,
      carrera: params.carrera ? String(params.carrera).trim() : undefined,
      preparatoria: params.preparatoria ? String(params.preparatoria).trim() : undefined,
      periodo: params.periodo ? String(params.periodo).trim() : undefined,
      estadoSolicitud: params.estadoSolicitud ? String(params.estadoSolicitud).trim() : undefined,
      mostrarAceptados,
      limit,
      offset,
      ordenarPor,
      ordenDireccion,
    };

    const resultado = await this.repositorio.listarAspirantes(filtros);

    return {
      aspirantes: resultado.aspirantes || [],
      total: resultado.total ?? (resultado.aspirantes ? resultado.aspirantes.length : 0),
      limit,
      offset,
    };
  }
}

