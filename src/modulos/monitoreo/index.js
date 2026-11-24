/**
 * M├│dulo de Negocio: Monitoreo
 * Punto de entrada p├║blico e inyecci├│n de dependencias.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RepositorioMonitoreoMemoria } from "./infraestructura/repositorio-monitoreo-memoria.js";
import { ObtenerFiltrosCasoUso } from "./aplicacion/obtener-filtros.caso-uso.js";
import { ListarAspirantesCasoUso } from "./aplicacion/listar-aspirantes.caso-uso.js";
import { MonitoreoControlador } from "./infraestructura/controlador-monitoreo.js";
import { crearEnrutadorMonitoreo } from "./rutas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

function cargarDatosSemilla() {
  try {
    const ruta = path.join(ROOT, "datos-semilla/aspirantes.json");
    return JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    return { aspirantes: [], conversaciones: [] };
  }
}

export function crearModuloMonitoreo(opciones = {}) {
  const semilla = opciones.datosSemilla || cargarDatosSemilla();

  const repositorio =
    opciones.repositorio ||
    new RepositorioMonitoreoMemoria({
      aspirantes: semilla.aspirantes,
      conversaciones: semilla.conversaciones,
      asignacionesCarreras: opciones.asignacionesCarreras,
    });

  const obtenerFiltrosCasoUso = new ObtenerFiltrosCasoUso({
    repositorioMonitoreo: repositorio,
  });

  const listarAspirantesCasoUso = new ListarAspirantesCasoUso({
    repositorioMonitoreo: repositorio,
  });

  const controlador = new MonitoreoControlador({
    obtenerFiltrosCasoUso,
    listarAspirantesCasoUso,
  });

  const enrutador = crearEnrutadorMonitoreo({ controlador });

  return {
    repositorio,
    obtenerFiltrosCasoUso,
    listarAspirantesCasoUso,
    controlador,
    enrutador,
  };
}

export {
  ObtenerFiltrosCasoUso,
  ListarAspirantesCasoUso,
  MonitoreoControlador,
  RepositorioMonitoreoMemoria,
  crearEnrutadorMonitoreo,
};

// Interfaces de la tabla, semáforo y expediente desarrolladas en EQ-26/EQ-40.
export * from "./semaforo.js";
export * from "./textos.js";
export * from "./servicio.js";
export { crearRepositorioAspirantes } from "./repositorio-aspirantes.js";
