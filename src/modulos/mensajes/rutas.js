/**
 * Enrutador del módulo de Mensajes.
 * Despacha rutas bajo /api/mensajes/... y /api/v1/mensajes/...
 * Tareas: EQ-106 (HU9-5), EQ-107 (HU9-6) y EQ-108 (HU9-7)
 */

export function crearEnrutadorMensajes({ controlador }) {
  return async function despacharMensajes(req, res, contexto = {}) {
    const url = new URL(req.url, `http://${req.headers?.host || "localhost"}`);
    const pathname = url.pathname;

    // Normalizar prefijo de ruta (acepta /api/mensajes y /api/v1/mensajes)
    const rutaRelativa = pathname
      .replace(/^\/api\/v1\/mensajes/, "")
      .replace(/^\/api\/mensajes/, "");

    if (rutaRelativa === "/configuracion" || rutaRelativa === "/configuracion/") {
      // GET /api/mensajes/configuracion (EQ-106 / HU9-5)
      if (req.method === "GET") {
        await controlador.obtenerConfiguracion(req, res, contexto);
        return true;
      }

      // PUT /api/mensajes/configuracion (EQ-107 / HU9-6)
      if (req.method === "PUT") {
        await controlador.guardarConfiguracion(req, res, contexto);
        return true;
      }

      res.writeHead(405, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        Allow: "GET, PUT",
      });
      res.end(JSON.stringify({
        codigo: "METODO_NO_PERMITIDO",
        mensaje: "Método no permitido para la configuración de mensajes.",
      }));
      return true;
    }

    // GET /api/mensajes/configuracion/bitacora (EQ-108 / HU9-7)
    if (
      (rutaRelativa === "/configuracion/bitacora" ||
        rutaRelativa === "/configuracion/bitacora/") &&
      req.method === "GET"
    ) {
      await controlador.listarBitacora(req, res, contexto);
      return true;
    }

    return false; // Ruta no manejada por este enrutador
  };
}
