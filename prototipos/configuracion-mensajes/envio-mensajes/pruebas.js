import assert from "node:assert/strict";
import { obtenerLote, validarFiltros, fechaCorte } from "../../../frontend/js/envio-mensajes-validaciones.js";

const ahora = new Date("2026-11-24T12:00:00");
const filtros = {
  semaforos: ["ROJO"],
  carreras: ["Ingeniería en Software"],
  numero: 7,
  unidad: "dias",
  correo: false,
};
const aspirante = {
  id: "A1", enCartera: true, semaforo: "ROJO",
  carrera: "Ingeniería en Software", estado: "EN_PROCESO",
  ultimaActividad: "2026-11-10T12:00:00",
  horasDesdeContacto: 72, whatsappValido: true,
  consentimientoWhatsapp: true, correoValido: true,
};
assert.equal(validarFiltros(filtros), true);
assert.equal(obtenerLote([aspirante, aspirante], filtros, ahora).length, 1);
for (const cambio of [
  { enCartera: false }, { semaforo: "VERDE" }, { estado: "ACEPTADA" },
  { estado: "RECHAZADA" }, { ultimaActividad: "2026-11-20T12:00:00" },
  { horasDesdeContacto: 47 }, { consentimientoWhatsapp: false, whatsappValido: true },
]) {
  assert.equal(obtenerLote([{ ...aspirante, ...cambio }], filtros, ahora).length, 0);
}
assert.equal(validarFiltros({ ...filtros, numero: 0 }), false);
assert.equal(validarFiltros({ ...filtros, carreras: [] }), false);
assert.equal(obtenerLote([aspirante], { ...filtros, correo: true }, ahora).length, 1);
assert.equal(fechaCorte(1, "meses", ahora).getMonth(), 9);
assert.equal(obtenerLote([aspirante], { ...filtros, unidad: "semanas", numero: 2 }, ahora).length, 1);
console.log("EQ-78: pruebas de filtros, elegibilidad, exclusiones y canales aprobadas");
