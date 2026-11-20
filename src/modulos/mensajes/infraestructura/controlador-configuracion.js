/**
 * Controlador HTTP para la Configuración del Módulo de Mensajes.
 * Tareas: EQ-106 (HU9-5: GET) y EQ-107 (HU9-6: PUT)
 */

const cabecerasJson = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
});

function leerCuerpoJson(req, maxBytes = 16_384) {
  if (req && req.body !== undefined) {
    return Promise.resolve(req.body);
  }
  if (!req || typeof req.on !== "function") {
    return Promise.resolve({});
  }

  return new Promise((resolve, reject) => {
    let acumulado = "";
    req.on("data", (chunk) => {
      acumulado += chunk;
      if (Buffer.byteLength(acumulado) > maxBytes) {
        const error = new Error("Solicitud demasiado grande.");
        error.status = 413;
        error.codigo = "SOLICITUD_DEMASIADO_GRANDE";
        reject(error);
        if (typeof req.destroy === "function") req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(acumulado ? JSON.parse(acumulado) : {});
      } catch {
        const error = new Error("El cuerpo de la solicitud no contiene JSON válido.");
        error.status = 400;
        error.codigo = "JSON_INVALIDO";
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export class MensajesConfiguracionControlador {
  /**
   * @param {Object} dependencias
   * @param {import('../aplicacion/obtener-configuracion.caso-uso.js').ObtenerConfiguracionCasoUso} dependencias.obtenerConfiguracionCasoUso
   * @param {import('../aplicacion/guardar-configuracion.caso-uso.js').GuardarConfiguracionCasoUso} dependencias.guardarConfiguracionCasoUso
   */
  constructor({ obtenerConfiguracionCasoUso, guardarConfiguracionCasoUso }) {
    this.obtenerConfiguracionCasoUso = obtenerConfiguracionCasoUso;
    this.guardarConfiguracionCasoUso = guardarConfiguracionCasoUso;
  }

  /**
   * GET /api/mensajes/configuracion y GET /api/v1/mensajes/configuracion (EQ-106 / HU9-5)
   *
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {Object} [contexto]
   */
  async obtenerConfiguracion(req, res, contexto = {}) {
    try {
      const configuracion = await this.obtenerConfiguracionCasoUso.ejecutar(contexto);
      res.writeHead(200, cabecerasJson);
      res.end(JSON.stringify(configuracion));
    } catch (error) {
      const status = error.status || 500;
      res.writeHead(status, cabecerasJson);
      res.end(
        JSON.stringify({
          codigo: error.codigo || "ERROR_INTERNO",
          mensaje: error.message || "Error al consultar la configuración de mensajes.",
        })
      );
    }
  }

  /**
   * PUT /api/mensajes/configuracion y PUT /api/v1/mensajes/configuracion (EQ-107 / HU9-6)
   *
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {Object} [contexto]
   */
  async guardarConfiguracion(req, res, contexto = {}) {
    try {
      const usuario = contexto?.usuario || null;
      if (!usuario || !usuario.idInstitucional) {
        res.writeHead(401, cabecerasJson);
        res.end(
          JSON.stringify({
            codigo: "SESION_NO_VALIDA",
            mensaje: "Debes iniciar sesión para acceder a esta funcionalidad.",
          })
        );
        return;
      }

      if (usuario.rol !== "administrador") {
        res.writeHead(403, cabecerasJson);
        res.end(
          JSON.stringify({
            codigo: "SIN_PERMISO",
            mensaje: "No tienes permisos para acceder a esta funcionalidad.",
          })
        );
        return;
      }

      const cuerpo =
        contexto.cuerpo !== undefined ? contexto.cuerpo : await leerCuerpoJson(req);

      const guardada = await this.guardarConfiguracionCasoUso.ejecutar(cuerpo, contexto);

      res.writeHead(200, cabecerasJson);
      res.end(JSON.stringify(guardada));
    } catch (error) {
      const status = error.status || 500;
      const respuestaError = {
        codigo: error.codigo || "ERROR_INTERNO",
        mensaje: error.message || "Error al guardar la configuración de mensajes.",
      };
      if (error.errores) {
        respuestaError.errores = error.errores;
      }
      res.writeHead(status, cabecerasJson);
      res.end(JSON.stringify(respuestaError));
    }
  }
}
