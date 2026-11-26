/**
 * Puerto de Dominio: Repositorio de Monitoreo
 * Define el contrato de persistencia y consulta para el módulo de Monitoreo.
 */

/**
 * @typedef {Object} OpcionesFiltros
 * @property {string[]} carreras           Carreras asignadas únicamente al colaborador autenticado.
 * @property {string[]} preparatorias      Catálogo general de preparatorias.
 * @property {string[]} periodos           Catálogo general de períodos de admisión.
 * @property {string[]} estadosSolicitud   Catálogo general de estados de la solicitud.
 * @property {string[]} semaforos          Colores del semáforo de inactividad (Verde, Naranja, Rojo).
 */

/**
 * @typedef {Object} FiltrosConsultaAspirantes
 * @property {string} colaboradorId
 * @property {string} [nombre]
 * @property {string} [semaforo]
 * @property {string} [carrera]
 * @property {string} [preparatoria]
 * @property {string} [periodo]
 * @property {string} [estadoSolicitud]
 * @property {boolean} [mostrarAceptados]
 * @property {number} [limit]
 * @property {number} [offset]
 * @property {string} [ordenarPor]
 * @property {"ASC"|"DESC"} [ordenDireccion]
 */

/**
 * @typedef {Object} MensajeChat
 * @property {string} id
 * @property {string} aspiranteId
 * @property {"ENTRANTE"|"SALIENTE"|"enviado"|"recibido"} direccion
 * @property {string} remitenteTipo
 * @property {string|null} remitenteId
 * @property {string} contenido
 * @property {string} tipoContenido
 * @property {string} estadoEntrega
 * @property {string} fechaEnvio
 */

/**
 * Evento del historial del aspirante (tabla aspirantes.historial_eventos) (HU3-6 / EQ-43).
 * @typedef {Object} EventoHistorial
 * @property {string} id
 * @property {string} aspiranteId
 * @property {"MENSAJE_ENVIADO"|"CONSTANCIA_ENTREGADA"|"CAMBIO_ESTADO"|"RECHAZO_SOLICITUD"|"NOTA_SEGUIMIENTO"} tipoEvento
 * @property {string} titulo
 * @property {string|null} [detalle]
 * @property {string|null} [motivoRechazo]
 * @property {"SISTEMA"|"IA"|"COLABORADOR"|"REGISTRO_ESCOLAR"} [autorTipo]
 * @property {string|null} [autorId]
 * @property {string} fechaEvento
 */

/**
 * Rango opcional e inclusivo para consultar el historial.
 * @typedef {Object} RangoHistorial
 * @property {string|null} [desde] - ISO 8601
 * @property {string|null} [hasta] - ISO 8601
 */

/**
 * Interfaz esperada para cualquier implementación del repositorio de Monitoreo.
 *
 * - obtenerHistorialAspirante(aspiranteId, rango?) → Promise<EventoHistorial[]>
 * - registrarActividad(evento) → Promise<EventoHistorial>
 *
 * Cartera (la usa el módulo Colaboradores por medio de `moduloMonitoreo.cartera`, HU 6):
 * - idInstitucionalDe(colaboradorId) → string|null
 * - contarAspirantesPorColaborador() → Promise<Record<string, number>>
 * - previsualizarAsignacion({ campus, carreras }) → Promise<Array<{ aspiranteId, carrera, colaboradorActual }>>
 * - reasignarAspirantes({ colaboradorId, campus, carreras }) → Promise<{ aspirantesIds, transferencias, deshacer() }>
 * - transferirAspiranteManual({ aspiranteId, colaboradorDestino }) → Promise<{ transferencia, deshacer() }|null>
 */
export const METODOS_REPOSITORIO_MONITOREO = Object.freeze([
  "obtenerFiltrosColaborador",
  "listarAspirantes",
  "obtenerAspirantePorId",
  "obtenerConversacionAspirante",
  "obtenerHistorialAspirante",
  "registrarActividad",
  "idInstitucionalDe",
  "contarAspirantesPorColaborador",
  "previsualizarAsignacion",
  "reasignarAspirantes",
  "transferirAspiranteManual",
]);

