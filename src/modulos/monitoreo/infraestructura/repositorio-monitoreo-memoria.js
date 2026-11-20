/**
 * Implementación en memoria del Repositorio de Monitoreo.
 * Utiliza los datos semilla del proyecto y replica la semántica del modelo
 * relacional definido en BASE-5 (esquemas 'aspirantes' y 'usuarios').
 *
 * Esta implementación está lista para ser reemplazada o complementada por un
 * adaptador Postgres (ej. RepositorioMonitoreoPostgres) cuando la base de datos
 * esté disponible, respetando exactamente el mismo contrato (IRepositorioMonitoreo).
 */

/**
 * Normaliza una cadena removiendo acentos y convirtiendo a minúsculas,
 * emulando la función PostgreSQL aspirantes.norm(texto) / unaccent.
 * @param {string} texto
 * @returns {string}
 */
export function normalizarTexto(texto) {
  if (!texto) return "";
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Mapa de campos permitidos para ordenamiento y su correspondencia en la entidad.
 */
const MAPA_CAMPOS_ORDEN = Object.freeze({
  nombre: "nombreCompleto",
  nombre_completo: "nombreCompleto",
  nombrecompleto: "nombreCompleto",
  semaforo: "semaforo",
  carrera: "carreraSolicitada",
  carrera_solicitada: "carreraSolicitada",
  preparatoria: "preparatoriaProcedencia",
  preparatoria_procedencia: "preparatoriaProcedencia",
  periodo: "periodo",
  estado_solicitud: "estadoSolicitud",
  estadosolicitud: "estadoSolicitud",
  fecha_solicitud: "fechaSolicitud",
  fechasolicitud: "fechaSolicitud",
  ultima_actividad: "fechaUltimaActividad",
  fecha_ultima_actividad: "fechaUltimaActividad",
  fechaultimaactividad: "fechaUltimaActividad",
});

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

    // Mapeo bidireccional de colaboradores (ID institucional <-> alias de semilla)
    this.aliasColaborador = {
      "00000252115": ["00000252115", "colab-001"],
      "colab-001": ["00000252115", "colab-001"],
      "00000233231": ["00000233231", "colab-002"],
      "colab-002": ["00000233231", "colab-002"],
      "00000247933": ["00000247933", "colab-003"],
      "colab-003": ["00000247933", "colab-003"],
      "00000235352": ["00000235352", "colab-004"],
      "colab-004": ["00000235352", "colab-004"],
      "00000252390": ["00000252390", "colab-005"],
      "colab-005": ["00000252390", "colab-005"],
      ...(opciones.aliasColaborador || {}),
    };

    // Mapeo de carreras asignadas a colaboradores (usuarios.colaborador_carrera)
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

    this.catalogoSemaforos = ["Verde", "Naranja", "Rojo"];
  }

  /**
   * Obtiene los identificadores válidos para un colaborador (ID institucional y alias)
   * @private
   */
  _obtenerIdsColaborador(colaboradorId) {
    const idLimpio = String(colaboradorId).trim();
    const alias = this.aliasColaborador[idLimpio];
    if (alias && Array.isArray(alias)) {
      return new Set(alias);
    }
    return new Set([idLimpio]);
  }

  /**
   * Obtiene las opciones de filtros para un colaborador (HU2-7).
   * @param {string} colaboradorId
   * @returns {Promise<import('../dominio/repositorio-monitoreo.js').OpcionesFiltros>}
   */
  async obtenerFiltrosColaborador(colaboradorId) {
    const idLimpio = String(colaboradorId).trim();
    const idsValidos = this._obtenerIdsColaborador(idLimpio);

    // 1. Carreras asignadas al colaborador
    let carreras = this.carrerasPorColaborador[idLimpio];

    // Si no tiene asignación explícita, inferir de los aspirantes asignados a su ID
    if (!carreras || carreras.length === 0) {
      carreras = Array.from(
        new Set(
          this.aspirantes
            .filter((a) => idsValidos.has(a.colaboradorId))
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
   * Lista los aspirantes asignados al colaborador autenticado con filtros combinables (HU2-4).
   *
   * @param {import('../dominio/repositorio-monitoreo.js').FiltrosConsultaAspirantes} filtros
   * @returns {Promise<{ aspirantes: Array, total: number }>}
   */
  async listarAspirantes(filtros) {
    const {
      colaboradorId,
      nombre,
      semaforo,
      carrera,
      preparatoria,
      periodo,
      estadoSolicitud,
      mostrarAceptados = true,
      limit = 20,
      offset = 0,
      ordenarPor = "fechaSolicitud",
      ordenDireccion = "DESC",
    } = filtros;

    const idsValidos = this._obtenerIdsColaborador(colaboradorId);

    // 1. Filtrado obligatorio por cartera del colaborador autenticado
    let resultados = this.aspirantes.filter((a) => idsValidos.has(a.colaboradorId));

    // 2. Filtro: mostrar_aceptados (si es false, oculta los que tienen estado ACEPTADA o semáforo verde)
    if (mostrarAceptados === false) {
      resultados = resultados.filter((a) => {
        const estadoNorm = normalizarTexto(a.estadoSolicitud);
        return estadoNorm !== "aceptada" && estadoNorm !== "aceptado";
      });
    }

    // 3. Filtro opcional: búsqueda de nombre parcial, insensible a mayúsculas y acentos
    if (nombre) {
      const termino = normalizarTexto(nombre);
      resultados = resultados.filter((a) => {
        const nombreNorm = normalizarTexto(a.nombreCompleto);
        const folioNorm = normalizarTexto(a.folioSolicitud);
        return nombreNorm.includes(termino) || folioNorm.includes(termino);
      });
    }

    // 4. Filtro opcional: semáforo (VERDE, NARANJA, ROJO)
    if (semaforo) {
      const semNorm = normalizarTexto(semaforo);
      resultados = resultados.filter((a) => normalizarTexto(a.semaforo) === semNorm);
    }

    // 5. Filtro opcional: carrera solicitada
    if (carrera) {
      const carreraNorm = normalizarTexto(carrera);
      resultados = resultados.filter((a) => {
        const aspiranteCarrera = normalizarTexto(a.carreraSolicitada);
        return aspiranteCarrera === carreraNorm || aspiranteCarrera.includes(carreraNorm);
      });
    }

    // 6. Filtro opcional: preparatoria de procedencia
    if (preparatoria) {
      const prepaNorm = normalizarTexto(preparatoria);
      resultados = resultados.filter((a) => {
        const aspirantePrepa = normalizarTexto(a.preparatoriaProcedencia);
        return aspirantePrepa === prepaNorm || aspirantePrepa.includes(prepaNorm);
      });
    }

    // 7. Filtro opcional: período de admisión
    if (periodo) {
      const periodoNorm = normalizarTexto(periodo);
      resultados = resultados.filter((a) => normalizarTexto(a.periodo) === periodoNorm);
    }

    // 8. Filtro opcional: estado de la solicitud
    if (estadoSolicitud) {
      const estadoNorm = normalizarTexto(estadoSolicitud);
      resultados = resultados.filter((a) => {
        const aspiranteEstado = normalizarTexto(a.estadoSolicitud);
        return aspiranteEstado === estadoNorm || aspiranteEstado.replace(/_/g, "") === estadoNorm.replace(/_/g, "");
      });
    }

    // Conteo total antes de paginar
    const total = resultados.length;

    // 9. Ordenamiento
    const campoDestino = MAPA_CAMPOS_ORDEN[ordenarPor.toLowerCase()] || "fechaSolicitud";
    const factorOrden = ordenDireccion === "ASC" ? 1 : -1;

    resultados.sort((a, b) => {
      const valA = a[campoDestino];
      const valB = b[campoDestino];

      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      // Comparación de fechas si es formato ISO/Date
      if (campoDestino.toLowerCase().includes("fecha") || campoDestino.toLowerCase().includes("actividad")) {
        const tA = new Date(valA).getTime();
        const tB = new Date(valB).getTime();
        return (tA - tB) * factorOrden;
      }

      // Comparación textual
      const strA = normalizarTexto(valA);
      const strB = normalizarTexto(valB);
      return strA.localeCompare(strB, "es") * factorOrden;
    });

    // 10. Paginación (limit y offset)
    const paginados = resultados.slice(offset, offset + limit);

    return {
      aspirantes: paginados,
      total,
    };
  }

  /**
   * Obtiene un aspirante por su ID o folio (HU3-5).
   */
  async obtenerAspirantePorId(id) {
    const idLimpio = String(id).trim();
    return this.aspirantes.find((a) => a.id === idLimpio || a.folioSolicitud === idLimpio) || null;
  }

  /**
   * Obtiene los mensajes de conversación de un aspirante ordenados cronológicamente (HU3-5).
   */
  async obtenerConversacionAspirante(aspiranteId) {
    const idLimpio = String(aspiranteId).trim();
    return this.conversaciones
      .filter((m) => m.aspiranteId === idLimpio)
      .sort((a, b) => new Date(a.fechaEnvio).getTime() - new Date(b.fechaEnvio).getTime());
  }
}
