import { test } from "node:test";
import assert from "node:assert/strict";
import { coincide, crearBusEnMemoria } from "../src/compartido/eventos/bus-en-memoria.js";

const CLAVE = "registro_escolar.solicitud.estado_cambiado";

test("coincide: clave exacta", () => {
  assert.equal(coincide(CLAVE, CLAVE), true);
  assert.equal(coincide(CLAVE, "registro_escolar.solicitud.otro"), false);
});

test('coincide: "*" reemplaza exactamente una palabra', () => {
  assert.equal(coincide("registro_escolar.*.estado_cambiado", CLAVE), true);
  assert.equal(coincide("registro_escolar.*", CLAVE), false);
  assert.equal(coincide("*.solicitud.*", CLAVE), true);
});

test('coincide: "#" reemplaza cero o más palabras', () => {
  assert.equal(coincide("registro_escolar.#", CLAVE), true);
  assert.equal(coincide("registro_escolar.#", "registro_escolar"), true);
  assert.equal(coincide("#", CLAVE), true);
  assert.equal(coincide("#.estado_cambiado", CLAVE), true);
  assert.equal(coincide("alertas.#", CLAVE), false);
});

test("publicar entrega solo a los suscriptores cuyo patrón coincide", async () => {
  const bus = crearBusEnMemoria();
  const recibidos = [];
  bus.suscribir("registro_escolar.#", (e) => recibidos.push(["re", e]));
  bus.suscribir("alertas.#", (e) => recibidos.push(["al", e]));

  await bus.publicar(CLAVE, { n: 1 });

  assert.deepEqual(recibidos, [["re", { n: 1 }]]);
  assert.equal(bus.publicados().length, 1);
});

test("la función devuelta por suscribir cancela la suscripción", async () => {
  const bus = crearBusEnMemoria();
  let llamadas = 0;
  const cancelar = bus.suscribir("#", () => { llamadas += 1; });

  await bus.publicar(CLAVE, {});
  cancelar();
  await bus.publicar(CLAVE, {});

  assert.equal(llamadas, 1);
});

test("un error en un consumidor no afecta a quien publica ni a los demás", async (t) => {
  t.mock.method(console, "error", () => {});
  const bus = crearBusEnMemoria();
  let llego = false;
  bus.suscribir("#", () => { throw new Error("falla del consumidor"); });
  bus.suscribir("#", () => { llego = true; });

  await assert.doesNotReject(bus.publicar(CLAVE, {}));
  assert.equal(llego, true);
});
