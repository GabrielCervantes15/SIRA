/**
 * Enrutador del módulo de Monitoreo.
 * Despacha rutas bajo /api/monitoreo/... y /api/v1/monitoreo/...
 */

export function crearEnrutadorMonitoreo({ controlador }) {
  return async function despacharMonitoreo(req, res, contexto = {}) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // Normalizar prefijo de ruta (acepta /api/monitoreo y /api/v1/monitoreo)
    const rutaRelativa = pathname
      .replace(/^\/api\/v1\/monitoreo/, "")
      .replace(/^\/api\/monitoreo/, "");

    // GET /api/monitoreo/filtros (HU2-7)
    if ((rutaRelativa === "/filtros" || rutaRelativa === "/filtros/") && req.method === "GET") {
      await controlador.obtenerFiltros(req, res, contexto);
      return true;
    }

    // GET /api/monitoreo/aspirantes (HU2-4)
    if ((rutaRelativa === "/aspirantes" || rutaRelativa === "/aspirantes/") && req.method === "GET") {
      await controlador.listarAspirantes(req, res, contexto);
      return true;
    }

    // GET /api/monitoreo/aspirantes/:id/actividades (HU3-4)
    const rutaActividades = rutaRelativa.match(/^\/aspirantes\/([^/]+)\/actividades\/?$/);
    if (rutaActividades && req.method === "GET") {
      await controlador.obtenerActividadesAspirante(req, res, contexto, rutaActividades[1]);
      return true;
    }

    // GET /api/monitoreo/aspirantes/:id (HU3-3)
    const rutaDetalle = rutaRelativa.match(/^\/aspirantes\/([^/]+)\/?$/);
    if (rutaDetalle && req.method === "GET") {
      await controlador.obtenerDetalleAspirante(req, res, contexto, rutaDetalle[1]);
      return true;
    }

    return false; // Ruta no manejada por este enrutador
  };
}