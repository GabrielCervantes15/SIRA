
/**
 * Enrutador del módulo Colaboradores (HU 6).
 * Atiende /api/v1/colaboradores/...
 * Devuelve false si la ruta no pertenece al módulo.
 */
export function crearEnrutadorColaboradores({ controlador }) {
  return async function despacharColaboradores(req, res, contexto = {}) {
    const { pathname } = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    );

    const prefijo = pathname.match(
      /^\/api\/(?:v1\/)?colaboradores(?=\/|$)/
    );

    if (!prefijo) return false;

    const ruta = pathname.slice(prefijo[0].length) || "/";

    // EQ-71: listado compartido entre administrador y colaborador.
    if (ruta === "/" && req.method === "GET") {
      await controlador.listar(req, res, contexto);
      return true;
    }

    // EQ-55: consulta de perfil institucional.
    const perfil = ruta.match(/^\/registro\/perfil\/([^/]+)$/);

    if (perfil && req.method === "GET") {
      await controlador.obtenerPerfil(req, res, contexto, perfil[1]);
      return true;
    }

    // EQ-64: vista previa de distribución.
    if (ruta === "/registro/vista-previa" && req.method === "POST") {
      await controlador.vistaPrevia(req, res, contexto);
      return true;
    }

    // EQ-59: confirmación del registro.
    if (
      ["/registro", "/registro/", "/registro/confirmar"].includes(ruta) &&
      req.method === "POST"
    ) {
      await controlador.confirmar(req, res, contexto);
      return true;
    }

    return false;
  };
}
