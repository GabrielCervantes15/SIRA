
import assert from "node:assert/strict";

import {
  catalogoDemo,
  obtenerMensajes,
  buscarMensajes,
  buscarMensajePorId
} from "./catalogo.js";

const envios = obtenerMensajes("envio");
const respuestas = obtenerMensajes("respuesta");

assert.equal(envios.length, 3);
assert.equal(respuestas.length, 2);

assert.equal(obtenerMensajes("desconocida").length, 0);

assert.equal(
  buscarMensajes(envios, "reactivación").length,
  1
);

assert.equal(
  buscarMensajes(respuestas, "FAQ").length,
  1
);

assert.equal(
  buscarMensajes(envios, "texto inexistente").length,
  0
);

assert.equal(
  buscarMensajePorId("env-003", envios).nombre,
  "Reactivación de HU1"
);

assert.equal(
  buscarMensajePorId("no-existe", envios),
  null
);

const reactivacion = buscarMensajePorId("env-003", envios);

assert.deepEqual(reactivacion.variables, ["nombre", "carrera"]);
assert.match(reactivacion.texto, /{{nombre}}/);
assert.match(reactivacion.texto, /{{carrera}}/);

assert.ok(
  catalogoDemo.envio.every(mensaje =>
    Array.isArray(mensaje.reglas)
  )
);

assert.ok(
  catalogoDemo.respuesta.every(mensaje =>
    Array.isArray(mensaje.reglas)
  )
);

assert.equal(
  reactivacion.estadoDefinicion,
  "Texto aprobado por PO"
);

console.log("EQ-94: pruebas de categorías, búsqueda, selección, variables y reglas aprobadas.");
