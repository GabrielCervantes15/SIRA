/**
 * Controlador HTTP para el Módulo de Monitoreo.
 * Maneja peticiones REST, valida parámetros y transforma errores en respuestas HTTP consistentes.
 */

export class MonitoreoControlador {
  /**
   * @param {Object} dependencias
   * @param {import('../aplicacion/obtener-filtros.caso-uso.js').ObtenerFiltrosCasoUso} dependencias.obtenerFiltrosCasoUso
   * @param {import('../aplicacion/listar-aspirantes.caso-uso.js').ListarAspirantesCasoUso} [dependencias.listarAspirantesCasoUso]
   */
  constructor({ obtenerFiltrosCasoUso, listarAspirantesCasoUso }) {
    this.obtenerFiltrosCasoUso = obtenerFiltrosCasoUso;
    this.listarAspirantesCasoUso = listarAspirantesCasoUso;
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

  /**
   * GET /api/monitoreo/aspirantes (HU2-4)
   * Devuelve la lista de aspirantes asignados al colaborador autenticado con filtros combinables.
   *
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {Object} [contexto] - Información de la sesión del usuario autenticado.
   */
  async listarAspirantes(req, res, contexto = {}) {
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
            mensaje: "Se requiere iniciar sesión para consultar los aspirantes asignados.",
          })
        );
        return;
      }

      if (!this.listarAspirantesCasoUso) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            codigo: "CASO_USO_NO_CONFIGURADO",
            mensaje: "ListarAspirantesCasoUso no está inicializado en el controlador.",
          })
        );
        return;
      }

      const url = new URL(req.url, "http://localhost");
      const q = url.searchParams;

      const params = {
        colaboradorId,
        nombre: q.get("nombre") || undefined,
        semaforo: q.get("semaforo") || undefined,
        carrera: q.get("carrera") || undefined,
        preparatoria: q.get("preparatoria") || undefined,
        periodo: q.get("periodo") || undefined,
        estadoSolicitud: q.get("estado_solicitud") || q.get("estadoSolicitud") || undefined,
        mostrarAceptados: q.has("mostrar_aceptados")
          ? q.get("mostrar_aceptados")
          : q.get("mostrarAceptados") ?? undefined,
        limit: q.get("limit") || undefined,
        offset: q.get("offset") || undefined,
        ordenarPor: q.get("ordenar_por") || q.get("ordenarPor") || undefined,
        ordenDireccion: q.get("orden_direccion") || q.get("ordenDireccion") || undefined,
      };

      const resultado = await this.listarAspirantesCasoUso.ejecutar(params);

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(resultado));
    } catch (error) {
      const status = error.status || 500;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          codigo: error.codigo || "ERROR_INTERNO",
          mensaje: error.message || "Error al consultar los aspirantes.",
        })
      );
    }
  }
}
