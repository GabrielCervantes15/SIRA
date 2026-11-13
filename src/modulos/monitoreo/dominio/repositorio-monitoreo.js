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
 * Interfaz esperada para cualquier implementación del repositorio de Monitoreo.
 */
export const METODOS_REPOSITORIO_MONITOREO = Object.freeze([
  "obtenerFiltrosColaborador",
  "listarAspirantes",
  "obtenerAspirantePorId",
  "obtenerConversacionAspirante",
]);

