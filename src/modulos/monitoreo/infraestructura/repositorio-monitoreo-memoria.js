/**
 * Implementación en memoria del Repositorio de Monitoreo.
 * Utiliza los datos semilla del proyecto y replica la semántica del modelo
 * relacional definido en BASE-5 (esquemas 'aspirantes' y 'usuarios').
 */

export class RepositorioMonitoreoMemoria {
  /**
   * @param {Object} [opciones]
   * @param {Array} [opciones.aspirantes]
   * @param {Array} [opciones.conversaciones]
   * @param {Record<string, string[]>} [opciones.asignacionesCarreras]
   */
  constructor(opciones = {}) {
    this.aspirantes = opciones.aspirantes ? [...opciones.aspirantes] : [];
    this.conversaciones = opciones.conversaciones ? [...opciones.conversaciones] : [];

    // Mapeo de carreras asignadas a colaboradores (usuarios.colaborador_carrera)
    // Soporta tanto ID institucional ("00000252115") como alias de seed ("colab-001")
    this.carrerasPorColaborador = {
      "00000252115": ["Ingeniería en Software", "Licenciatura en Administración"],
      "colab-001": ["Ingeniería en Software", "Licenciatura en Administración"],
      "00000233231": ["Ingeniería Industrial", "Licenciatura en Psicología"],
      "colab-002": ["Ingeniería Industrial", "Licenciatura en Psicología"],
      "00000247933": ["Ingeniería en Software"],
      "colab-003": ["Ingeniería en Software"],
      "00000235352": ["Ingeniería en Software", "Ingeniería Industrial"],
      "00000252390": ["Licenciatura en Administración", "Licenciatura en Psicología"],
      ...(opciones.asignacionesCarreras || {}),
    };

    // Catálogos generales de preparatorias y períodos
    this.catalogoPreparatorias = [
      "CBTIS 37",
      "COBACH Obregón 1",
      "CECyTE Esperanza",
      "CBTIS 188",
      "CONALEP Navojoa",
      "COBACH Guaymas",
    ];

    this.catalogoPeriodos = ["2027-1", "2026-2", "2026-1"];

    this.catalogoEstadosSolicitud = [
      "RECIBIDA",
      "EN_REVISION",
      "ACEPTADA",
      "RECHAZADA",
    ];

    this.catalogoSemaforos = ["Verde", "Amarillo", "Naranja", "Rojo"];
  }

  /**
   * Obtiene las opciones de filtros para un colaborador (HU2-7).
   * @param {string} colaboradorId
   * @returns {Promise<import('../dominio/repositorio-monitoreo.js').OpcionesFiltros>}
   */
  async obtenerFiltrosColaborador(colaboradorId) {
    const idLimpio = String(colaboradorId).trim();

    // 1. Carreras asignadas al colaborador
    let carreras = this.carrerasPorColaborador[idLimpio];

    // Si no tiene asignación explícita, inferir de los aspirantes asignados a su ID
    if (!carreras || carreras.length === 0) {
      carreras = Array.from(
        new Set(
          this.aspirantes
            .filter((a) => a.colaboradorId === idLimpio)
            .map((a) => a.carreraSolicitada)
            .filter(Boolean)
        )
      );
    }

    // 2. Preparatorias únicas presentes en el catálogo y aspirantes
    const prepasEnAspirantes = this.aspirantes.map((a) => a.preparatoriaProcedencia).filter(Boolean);
    const preparatorias = Array.from(new Set([...this.catalogoPreparatorias, ...prepasEnAspirantes])).sort();

    // 3. Períodos únicos
    const periodosEnAspirantes = this.aspirantes.map((a) => a.periodo).filter(Boolean);
    const periodos = Array.from(new Set([...this.catalogoPeriodos, ...periodosEnAspirantes])).sort().reverse();

    return {
      carreras: [...carreras].sort(),
      preparatorias,
      periodos,
      estadosSolicitud: [...this.catalogoEstadosSolicitud],
      semaforos: [...this.catalogoSemaforos],
    };
  }

  /**
   * Lista aspirantes con filtros combinables (HU2-4).
   * Se completará en el siguiente paso.
   */
  async listarAspirantes() {
    return { aspirantes: [], total: 0 };
  }

  /**
   * Obtiene un aspirante por su ID (HU3-5).
   */
  async obtenerAspirantePorId(id) {
    const idLimpio = String(id).trim();
    return this.aspirantes.find((a) => a.id === idLimpio || a.folioSolicitud === idLimpio) || null;
  }

  /**
   * Obtiene los mensajes de conversación de un aspirante (HU3-5).
   */
  async obtenerConversacionAspirante(aspiranteId) {
    const idLimpio = String(aspiranteId).trim();
    return this.conversaciones
      .filter((m) => m.aspiranteId === idLimpio)
      .sort((a, b) => new Date(a.fechaEnvio).getTime() - new Date(b.fechaEnvio).getTime());
  }
}

