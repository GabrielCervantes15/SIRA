import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crearProveedorWhatsAppSimulado, ErrorWhatsApp, ESTADOS_ENTREGA_WHATSAPP as E,
  implementaProveedorWhatsApp, validarSolicitudPlantilla,
} from "../src/modulos/whatsapp/index.js";

const solicitud = () => ({ telefono: "+12025550123", plantilla: "reactivacion_prueba", idioma: "es_MX", parametros: ["Aspirante QA", "Carrera QA"] });
const codigo = (esperado, reintentable = false) => (e) => e instanceof ErrorWhatsApp && e.codigo === esperado && e.reintentable === reintentable;

function crear() {
  let id = 0;
  return crearProveedorWhatsAppSimulado({ generarId: () => ++id, reloj: () => new Date("2026-11-25T00:00:00Z") });
}

test("[EQ-114] el adaptador cumple el puerto y rechaza objetos incompletos", () => {
  assert.equal(implementaProveedorWhatsApp(crear()), true);
  assert.equal(implementaProveedorWhatsApp({ enviarPlantilla() {} }), false);
  assert.equal(implementaProveedorWhatsApp(null), false);
});

test("[EQ-114] acepta plantilla y devuelve identificador, fecha y estado ENVIADO", async () => {
  const proveedor = crear();
  const resultado = await proveedor.enviarPlantilla(solicitud());
  assert.deepEqual(resultado, { whatsappMessageId: "sim-wa-1", estadoEntrega: E.ENVIADO, fechaActualizacion: "2026-11-25T00:00:00.000Z", motivoFalla: null });
  assert.deepEqual(await proveedor.obtenerEstadoEntrega(resultado.whatsappMessageId), resultado);
});

test("[EQ-114] cada envío tiene ID independiente y no altera la solicitud", async () => {
  const proveedor = crear();
  const datos = solicitud();
  const original = structuredClone(datos);
  const resultados = await Promise.all([proveedor.enviarPlantilla(datos), proveedor.enviarPlantilla(datos)]);
  assert.notEqual(resultados[0].whatsappMessageId, resultados[1].whatsappMessageId);
  assert.deepEqual(datos, original);
});

test("[EQ-114] valida teléfonos, plantilla, idioma y parámetros antes de enviar", async () => {
  const proveedor = crear();
  for (const invalido of [null, [], {}, { ...solicitud(), telefono: "6441234567" }, { ...solicitud(), telefono: "+0123456789" }, { ...solicitud(), plantilla: "Nombre Inválido" }, { ...solicitud(), idioma: "" }, { ...solicitud(), parametros: [null] }, { ...solicitud(), parametros: [" "] }, { ...solicitud(), parametros: new Array(1) }]) {
    await assert.rejects(proveedor.enviarPlantilla(invalido), codigo("SOLICITUD_INVALIDA"));
  }
  assert.equal((await proveedor.enviarPlantilla(solicitud())).whatsappMessageId, "sim-wa-1");
});

test("[EQ-114] admite plantillas sin parámetros y devuelve una copia de los valores", () => {
  const datos = solicitud();
  const normalizado = validarSolicitudPlantilla(datos);
  normalizado.parametros.push("extra");
  assert.equal(datos.parametros.length, 2);
  delete datos.parametros;
  assert.deepEqual(validarSolicitudPlantilla(datos).parametros, []);
});

test("[EQ-114] consulta un ID desconocido sin inventar un estado", async () => {
  const proveedor = crear();
  assert.equal(await proveedor.obtenerEstadoEntrega("sim-wa-desconocido"), null);
  await assert.rejects(proveedor.obtenerEstadoEntrega(""), codigo("SOLICITUD_INVALIDA"));
});

