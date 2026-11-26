/**
 * Implementación en memoria del Repositorio de Monitoreo.
 * Utiliza los datos semilla del proyecto y replica la semántica del modelo
 * relacional definido en BASE-5 (esquemas 'aspirantes' y 'usuarios').
 *
 * Esta implementación está lista para ser reemplazada o complementada por un
 * adaptador Postgres (ej. RepositorioMonitoreoPostgres) cuando la base de datos
 * esté disponible, respetando exactamente el mismo contrato (IRepositorioMonitoreo).
 */

import { SEVERIDAD } from "../semaforo.js";

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
   * @param {Array} [opciones.historial] - Eventos de aspirantes.historial_eventos (EQ-43).
   * @param {Record<string, string[]>} [opciones.asignacionesCarreras]
   */
  constructor(opciones = {}) {
    this.aspirantes = opciones.aspirantes ? [...opciones.aspirantes] : [];
    this.conversaciones = opciones.conversaciones ? [...opciones.conversaciones] : [];
    this.historial = opciones.historial ? [...opciones.historial] : [];

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

      if (valA == null && valB == null) return String(a.id).localeCompare(String(b.id));
      if (valA == null) return 1;
      if (valB == null) return -1;

      // EQ-48: el semáforo se ordena por severidad (ROJO > NARANJA > AMARILLO > VERDE),
      // no alfabéticamente; así DESC muestra primero a quien más atención necesita.
      if (campoDestino === "semaforo") {
        const sA = SEVERIDAD[String(valA).toUpperCase()] ?? 0;
        const sB = SEVERIDAD[String(valB).toUpperCase()] ?? 0;
        return (sA - sB) * factorOrden || String(a.id).localeCompare(String(b.id));
      }

      // Comparación de fechas si es formato ISO/Date
      if (campoDestino.toLowerCase().includes("fecha") || campoDestino.toLowerCase().includes("actividad")) {
        const tA = new Date(valA).getTime();
        const tB = new Date(valB).getTime();
        return (tA - tB) * factorOrden || String(a.id).localeCompare(String(b.id));
      }

      // Comparación textual (sin acentos ni mayúsculas); empates por id para paginar estable.
      const strA = normalizarTexto(valA);
      const strB = normalizarTexto(valB);
      return strA.localeCompare(strB, "es") * factorOrden || String(a.id).localeCompare(String(b.id));
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

  /**
   * Obtiene los eventos del historial de un aspirante, del más reciente al más antiguo (HU3-6 / EQ-43).
   * @param {string} aspiranteId
   * @param {import('../dominio/repositorio-monitoreo.js').RangoHistorial} [rango]
   * @returns {Promise<import('../dominio/repositorio-monitoreo.js').EventoHistorial[]>}
   */
  async obtenerHistorialAspirante(aspiranteId, { desde = null, hasta = null } = {}) {
    const idLimpio = String(aspiranteId).trim();
    const desdeMs = desde ? Date.parse(desde) : null;
    const hastaMs = hasta ? Date.parse(hasta) : null;
    return this.historial
      .filter((h) => h.aspiranteId === idLimpio)
      .filter((h) => {
        const fechaMs = Date.parse(h.fechaEvento ?? h.fecha);
        return (desdeMs === null || fechaMs >= desdeMs) && (hastaMs === null || fechaMs <= hastaMs);
      })
      .sort(
        (a, b) =>
          Date.parse(b.fechaEvento ?? b.fecha) - Date.parse(a.fechaEvento ?? a.fecha) ||
          String(b.id).localeCompare(String(a.id))
      )
      .map((h) => ({ ...h }));
  }

  /**
   * ID institucional canónico de un colaborador (resuelve alias de semilla como "colab-001").
   * @param {string|null} colaboradorId
   * @returns {string|null}
   */
  idInstitucionalDe(colaboradorId) {
    if (colaboradorId == null || colaboradorId === "") return null;
    const ids = this._obtenerIdsColaborador(colaboradorId);
    return [...ids].find((id) => /^\d+$/.test(id)) ?? String(colaboradorId).trim();
  }

  /**
   * Cuántos aspirantes tiene en cartera cada colaborador (HU6-12 / EQ-71).
   * Los aspirantes sin colaborador no se cuentan.
   * @returns {Promise<Record<string, number>>} ID institucional → total
   */
  async contarAspirantesPorColaborador() {
    const conteo = {};
    for (const aspirante of this.aspirantes) {
      const id = this.idInstitucionalDe(aspirante.colaboradorId);
      if (!id) continue;
      conteo[id] = (conteo[id] ?? 0) + 1;
    }
    return conteo;
  }

  /**
   * Aspirantes que cambiarían de responsable si las carreras del campus se asignan
   * a un colaborador. No modifica nada (HU6-17 / EQ-64).
   * @param {{ campus: string, carreras: string[] }} params
   * @returns {Promise<Array<{ aspiranteId: string, carrera: string, colaboradorActual: string|null }>>}
   */
  async previsualizarAsignacion({ campus, carreras }) {
    const elegidas = new Set(carreras);
    return this.aspirantes
      .filter((a) => a.campus === campus && elegidas.has(a.carreraSolicitada))
      .map((a) => ({
        aspiranteId: a.id,
        carrera: a.carreraSolicitada,
        colaboradorActual: this.idInstitucionalDe(a.colaboradorId),
      }));
  }

  /**
   * Asigna al colaborador todos los aspirantes del campus en esas carreras y le registra
   * las carreras. Devuelve `deshacer()` para revertir exactamente este cambio si la
   * confirmación del registro falla después (HU6-9 / EQ-59).
   *
   * @param {{ colaboradorId: string, campus: string, carreras: string[] }} params
   * @returns {Promise<{ aspirantesIds: string[], transferencias: Array<{ aspiranteId: string, colaboradorAnterior: string|null }>, deshacer: () => Promise<void> }>}
   */
  async reasignarAspirantes({ colaboradorId, campus, carreras }) {
    const id = String(colaboradorId).trim();
    const elegidas = new Set(carreras);
    const anteriores = [];
    const carrerasPrevias = this.carrerasPorColaborador[id];
    const aliasPrevio = this.aliasColaborador[id];

    for (const aspirante of this.aspirantes) {
      if (aspirante.campus === campus && elegidas.has(aspirante.carreraSolicitada)) {
        anteriores.push({ aspirante, colaboradorId: aspirante.colaboradorId });
        aspirante.colaboradorId = id;
      }
    }
    this.carrerasPorColaborador[id] = [...new Set([...(carrerasPrevias ?? []), ...carreras])];
    if (!aliasPrevio) this.aliasColaborador[id] = [id];

    return {
      aspirantesIds: anteriores.map(({ aspirante }) => aspirante.id),
      transferencias: anteriores.map(({ aspirante, colaboradorId: previo }) => ({
        aspiranteId: aspirante.id,
        colaboradorAnterior: this.idInstitucionalDe(previo),
      })),
      deshacer: async () => {
        for (const { aspirante, colaboradorId: previo } of anteriores) aspirante.colaboradorId = previo;
        if (carrerasPrevias === undefined) delete this.carrerasPorColaborador[id];
        else this.carrerasPorColaborador[id] = carrerasPrevias;
        if (aliasPrevio === undefined) delete this.aliasColaborador[id];
      },
    };
  }

  /**
   * Cartera de un colaborador agrupada por (campus, carrera) (HU6-18).
   * @param {string} colaboradorId
   * @returns {Promise<Array<{ campus: string, carrera: string, aspirantes: number }>>}
   */
  async carteraPorCarrera(colaboradorId) {
    const ids = this._obtenerIdsColaborador(colaboradorId);
    const grupos = new Map();
    for (const a of this.aspirantes) {
      if (!ids.has(a.colaboradorId)) continue;
      const k = `${a.campus}\u0000${a.carreraSolicitada}`;
      const g = grupos.get(k) ?? { campus: a.campus, carrera: a.carreraSolicitada, aspirantes: 0 };
      g.aspirantes += 1;
      grupos.set(k, g);
    }
    return [...grupos.values()];
  }

  /**
   * Pasa la cartera de `desde` a otros colaboradores, por (campus, carrera) (HU6-18).
   * Mueve también la lista de carreras asignadas. `deshacer()` revierte exactamente esto.
   * @param {{ desde: string, movimientos: Array<{ campus: string, carrera: string, hacia: string }> }} params
   */
  async reasignarCartera({ desde, movimientos }) {
    const ids = this._obtenerIdsColaborador(desde);
    const destinoDe = new Map(movimientos.map((m) => [`${m.campus}\u0000${m.carrera}`, String(m.hacia).trim()]));
    const anteriores = [];
    for (const a of this.aspirantes) {
      if (!ids.has(a.colaboradorId)) continue;
      const hacia = destinoDe.get(`${a.campus}\u0000${a.carreraSolicitada}`);
      if (!hacia) continue;
      anteriores.push({ aspirante: a, colaboradorId: a.colaboradorId, hacia });
      a.colaboradorId = hacia;
    }

    const carrerasPrevias = structuredClone(this.carrerasPorColaborador);
    const aliasPrevio = structuredClone(this.aliasColaborador);
    for (const id of ids) delete this.carrerasPorColaborador[id];
    for (const m of movimientos) {
      const hacia = String(m.hacia).trim();
      if (!this.aliasColaborador[hacia]) this.aliasColaborador[hacia] = [hacia];
      for (const id of this._obtenerIdsColaborador(hacia)) {
        this.carrerasPorColaborador[id] = [...new Set([...(this.carrerasPorColaborador[id] ?? []), m.carrera])];
      }
    }

    const origen = this.idInstitucionalDe(desde);
    return {
      aspirantesIds: anteriores.map(({ aspirante }) => aspirante.id),
      transferencias: anteriores.map(({ aspirante, hacia }) => ({
        aspiranteId: aspirante.id,
        colaboradorAnterior: origen,
        colaboradorDestino: hacia,
      })),
      deshacer: async () => {
        for (const { aspirante, colaboradorId: previo } of anteriores) aspirante.colaboradorId = previo;
        this.carrerasPorColaborador = carrerasPrevias;
        this.aliasColaborador = aliasPrevio;
      },
    };
  }

  /**
   * Transfiere un expediente individual a un colaborador autorizado para casos especiales.
   * Devuelve una compensación para restaurar al responsable anterior si falla la bitácora.
   * @param {{ aspiranteId: string, colaboradorDestino: string }} params
   */
  async transferirAspiranteManual({ aspiranteId, colaboradorDestino }) {
    const id = String(aspiranteId ?? "").trim();
    const destino = String(colaboradorDestino ?? "").trim();
    const aspirante = this.aspirantes.find((a) => String(a.id) === id);
    if (!aspirante) return null;

    const colaboradorAnteriorOriginal = aspirante.colaboradorId ?? null;
    const colaboradorAnterior = this.idInstitucionalDe(colaboradorAnteriorOriginal);
    if (colaboradorAnterior === destino) {
      return {
        aspiranteId: aspirante.id,
        campus: aspirante.campus,
        nombreCompleto: aspirante.nombreCompleto ?? null,
        colaboradorAnterior,
        colaboradorDestino: destino,
        transferido: false,
        deshacer: async () => {},
      };
    }

    aspirante.colaboradorId = destino;
    let deshecho = false;
    return {
      aspiranteId: aspirante.id,
      campus: aspirante.campus,
      nombreCompleto: aspirante.nombreCompleto ?? null,
      colaboradorAnterior,
      colaboradorDestino: destino,
      transferido: true,
      deshacer: async () => {
        if (deshecho) return;
        aspirante.colaboradorId = colaboradorAnteriorOriginal;
        deshecho = true;
      },
    };
  }

  /**
   * Registra un evento en el historial del aspirante (p. ej. al enviar un mensaje) (EQ-43).
   * @param {Partial<import('../dominio/repositorio-monitoreo.js').EventoHistorial>} evento
   * @returns {Promise<import('../dominio/repositorio-monitoreo.js').EventoHistorial>}
   */
  async registrarActividad(evento) {
    if (!evento?.aspiranteId || !evento?.tipoEvento || !evento?.titulo) {
      throw new Error("registrarActividad requiere aspiranteId, tipoEvento y titulo.");
    }
    const registro = {
      id: evento.id ?? `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      aspiranteId: String(evento.aspiranteId).trim(),
      tipoEvento: evento.tipoEvento,
      titulo: evento.titulo,
      detalle: evento.detalle ?? null,
      motivoRechazo: evento.motivoRechazo ?? null,
      autorTipo: evento.autorTipo ?? "SISTEMA",
      autorId: evento.autorId ?? null,
      fechaEvento: evento.fechaEvento ?? new Date().toISOString(),
      metadatos: evento.metadatos ? { ...evento.metadatos } : {},
    };
    this.historial.push(registro);
    return { ...registro };
  }

  /**
   * Registra un envío exitoso al aspirante (EQ-87). Actualiza la fecha de última
   * notificación (solo si es más reciente) y, si `contar`, suma una al conteo.
   * No toca fechaUltimaActividad: un mensaje saliente no es actividad del aspirante (EQ-77 §6.3).
   * @param {{ aspiranteId: string, fecha: string, contar?: boolean }} datos
   * @returns {Promise<{ fechaUltimaNotificacion: string, vecesNotificado: number }|null>}
   */
  async registrarNotificacion({ aspiranteId, fecha, contar = true }) {
    const aspirante = this.aspirantes.find((a) => a.id === String(aspiranteId).trim());
    if (!aspirante) return null;
    if (!aspirante.fechaUltimaNotificacion || Date.parse(fecha) > Date.parse(aspirante.fechaUltimaNotificacion)) {
      aspirante.fechaUltimaNotificacion = fecha;
    }
    if (contar) aspirante.vecesNotificado = (aspirante.vecesNotificado || 0) + 1;
    return { fechaUltimaNotificacion: aspirante.fechaUltimaNotificacion, vecesNotificado: aspirante.vecesNotificado || 0 };
  }

  /**
   * Agrega un mensaje a la conversación del aspirante (HU3-5). Ignora un id repetido.
   * @param {Object} mensaje  Misma forma que devuelve obtenerConversacionAspirante.
   * @returns {Promise<boolean>} true si se agregó
   */
  async registrarMensajeConversacion(mensaje) {
    if (!mensaje?.aspiranteId || !mensaje?.contenido) {
      throw new Error("registrarMensajeConversacion requiere aspiranteId y contenido.");
    }
    if (mensaje.id && this.conversaciones.some((m) => m.id === mensaje.id)) return false;
    this.conversaciones.push({ ...mensaje });
    return true;
  }
}
