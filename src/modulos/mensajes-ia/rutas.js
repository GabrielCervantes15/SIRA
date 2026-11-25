/**
 * Enrutador del catálogo de mensajes (HU 8): /api/v1/mensajes-ia[/:id]
 * Devuelve false si la ruta no es suya.
 */
export function crearEnrutadorCatalogo({ controlador }) {
  return async function despacharCatalogo(req, res) {
    const { pathname } = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const coincide = pathname.match(/^\/api\/v1\/mensajes-ia(?:\/([^/]+))?\/?$/);
    if (!coincide) return false;
    const id = coincide[1];

    if (req.method !== "GET") {
      controlador.soloLectura(req, res);
      return true;
    }
    if (id) await controlador.detalle(req, res, id);
    else await controlador.listar(req, res);
    return true;
  };
}