test("[EQ-114] entrega y lectura avanzan sin retroceder y duplicados son inocuos", async () => {
  const proveedor = crear();
  const { whatsappMessageId: id } = await proveedor.enviarPlantilla(solicitud());
  const entregado = proveedor.simularEstadoEntrega(id, E.ENTREGADO);
  assert.equal(entregado.estadoEntrega, E.ENTREGADO);
  assert.deepEqual(proveedor.simularEstadoEntrega(id, E.ENTREGADO), entregado);
  proveedor.simularEstadoEntrega(id, E.LEIDO);
  assert.equal((await proveedor.obtenerEstadoEntrega(id)).estadoEntrega, E.LEIDO);
  assert.throws(() => proveedor.simularEstadoEntrega(id, E.ENVIADO), codigo("ESTADO_INVALIDO"));
  assert.throws(() => proveedor.simularEstadoEntrega(id, E.FALLIDO, "tarde"), codigo("ESTADO_INVALIDO"));
});

test("[EQ-114] fallo de entrega persiste con motivo y no puede pasar a leído", async () => {
  const proveedor = crear();
  const { whatsappMessageId: id } = await proveedor.enviarPlantilla(solicitud());
  assert.throws(() => proveedor.simularEstadoEntrega(id, E.FALLIDO), codigo("ESTADO_INVALIDO"));
  proveedor.simularEstadoEntrega(id, E.FALLIDO, "Destino de prueba no disponible");
  const estado = await proveedor.obtenerEstadoEntrega(id);
  assert.equal(estado.estadoEntrega, E.FALLIDO);
  assert.equal(estado.motivoFalla, "Destino de prueba no disponible");
  assert.throws(() => proveedor.simularEstadoEntrega(id, E.LEIDO), codigo("ESTADO_INVALIDO"));
  assert.throws(() => proveedor.simularEstadoEntrega("inexistente", E.LEIDO), codigo("MENSAJE_NO_ENCONTRADO"));
});

test("[EQ-114] indisponibilidad temporal es reintentable y no registra envíos", async () => {
  const proveedor = crear();
  proveedor.simularIndisponibilidad(true);
  await assert.rejects(proveedor.enviarPlantilla(solicitud()), codigo("SERVICIO_NO_DISPONIBLE", true));
  await assert.rejects(proveedor.obtenerEstadoEntrega("sim-wa-1"), codigo("SERVICIO_NO_DISPONIBLE", true));
  proveedor.simularIndisponibilidad(false);
  assert.equal(await proveedor.obtenerEstadoEntrega("sim-wa-1"), null);
  assert.equal((await proveedor.enviarPlantilla(solicitud())).whatsappMessageId, "sim-wa-1");
});

test("[EQ-114] rechazo permanente de plantilla se distingue de indisponibilidad", async () => {
  const proveedor = crear();
  proveedor.simularRechazoSiguiente();
  await assert.rejects(proveedor.enviarPlantilla(solicitud()), codigo("ENVIO_RECHAZADO"));
  assert.equal(await proveedor.obtenerEstadoEntrega("sim-wa-1"), null);
  assert.equal((await proveedor.enviarPlantilla(solicitud())).estadoEntrega, E.ENVIADO);
});

test("[EQ-114] copias de estado no permiten alterar datos internos", async () => {
  const proveedor = crear();
  const enviado = await proveedor.enviarPlantilla(solicitud());
  enviado.estadoEntrega = E.LEIDO;
  const estado = await proveedor.obtenerEstadoEntrega(enviado.whatsappMessageId);
  estado.estadoEntrega = E.FALLIDO;
  assert.equal((await proveedor.obtenerEstadoEntrega(enviado.whatsappMessageId)).estadoEntrega, E.ENVIADO);
});

test("[EQ-114] instancias aisladas y reinicio limpio para CI", async () => {
  const a = crearProveedorWhatsAppSimulado();
  const b = crearProveedorWhatsAppSimulado();
  const enviado = await a.enviarPlantilla(solicitud());
  assert.equal(await b.obtenerEstadoEntrega(enviado.whatsappMessageId), null);
  a.simularIndisponibilidad(true);
  a.simularRechazoSiguiente();
  a.reiniciar();
  assert.equal(await a.obtenerEstadoEntrega(enviado.whatsappMessageId), null);
  assert.equal((await a.enviarPlantilla(solicitud())).estadoEntrega, E.ENVIADO);
});
