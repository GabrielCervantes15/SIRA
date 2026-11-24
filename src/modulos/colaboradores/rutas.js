/**
 * Enrutador del módulo Colaboradores (HU 6).
 * Atiende /api/v1/colaboradores/... (y el alias heredado /api/colaboradores/registro).
 * Devuelve false si la ruta no es suya, para que el servidor siga buscando.
 */
export function crearEnrutadorColaboradores({ controlador }) {
  return async function despacharColaboradores(req, res, contexto = {}) {
    const { pathname } = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const ruta = pathname.replace(/^\/api\/(?:v1\/)?colaboradores/, "") || "/";

    // GET /api/v1/colaboradores (EQ-71)
    if ((ruta === "/" || ruta === "") && req.method === "GET") {
      await controlador.listar(req, res, contexto);
      return true;
    }

    // GET /api/v1/colaboradores/registro/perfil/:id (EQ-55)
    const perfil = ruta.match(/^\/registro\/perfil\/([^/]+)$/);
    if (perfil && req.method === "GET") {
      await controlador.obtenerPerfil(req, res, contexto, perfil[1]);
      return true;
    }

    // POST /api/v1/colaboradores/registro/vista-previa (EQ-64)
    if (ruta === "/registro/vista-previa" && req.method === "POST") {
      await controlador.vistaPrevia(req, res, contexto);
      return true;
    }

    // POST /api/v1/colaboradores/registro[/confirmar] (EQ-59)
    if (["/registro", "/registro/", "/registro/confirmar"].includes(ruta) && req.method === "POST") {
      await controlador.confirmar(req, res, contexto);
      return true;
    }

    return false;
  };
}
