/**
 * Controlador HTTP del catálogo de mensajes (HU 8). Solo traduce HTTP ↔ casos de uso.
 * La sesión (cualquier rol con acceso al CRM) la verifica el servidor antes de llegar aquí.
 */
function responder(res, status, cuerpo, extra = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
  res.end(JSON.stringify(cuerpo));
}

function responderError(res, error, generico) {
  if (error?.status && error?.codigo) return responder(res, error.status, { codigo: error.codigo, mensaje: error.message });
  console.error("[mensajes-ia]", error);
  return responder(res, 500, { codigo: "ERROR_INTERNO", mensaje: generico });
}

export class CatalogoMensajesControlador {
  constructor({ listarMensajes, obtenerDetalleMensaje }) {
    this.listarMensajes = listarMensajes;
    this.obtenerDetalleMensaje = obtenerDetalleMensaje;
  }

  /** GET /api/v1/mensajes-ia?categoria=&semaforo=&busqueda=&pagina=&tamano= (EQ-96) */
  async listar(req, res) {
    try {
      const q = new URL(req.url, "http://localhost").searchParams;
      return responder(res, 200, await this.listarMensajes.ejecutar({
        categoria: q.get("categoria"),
        semaforo: q.get("semaforo"),
        busqueda: q.get("busqueda"),
        pagina: q.get("pagina"),
        tamano: q.get("tamano"),
      }));
    } catch (error) {
      return responderError(res, error, "No se pudo consultar el catálogo de mensajes.");
    }
  }

  /** GET /api/v1/mensajes-ia/:id?aspirante=&carrera=&valor=&magnitud= (EQ-97) */
  async detalle(req, res, idCrudo) {
    try {
      let id;
      try {
        id = decodeURIComponent(idCrudo);
      } catch {
        return responder(res, 400, { codigo: "ID_INVALIDO", mensaje: "El identificador del mensaje no es válido." });
      }
      const q = new URL(req.url, "http://localhost").searchParams;
      return responder(res, 200, await this.obtenerDetalleMensaje.ejecutar({
        id,
        valores: { aspirante: q.get("aspirante"), carrera: q.get("carrera"), valor: q.get("valor"), magnitud: q.get("magnitud") },
      }));
    } catch (error) {
      return responderError(res, error, "No se pudo consultar el mensaje.");
    }
  }

  /** Cualquier escritura: el catálogo es de solo lectura para todos (EQ-93). */
  soloLectura(_req, res) {
    return responder(
      res, 405,
      { codigo: "SOLO_LECTURA", mensaje: "El catálogo de mensajes es de solo lectura." },
      { Allow: "GET" },
    );
  }
}
