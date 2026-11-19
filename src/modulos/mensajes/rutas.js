/**
 * Enrutador del módulo de Mensajes.
 * Despacha rutas bajo /api/mensajes/... y /api/v1/mensajes/...
 * Tareas: EQ-106 (HU9-5) y EQ-107 (HU9-6)
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
    }

    return false; // Ruta no manejada por este enrutador
  };
}
