/**
 * Módulo: Catálogo de mensajes predefinidos de la IA (HU 8, esquema `mensajes`).
 *
 *   EQ-95 · HU8-3  modelo de datos y semilla (dominio/catalogo.js, migración 05, semilla)
 *   EQ-96 · HU8-4  GET /api/v1/mensajes-ia            lista por categoría
 *   EQ-97 · HU8-5  GET /api/v1/mensajes-ia/:id        detalle con vista previa y reglas
 *
 * Solo lectura para Administrador y Colaborador (decisión del PO en EQ-93).
 */
import { RepositorioCatalogoMemoria } from "./infraestructura/repositorio-catalogo-memoria.js";
import { RepositorioCatalogoPostgres } from "./infraestructura/repositorio-catalogo-postgres.js";
import { ListarMensajesCasoUso } from "./aplicacion/listar-mensajes.caso-uso.js";
import { ObtenerDetalleMensajeCasoUso } from "./aplicacion/obtener-detalle-mensaje.caso-uso.js";
import { CatalogoMensajesControlador } from "./infraestructura/controlador-catalogo.js";
import { crearEnrutadorCatalogo } from "./rutas.js";

/**
 * @param {Object} [dependencias]
 * @param {Object} [dependencias.repositorio] - Repositorio ya construido (p. ej. Postgres).
 * @param {Array} [dependencias.mensajes] - Catálogo para el repositorio en memoria (pruebas).
 */
export function crearModuloCatalogoMensajes({ repositorio, mensajes } = {}) {
  const repositorioCatalogo = repositorio || new RepositorioCatalogoMemoria({ mensajes });
  const listarMensajes = new ListarMensajesCasoUso({ repositorioCatalogo });
  const obtenerDetalleMensaje = new ObtenerDetalleMensajeCasoUso({ repositorioCatalogo });
  const controlador = new CatalogoMensajesControlador({ listarMensajes, obtenerDetalleMensaje });
  return {
    repositorio: repositorioCatalogo,
    listarMensajes,
    obtenerDetalleMensaje,
    controlador,
    enrutador: crearEnrutadorCatalogo({ controlador }),
  };
}

export {
  RepositorioCatalogoMemoria,
  RepositorioCatalogoPostgres,
  ListarMensajesCasoUso,
  ObtenerDetalleMensajeCasoUso,
  CatalogoMensajesControlador,
  crearEnrutadorCatalogo,
};
export * from "./dominio/catalogo.js";
export { METODOS_REPOSITORIO_CATALOGO } from "./dominio/repositorio-catalogo.js";
