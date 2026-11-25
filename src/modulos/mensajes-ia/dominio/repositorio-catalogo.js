/**
 * Puerto: repositorio del catálogo de mensajes (HU 8, esquema `mensajes`).
 *
 * - listar({ categoria }) → Promise<MensajeCatalogo[]>   ordenados por `orden`
 * - obtenerPorId(id)      → Promise<MensajeCatalogo|null>
 * - contarPorCategoria()  → Promise<{ ENVIO: number, RESPUESTA: number }>
 *
 * Solo lectura: HU8 no crea, edita ni elimina mensajes (decisión del PO, EQ-93).
 *
 * @typedef {Object} MensajeCatalogo
 * @property {string} id
 * @property {"ENVIO"|"RESPUESTA"} categoria
 * @property {string} nombre
 * @property {number} orden
 * @property {string|null} [grupo]
 * @property {string|null} [pregunta]
 * @property {string} disparador
 * @property {string} canal
 * @property {boolean} requierePlantillaMeta
 * @property {{ referencia: string, estado: string }|null} plantillaMeta
 * @property {string} texto
 * @property {string[]} variables
 * @property {{ tipo: string, valor: string }[]} llaves
 * @property {string[]} reglas
 */
export const METODOS_REPOSITORIO_CATALOGO = Object.freeze(["listar", "obtenerPorId", "contarPorCategoria"]);
