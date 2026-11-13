/**
 * Servidor HTTP mínimo (sin dependencias): sirve el front end y la API REST.
 *
 *   GET  /api/sesion                         colaborador autenticado (provisional, hasta AUT-1)
 *   GET  /api/aspirantes                     lista con semáforo, orden y paginación
 *   GET  /api/aspirantes/:id                 detalle del aspirante
 *   GET  /api/aspirantes/:id/actividades     historial (desde, hasta)
 *   POST /api/demo/cambio-estado             SOLO DEMO: simula un cambio en Registro Escolar
 *
 * Con `demo: true`, la lista acepta ?simular=error|vacio|lento para probar los
 * estados de la tabla.
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ErrorMonitoreo } from "../modulos/monitoreo/servicio.js";

const TIPOS_MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const ESTADO_HTTP = { NO_ENCONTRADO: 404, SIN_PERMISO: 403, PARAMETRO_INVALIDO: 400 };
const LIMITE_CUERPO = 10_000;

const CABECERAS_SEGURIDAD = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'",
};

function responderJson(res, estado, cuerpo) {
  res.writeHead(estado, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...CABECERAS_SEGURIDAD,
  });
  res.end(JSON.stringify(cuerpo));
}

function responderError(res, estado, codigo, mensaje) {
  responderJson(res, estado, { error: { codigo, mensaje } });
}

/** Convierte "5" en 5; si el parámetro no viene, undefined; si no es número, NaN (el servicio lo rechaza). */
function entero(valor) {
  return valor === null ? undefined : Number(valor);
}

function leerCuerpoJson(req) {
  return new Promise((resolve, reject) => {
    let texto = "";
    req.on("data", (trozo) => {
      texto += trozo;
      if (texto.length > LIMITE_CUERPO) {
        reject(new ErrorMonitoreo("PARAMETRO_INVALIDO", "El cuerpo de la petición es demasiado grande."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(texto ? JSON.parse(texto) : {});
      } catch {
        reject(new ErrorMonitoreo("PARAMETRO_INVALIDO", "El cuerpo debe ser JSON válido."));
      }
    });
    req.on("error", reject);
  });
}

/**
 * @param {Object} opciones
 * @param {ReturnType<typeof import("../modulos/monitoreo/servicio.js").crearServicioMonitoreo>} opciones.servicio
 * @param {{ id: string, nombre: string }} opciones.colaborador  Colaborador autenticado (provisional).
 * @param {string} opciones.directorioFrontend
 * @param {any} [opciones.registroEscolar]  Adaptador simulado (solo para el modo demo).
 * @param {boolean} [opciones.demo]
 */
export function crearServidor({ servicio, colaborador, directorioFrontend, registroEscolar = null, demo = false }) {
  const raiz = path.resolve(directorioFrontend);

  async function manejarApi(req, res, url) {
    const partes = url.pathname.split("/").filter(Boolean).map(decodeURIComponent); // ["api", ...]

    if (req.method === "POST" && demo && registroEscolar && url.pathname === "/api/demo/cambio-estado") {
      const cuerpo = await leerCuerpoJson(req);
      try {
        const evento = await registroEscolar.simularCambioDeEstado({
          aspiranteId: cuerpo.aspiranteId,
          estadoNuevo: cuerpo.estadoNuevo,
          motivoRechazo: cuerpo.motivoRechazo || null,
        });
        return responderJson(res, 200, { evento });
      } catch (error) {
        return responderError(res, 400, "CAMBIO_INVALIDO", error.message);
      }
    }

    if (req.method !== "GET") {
      return responderError(res, 405, "METODO_NO_PERMITIDO", "Método no permitido.");
    }

    if (partes.length === 2 && partes[1] === "sesion") {
      return responderJson(res, 200, { colaboradorId: colaborador.id, nombre: colaborador.nombre });
    }

    if (partes[1] === "aspirantes") {
      // GET /api/aspirantes
      if (partes.length === 2) {
        const p = url.searchParams;
        if (demo && p.get("simular") === "error") {
          return responderError(res, 500, "ERROR_SIMULADO", "Error simulado para probar el estado de error.");
        }
        if (demo && p.get("simular") === "lento") {
          await new Promise((resolver) => setTimeout(resolver, 1800));
        }
        if (demo && p.get("simular") === "vacio") {
          return responderJson(res, 200, {
            datos: [],
            paginacion: { pagina: 1, tamano: 13, totalResultados: 0, totalPaginas: 0 },
          });
        }
        const resultado = servicio.listarAspirantes(colaborador.id, {
          pagina: entero(p.get("pagina")),
          tamano: entero(p.get("tamano")),
          ordenarPor: p.get("ordenarPor") ?? undefined,
          direccion: p.get("direccion") ?? undefined,
          incluirCerrados: p.get("incluirCerrados") === "true",
        });
        return responderJson(res, 200, resultado);
      }
      // GET /api/aspirantes/:id
      if (partes.length === 3) {
        return responderJson(res, 200, servicio.obtenerDetalle(colaborador.id, partes[2]));
      }
      // GET /api/aspirantes/:id/actividades
      if (partes.length === 4 && partes[3] === "actividades") {
        const p = url.searchParams;
        return responderJson(
          res,
          200,
          servicio.obtenerActividades(colaborador.id, partes[2], {
            desde: p.get("desde") ?? undefined,
            hasta: p.get("hasta") ?? undefined,
          }),
        );
      }
    }

    return responderError(res, 404, "RUTA_NO_ENCONTRADA", "La ruta de la API no existe.");
  }

  async function servirEstatico(req, res, url) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end();
    }
    const solicitada = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const ruta = path.resolve(path.join(raiz, solicitada));

    // Evita salirse de la carpeta del front end (../../etc/passwd).
    if (ruta !== raiz && !ruta.startsWith(raiz + path.sep)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", ...CABECERAS_SEGURIDAD });
      return res.end("Acceso denegado");
    }

    try {
      const contenido = await readFile(ruta);
      res.writeHead(200, {
        "Content-Type": TIPOS_MIME[path.extname(ruta).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
        ...CABECERAS_SEGURIDAD,
      });
      res.end(req.method === "HEAD" ? undefined : contenido);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...CABECERAS_SEGURIDAD });
      res.end("No encontrado");
    }
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname.startsWith("/api/")) return await manejarApi(req, res, url);
      return await servirEstatico(req, res, url);
    } catch (error) {
      if (error instanceof ErrorMonitoreo) {
        return responderError(res, ESTADO_HTTP[error.codigo] ?? 400, error.codigo, error.message);
      }
      console.error("[servidor] error inesperado:", error);
      return responderError(res, 500, "ERROR_INTERNO", "Ocurrió un error inesperado.");
    }
  });
}
