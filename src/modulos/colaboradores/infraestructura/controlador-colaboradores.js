/**
 * Controlador HTTP del módulo Colaboradores (HU 6).
 * Solo traduce HTTP ↔ casos de uso; las reglas viven en la capa de aplicación.
 * El control de acceso (solo administrador) lo hace el servidor antes de llegar aquí.
 */

function responder(res, status, cuerpo) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(cuerpo));
}

function responderError(res, error, mensajeGenerico) {
  if (error?.status && error?.codigo) {
    return responder(res, error.status, { codigo: error.codigo, mensaje: error.message });
  }
  console.error("[colaboradores]", error);
  return responder(res, 500, { codigo: "ERROR_INTERNO", mensaje: mensajeGenerico });
}

export function leerCuerpoJson(req, maxBytes = 16_384) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(Object.assign(new Error("Solicitud demasiado grande."), { status: 413, codigo: "SOLICITUD_GRANDE" }));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error("El cuerpo de la solicitud no contiene JSON válido."), { status: 400, codigo: "JSON_INVALIDO" }));
      }
    });
    req.on("error", reject);
  });
}

export class ColaboradoresControlador {
  constructor({ consultarColaborador, listarColaboradores, previsualizarDistribucion, confirmarRegistro }) {
    this.consultarColaborador = consultarColaborador;
    this.listarColaboradores = listarColaboradores;
    this.previsualizarDistribucion = previsualizarDistribucion;
    this.confirmarRegistro = confirmarRegistro;
  }

  /** GET /api/v1/colaboradores/registro/perfil/:id (EQ-55) */
  async obtenerPerfil(req, res, _contexto, idCrudo) {
    try {
      let id;
      try {
        id = decodeURIComponent(idCrudo);
      } catch {
        return responder(res, 400, { codigo: "ID_INVALIDO", mensaje: "El ID no es válido." });
      }
      return responder(res, 200, await this.consultarColaborador.ejecutar(id));
    } catch (error) {
      return responderError(res, error, "No se pudo consultar al colaborador.");
    }
  }

  /**
   * GET /api/v1/colaboradores?campus=&incluir_inactivos=&busqueda= (EQ-71)
   * Lo consultan administrador y colaborador; solo el administrador puede ver inactivos.
   */
  async listar(req, res, contexto = {}) {
    try {
      const q = new URL(req.url, "http://localhost").searchParams;
      const esAdministrador = contexto.usuario?.rol === "administrador";
      const resultado = await this.listarColaboradores.ejecutar({
        campus: q.get("campus") ?? undefined,
        incluirInactivos: esAdministrador ? (q.get("incluir_inactivos") ?? q.get("incluirInactivos") ?? false) : false,
        busqueda: q.get("busqueda") ?? q.get("nombre") ?? "",
      });
      return responder(res, 200, resultado);
    } catch (error) {
      return responderError(res, error, "No se pudo consultar el listado de colaboradores.");
    }
  }

  /** POST /api/v1/colaboradores/registro/vista-previa (EQ-64) */
  async vistaPrevia(req, res) {
    try {
      const cuerpo = await leerCuerpoJson(req);
      return responder(res, 200, await this.previsualizarDistribucion.ejecutar(cuerpo));
    } catch (error) {
      return responderError(res, error, "No se pudo calcular la distribución.");
    }
  }

  /** POST /api/v1/colaboradores/registro (EQ-59) */
  async confirmar(req, res, contexto = {}) {
    try {
      const cuerpo = await leerCuerpoJson(req);
      const resultado = await this.confirmarRegistro.ejecutar(cuerpo, {
        administradorId: contexto.usuario?.idInstitucional ?? null,
      });
      return responder(res, 201, resultado);
    } catch (error) {
      return responderError(res, error, "No se pudo confirmar el registro.");
    }
  }
}
