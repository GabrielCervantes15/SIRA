
/**
 * Controlador HTTP del módulo Colaboradores (HU 6).
 * Solo traduce HTTP a casos de uso.
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
    return responder(res, error.status, {
      codigo: error.codigo,
      mensaje: error.message,
    });
  }

  console.error("[colaboradores]", error);

  return responder(res, 500, {
    codigo: "ERROR_INTERNO",
    mensaje: mensajeGenerico,
  });
}

export function leerCuerpoJson(req, maxBytes = 16_384) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (Buffer.byteLength(body) > maxBytes) {
        reject(
          Object.assign(new Error("Solicitud demasiado grande."), {
            status: 413,
            codigo: "SOLICITUD_GRANDE",
          })
        );
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(
          Object.assign(
            new Error("El cuerpo de la solicitud no contiene JSON válido."),
            { status: 400, codigo: "JSON_INVALIDO" }
          )
        );
      }
    });

    req.on("error", reject);
  });
}

function decodificarId(idCrudo) {
  try {
    return decodeURIComponent(idCrudo);
  } catch {
    throw Object.assign(new Error("El ID no es válido."), { status: 400, codigo: "ID_INVALIDO" });
  }
}

export class ColaboradoresControlador {
  constructor({
    consultarColaborador,
    listarColaboradores,
    previsualizarDistribucion,
    confirmarRegistro,
    actualizarCasosEspeciales,
    transferirAspiranteManual,
    previsualizarBaja,
    confirmarBaja,
  }) {
    this.consultarColaborador = consultarColaborador;
    this.listarColaboradores = listarColaboradores;
    this.previsualizarDistribucion = previsualizarDistribucion;
    this.confirmarRegistro = confirmarRegistro;
    this.actualizarCasosEspecialesCasoUso = actualizarCasosEspeciales;
    this.transferirAspiranteManual = transferirAspiranteManual;
    this.previsualizarBaja = previsualizarBaja;
    this.confirmarBaja = confirmarBaja;
  }

  // EQ-55: consulta de perfil.
  async obtenerPerfil(req, res, _contexto, idCrudo) {
    try {
      let id;

      try {
        id = decodeURIComponent(idCrudo);
      } catch {
        return responder(res, 400, {
          codigo: "ID_INVALIDO",
          mensaje: "El ID no es válido.",
        });
      }

      return responder(
        res,
        200,
        await this.consultarColaborador.ejecutar(id)
      );
    } catch (error) {
      return responderError(
        res,
        error,
        "No se pudo consultar al colaborador."
      );
    }
  }

  // EQ-71: listado para ambos roles.
  async listar(req, res, contexto = {}) {
    try {
      const q = new URL(req.url, "http://localhost").searchParams;
      const esAdministrador =
        contexto.usuario?.rol === "administrador";

      const resultado = await this.listarColaboradores.ejecutar({
        campus: q.get("campus") ?? undefined,
        incluirInactivos: esAdministrador
          ? (q.get("incluir_inactivos") ??
            q.get("incluirInactivos") ??
            false)
          : false,
        busqueda: q.get("busqueda") ?? q.get("nombre") ?? "",
      });

      return responder(res, 200, resultado);
    } catch (error) {
      return responderError(
        res,
        error,
        "No se pudo consultar el listado de colaboradores."
      );
    }
  }

  // EQ-64: vista previa.
  async vistaPrevia(req, res) {
    try {
      const cuerpo = await leerCuerpoJson(req);

      const resultado =
        await this.previsualizarDistribucion.ejecutar(cuerpo);

      return responder(res, 200, resultado);
    } catch (error) {
      return responderError(
        res,
        error,
        "No se pudo calcular la distribución."
      );
    }
  }

  // EQ-59: confirmar registro.
  async confirmar(req, res, contexto = {}) {
    try {
      const cuerpo = await leerCuerpoJson(req);

      const resultado = await this.confirmarRegistro.ejecutar(
        cuerpo,
        {
          administradorId:
            contexto.usuario?.idInstitucional ?? null,
        }
      );

      return responder(res, 201, resultado);
    } catch (error) {
      return responderError(
        res,
        error,
        "No se pudo confirmar el registro."
      );
    }
  }

  // HU6-18: vista previa de la baja (no modifica nada).
  async vistaPreviaBaja(req, res, _contexto, idCrudo) {
    try {
      return responder(res, 200, await this.previsualizarBaja.ejecutar({ idInstitucional: decodificarId(idCrudo) }));
    } catch (error) {
      return responderError(res, error, "No se pudo calcular la reasignación de la baja.");
    }
  }

  // HU6-18: confirmar la baja y reasignar la cartera.
  async darDeBaja(req, res, contexto = {}, idCrudo) {
    try {
      const cuerpo = await leerCuerpoJson(req);
      const resultado = await this.confirmarBaja.ejecutar(
        { ...cuerpo, idInstitucional: decodificarId(idCrudo) },
        { administradorId: contexto.usuario?.idInstitucional ?? null }
      );
      return responder(res, 200, resultado);
    } catch (error) {
      return responderError(res, error, "No se pudo dar de baja al colaborador.");
    }
  }

  // EQ-70: activar o desactivar la recepción de casos especiales.
  async actualizarCasosEspeciales(req, res, _contexto, idCrudo) {
    try {
      let id;
      try {
        id = decodeURIComponent(idCrudo);
      } catch {
        return responder(res, 400, { codigo: "ID_INVALIDO", mensaje: "El ID no es válido." });
      }
      const cuerpo = await leerCuerpoJson(req);
      const resultado = await this.actualizarCasosEspecialesCasoUso.ejecutar(id, cuerpo.casosEspeciales);
      return responder(res, 200, resultado);
    } catch (error) {
      return responderError(res, error, "No se pudo actualizar la autorización de casos especiales.");
    }
  }

  // EQ-70: transferencia manual de un expediente entre campus.
  async transferirManual(req, res, contexto = {}) {
    try {
      const cuerpo = await leerCuerpoJson(req);
      const resultado = await this.transferirAspiranteManual.ejecutar(cuerpo, {
        administradorId: contexto.usuario?.idInstitucional ?? null,
      });
      return responder(res, 200, resultado);
    } catch (error) {
      return responderError(res, error, "No se pudo completar la transferencia manual del expediente.");
    }
  }
}
