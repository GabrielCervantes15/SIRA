/**
 * Controlador HTTP para el Módulo de Monitoreo.
 * Maneja peticiones REST, valida parámetros y transforma errores en respuestas HTTP consistentes.
 */

export class MonitoreoControlador {
  /**
   * @param {Object} dependencias
   * @param {import('../aplicacion/obtener-filtros.caso-uso.js').ObtenerFiltrosCasoUso} dependencias.obtenerFiltrosCasoUso
   */
  constructor({ obtenerFiltrosCasoUso }) {
    this.obtenerFiltrosCasoUso = obtenerFiltrosCasoUso;
  }

  /**
   * GET /api/monitoreo/filtros (HU2-7)
   * Devuelve las opciones de filtros para los menús desplegables.
   *
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {Object} [contexto] - Información de la sesión del usuario autenticado.
   */
  async obtenerFiltros(req, res, contexto = {}) {
    try {
      const colaboradorId =
        contexto.usuario?.idInstitucional ||
        req.headers["x-colaborador-id"] ||
        new URL(req.url, "http://localhost").searchParams.get("colaborador_id");

      if (!colaboradorId) {
        res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            codigo: "NO_AUTORIZADO",
            mensaje: "Se requiere iniciar sesión para consultar las opciones de filtros.",
          })
        );
        return;
      }

      const filtros = await this.obtenerFiltrosCasoUso.ejecutar(colaboradorId);

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(filtros));
    } catch (error) {
      const status = error.status || 500;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          codigo: error.codigo || "ERROR_INTERNO",
          mensaje: error.message || "Error al obtener las opciones de filtros.",
        })
      );
    }
  }
}

