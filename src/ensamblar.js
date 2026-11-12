/**
 * Arma la aplicación con datos semilla: une Registro Escolar (simulado), el bus
 * de eventos, el repositorio de Aspirantes y el servicio de Monitoreo.
 *
 * Es el lugar donde se verá, más adelante, qué piezas simuladas se reemplazan
 * por las reales (RabbitMQ, PostgreSQL, API de Registro Escolar).
 */
import { readFile } from "node:fs/promises";
import { crearBusEnMemoria } from "./compartido/eventos/bus-en-memoria.js";
import { crearRegistroEscolarSimulado } from "./modulos/registro-escolar/index.js";
import { crearRepositorioAspirantes, crearServicioMonitoreo } from "./modulos/monitoreo/index.js";

const DIRECTORIO_SEMILLAS = new URL("../datos-semilla/", import.meta.url);

async function leerJson(nombre, directorio) {
  return JSON.parse(await readFile(new URL(nombre, directorio), "utf8"));
}

/**
 * @param {{ directorioSemillas?: URL, colaboradorId?: string }} [opciones]
 */
export async function construirAplicacion({
  directorioSemillas = DIRECTORIO_SEMILLAS,
  colaboradorId = "col-001",
} = {}) {
  const semillaAspirantes = await leerJson("aspirantes.json", directorioSemillas);
  const semillaRegistro = await leerJson("registro-escolar.json", directorioSemillas);

  const bus = crearBusEnMemoria();
  const registroEscolar = crearRegistroEscolarSimulado({
    solicitudes: semillaRegistro.solicitudes,
    cambios: semillaRegistro.cambios,
    bus,
  });

  // El estado de la solicitud viene de Registro Escolar.
  const estados = [];
  for (const aspirante of semillaAspirantes.aspirantes) {
    const estado = await registroEscolar.obtenerEstadoSolicitud(aspirante.id);
    if (!estado) {
      throw new Error(`Registro Escolar no tiene la solicitud de ${aspirante.id}: revisa los datos semilla.`);
    }
    estados.push(estado);
  }

  const repositorio = crearRepositorioAspirantes({
    aspirantes: semillaAspirantes.aspirantes,
    actividades: semillaAspirantes.actividades,
    estados,
  });

  // Los cambios posteriores llegan por el bus.
  bus.suscribir("registro_escolar.#", (evento) => {
    const resultado = repositorio.aplicarCambioEstado(evento);
    if (!resultado.aplicado) console.warn(`[monitoreo] evento ignorado: ${resultado.motivo}`);
  });

  const colaborador = semillaAspirantes.colaboradores.find((c) => c.id === colaboradorId);
  if (!colaborador) throw new Error(`No existe el colaborador ${colaboradorId} en los datos semilla.`);

  return {
    bus,
    registroEscolar,
    repositorio,
    servicio: crearServicioMonitoreo({ repositorio }),
    colaborador,
  };
}
