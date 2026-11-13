/**
 * Demo del contrato de Registro Escolar (EQ-13).
 * Uso: node scripts/demo-registro-escolar.js
 */
import { readFile } from "node:fs/promises";
import { crearBusEnMemoria } from "../src/compartido/eventos/bus-en-memoria.js";
import {
  ESTADOS_SOLICITUD,
  crearRegistroEscolarSimulado,
} from "../src/modulos/registro-escolar/index.js";

const ruta = new URL("../datos-semilla/registro-escolar.json", import.meta.url);
const semilla = JSON.parse(await readFile(ruta, "utf8"));

const bus = crearBusEnMemoria();
bus.suscribir("registro_escolar.#", (evento, clave) => {
  console.log(`\n[bus] ${clave}`);
  console.log(JSON.stringify(evento, null, 2));
});

const registroEscolar = crearRegistroEscolarSimulado({
  solicitudes: semilla.solicitudes,
  cambios: semilla.cambios,
  bus,
});

console.log("Estado de asp-004:", await registroEscolar.obtenerEstadoSolicitud("asp-004"));

await registroEscolar.simularCambioDeEstado({
  aspiranteId: "asp-004",
  estadoNuevo: ESTADOS_SOLICITUD.EN_REVISION,
});
await registroEscolar.simularCambioDeEstado({
  aspiranteId: "asp-001",
  estadoNuevo: ESTADOS_SOLICITUD.CONSTANCIA_RECHAZADA,
  motivoRechazo: "le faltó una hoja con las calificaciones del primer semestre",
});

console.log("\nEstado de asp-001 después:", await registroEscolar.obtenerEstadoSolicitud("asp-001"));
console.log("Cambios desde 2026-11-05:", (await registroEscolar.obtenerCambiosDesde("2026-11-05T00:00:00Z")).length);

registroEscolar.simularIndisponibilidad(true);
try {
  await registroEscolar.obtenerEstadoSolicitud("asp-001");
} catch (error) {
  console.log(`\nError simulado: [${error.codigo}] ${error.message}`);
}
