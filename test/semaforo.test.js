import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTADOS_SOLICITUD as E } from "../src/modulos/registro-escolar/index.js";
import { NIVELES_SEMAFORO as N, SEVERIDAD, calcularSemaforo } from "../src/modulos/monitoreo/index.js";

const nivel = (estado, contactoIniciado) => calcularSemaforo({ estado, contactoIniciado }).nivel;

test("solicitud aceptada es verde, haya o no contacto", () => {
  assert.equal(nivel(E.ACEPTADA, true), N.VERDE);
  assert.equal(nivel(E.ACEPTADA, false), N.VERDE);
});

test("solicitud rechazada de forma definitiva es roja", () => {
  assert.equal(nivel(E.RECHAZADA, true), N.ROJO);
  assert.equal(nivel(E.RECHAZADA, false), N.ROJO);
});

test("sin contacto de un colaborador es rojo en cualquier estado en proceso", () => {
  for (const estado of [E.RECIBIDA, E.EN_REVISION, E.CONSTANCIA_RECHAZADA]) {
    const r = calcularSemaforo({ estado, contactoIniciado: false });
    assert.equal(r.nivel, N.ROJO, estado);
    assert.equal(r.texto, "No se ha iniciado contacto con el aspirante", estado);
  }
});

test("con contacto: constancia rechazada es roja, recibida es naranja y en revisión es amarilla", () => {
  assert.equal(nivel(E.CONSTANCIA_RECHAZADA, true), N.ROJO);
  assert.equal(nivel(E.RECIBIDA, true), N.NARANJA);
  assert.equal(nivel(E.EN_REVISION, true), N.AMARILLO);
});

test("la falta de contacto tiene prioridad sobre la constancia rechazada (como en el Figma)", () => {
  const r = calcularSemaforo({ estado: E.CONSTANCIA_RECHAZADA, contactoIniciado: false });
  assert.equal(r.texto, "No se ha iniciado contacto con el aspirante");
});

test("un estado desconocido se marca en rojo para que alguien lo revise", () => {
  const r = calcularSemaforo({ estado: "OTRO", contactoIniciado: true });
  assert.equal(r.nivel, N.ROJO);
  assert.match(r.texto, /no reconocido/);
});

test("la severidad ordena de rojo (más atención) a verde", () => {
  assert.ok(SEVERIDAD.ROJO > SEVERIDAD.NARANJA);
  assert.ok(SEVERIDAD.NARANJA > SEVERIDAD.AMARILLO);
  assert.ok(SEVERIDAD.AMARILLO > SEVERIDAD.VERDE);
});
