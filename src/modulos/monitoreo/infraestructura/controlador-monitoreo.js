/**
 * Controlador HTTP para el Módulo de Monitoreo.
 * Maneja peticiones REST, valida parámetros y transforma errores en respuestas HTTP consistentes.
 */

export class MonitoreoControlador {
  /**
   * @param {Object} dependencias
   * @param {import('../aplicacion/obtener-filtros.caso-uso.js').ObtenerFiltrosCasoUso} dependencias.obtenerFiltrosCasoUso
   * @param {import('../aplicacion/listar-aspirantes.caso-uso.js').ListarAspirantesCasoUso} [dependencias.listarAspirantesCasoUso]
   * @param {import('../aplicacion/obtener-detalle-aspirante.caso-uso.js').ObtenerDetalleAspiranteCasoUso} [dependencias.obtenerDetalleAspiranteCasoUso]
   * @param {import('../aplicacion/obtener-conversacion.caso-uso.js').ObtenerConversacionCasoUso} [dependencias.obtenerConversacionCasoUso]
   * @param {import('../aplicacion/obtener-historial-aspirante.caso-uso.js').ObtenerHistorialAspiranteCasoUso} [dependencias.obtenerHistorialAspiranteCasoUso]
   */
  constructor({
    obtenerFiltrosCasoUso,
    listarAspirantesCasoUso,
    obtenerDetalleAspiranteCasoUso,
    obtenerConversacionCasoUso,
    obtenerHistorialAspiranteCasoUso,
  }) {
    this.obtenerFiltrosCasoUso = obtenerFiltrosCasoUso;
    this.listarAspirantesCasoUso = listarAspirantesCasoUso;
    this.obtenerDetalleAspiranteCasoUso = obtenerDetalleAspiranteCasoUso;
    this.obtenerConversacionCasoUso = obtenerConversacionCasoUso;
    this.obtenerHistorialAspiranteCasoUso = obtenerHistorialAspiranteCasoUso;
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

  /**
   * GET /api/monitoreo/aspirantes/:id (HU3-3 / EQ-42)
   * Detalle de un aspirante de la cartera: 200, 401, 403 o 404.
   *
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {Object} [contexto]
   * @param {string} [aspiranteIdCrudo]
   */
  async obtenerDetalleAspirante(req, res, contexto = {}, aspiranteIdCrudo = "") {
    try {
      let aspiranteId;
      try {
        aspiranteId = decodeURIComponent(aspiranteIdCrudo);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ codigo: "PARAMETRO_INVALIDO", mensaje: "Identificador inválido." }));
        return;
      }

      const resultado = await this.obtenerDetalleAspiranteCasoUso.ejecutar({
        colaboradorId: contexto.usuario?.idInstitucional,
        aspiranteId,
      });

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(resultado));
    } catch (error) {
      const status = error.status || 500;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          codigo: error.codigo || "ERROR_INTERNO",
          mensaje: error.status ? error.message : "Error al consultar el aspirante.",
        })
      );
    }
  }

  /**
   * GET /api/monitoreo/aspirantes/:id/conversacion (HU3-5)
   * Devuelve la lista de mensajes de la conversación del aspirante ordenados cronológicamente (fecha ascendente),
   * validando previamente que el aspirante exista (404) y pertenezca al colaborador autenticado (403).
   *
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {Object} [contexto]
   * @param {string} [aspiranteIdParam]
   */
  async obtenerConversacion(req, res, contexto = {}, aspiranteIdParam = null) {
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
            mensaje: "Se requiere iniciar sesión para consultar la conversación del aspirante.",
          })
        );
        return;
      }

      if (!this.obtenerConversacionCasoUso) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            codigo: "CASO_USO_NO_CONFIGURADO",
            mensaje: "ObtenerConversacionCasoUso no está inicializado en el controlador.",
          })
        );
        return;
      }

      const resultado = await this.obtenerConversacionCasoUso.ejecutar({
        colaboradorId,
        aspiranteId: aspiranteIdParam,
      });

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(resultado));
    } catch (error) {
      const status = error.status || 500;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          codigo: error.codigo || "ERROR_INTERNO",
          mensaje: error.message || "Error al consultar la conversación del aspirante.",
        })
      );
    }
  }

  /**
   * GET /api/monitoreo/aspirantes/:id/actividades?desde=&hasta= (HU3-6 / EQ-43)
   * Historial del aspirante del más reciente al más antiguo: 200, 400, 401, 403 o 404.
   *
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {Object} [contexto]
   * @param {string} [aspiranteIdCrudo]
   */
  async obtenerHistorial(req, res, contexto = {}, aspiranteIdCrudo = "") {
    try {
      let aspiranteId;
      try {
        aspiranteId = decodeURIComponent(aspiranteIdCrudo);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ codigo: "PARAMETRO_INVALIDO", mensaje: "Identificador inválido." }));
        return;
      }

      if (!this.obtenerHistorialAspiranteCasoUso) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            codigo: "CASO_USO_NO_CONFIGURADO",
            mensaje: "ObtenerHistorialAspiranteCasoUso no está inicializado en el controlador.",
          })
        );
        return;
      }

      const q = new URL(req.url, "http://localhost").searchParams;
      const resultado = await this.obtenerHistorialAspiranteCasoUso.ejecutar({
        colaboradorId: contexto.usuario?.idInstitucional,
        aspiranteId,
        desde: q.get("desde"),
        hasta: q.get("hasta"),
      });

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(resultado));
    } catch (error) {
      const status = error.status || 500;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          codigo: error.codigo || "ERROR_INTERNO",
          mensaje: error.status ? error.message : "Error al consultar el historial del aspirante.",
        })
      );
    }
  }
}
