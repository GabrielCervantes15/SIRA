/**
 * EQ-84 (HU1-8) · Mensaje predefinido personalizado desde el catálogo de HU8.
 * Texto aprobado: docs/decisiones/HU8-catalogo-mensajes.md §4.4 (reactivacion_hu1).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearServidor } from "../src/servidor.js";
import { crearModuloMonitoreo } from "../src/modulos/monitoreo/index.js";
import { crearModuloCatalogoMensajes } from "../src/modulos/mensajes-ia/index.js";
import {
  crearGeneradorMensajeReactivacion,
  ErrorMensajeReactivacion,
  ID_MENSAJE_REACTIVACION,
  personalizarTexto,
  TITULO_FALLO,
  valoresDelAspirante,
} from "../src/modulos/disparo-automatico/mensaje-reactivacion.js";

const TEXTO_APROBADO = "Hola, {aspirante}. Tu proceso de ingreso a {carrera} todavía puede continuar. ¿Necesitas ayuda para completar tus siguientes pasos?\n\nResponde a este mensaje y con gusto te orientaremos.";
const ANA = { id: "a1", nombreCompleto: "Ana Lucía Pérez", carreraSolicitada: "Ingeniería en Software" };

// ---------------------------------------------------------------------------
// Unitarias
// ---------------------------------------------------------------------------
test("[EQ-84] Variables del aspirante: nombre y carrera", () => {
  assert.deepEqual(valoresDelAspirante(ANA), { aspirante: "Ana", carrera: "Ingeniería en Software" });
  assert.deepEqual(valoresDelAspirante({ nombre: " Luis ", nombreCompleto: "Pedro Ruiz", carreraSolicitada: "  Licenciatura   en Administración " }),
    { aspirante: "Luis", carrera: "Licenciatura en Administración" });
  assert.deepEqual(valoresDelAspirante({ nombreCompleto: "   ", carreraSolicitada: null }), { aspirante: "", carrera: "" });
  assert.deepEqual(valoresDelAspirante(), { aspirante: "", carrera: "" });
});

test("[EQ-84] Arma el texto aprobado con nombre y carrera", () => {
  const r = personalizarTexto(TEXTO_APROBADO, ANA);
  assert.equal(r.enviable, true);
  assert.equal(r.texto, "Hola, Ana. Tu proceso de ingreso a Ingeniería en Software todavía puede continuar. ¿Necesitas ayuda para completar tus siguientes pasos?\n\nResponde a este mensaje y con gusto te orientaremos.");
  assert.doesNotMatch(r.texto, /[{}]/);
});

test("[EQ-84] Si falta una variable, no arma el mensaje e indica cuál falta", () => {
  const sinCarrera = personalizarTexto(TEXTO_APROBADO, { ...ANA, carreraSolicitada: "" });
  assert.deepEqual(
    { enviable: sinCarrera.enviable, codigo: sinCarrera.codigo, faltantes: sinCarrera.faltantes },
    { enviable: false, codigo: "VARIABLE_FALTANTE", faltantes: ["carrera"] },
  );
  assert.match(sinCarrera.motivo, /«carrera»/);
  assert.equal(sinCarrera.texto, undefined);

  assert.deepEqual(personalizarTexto(TEXTO_APROBADO, { id: "x" }).faltantes, ["aspirante", "carrera"]);
  // Una variable que el aspirante no puede aportar (p. ej. {valor}) también cuenta como faltante.
  assert.deepEqual(personalizarTexto("Hola {aspirante}, van {valor} días.", ANA).faltantes, ["valor"]);
  // La forma {{variable}} también se reconoce.
  assert.equal(personalizarTexto("Hola {{aspirante}} de {{carrera}}.", ANA).texto, "Hola Ana de Ingeniería en Software.");
});

test("[EQ-84] El catálogo de HU8 trae el mensaje de reactivación aprobado", async () => {
  const { repositorio } = crearModuloCatalogoMensajes();
  const mensaje = await repositorio.obtenerPorId(ID_MENSAJE_REACTIVACION);
  assert.equal(mensaje.texto, TEXTO_APROBADO);
  assert.equal(mensaje.categoria, "ENVIO");
  assert.deepEqual(mensaje.variables, ["aspirante", "carrera"]);

  const [r] = await crearGeneradorMensajeReactivacion({ repositorioCatalogo: repositorio }).personalizarLote([ANA]);
  assert.equal(r.enviable, true);
  assert.equal(r.mensajeId, "reactivacion_hu1");
  assert.match(r.texto, /^Hola, Ana\. Tu proceso de ingreso a Ingeniería en Software/);
});

test("[EQ-84] Lee el catálogo una sola vez por lote", async () => {
  const lecturas = [];
  const repositorioCatalogo = {
    async obtenerPorId(id) { lecturas.push(id); return { id, categoria: "ENVIO", texto: TEXTO_APROBADO }; },
  };
  const r = await crearGeneradorMensajeReactivacion({ repositorioCatalogo })
    .personalizarLote([ANA, { ...ANA, id: "a2", nombreCompleto: "" }, ANA]);
  assert.deepEqual(lecturas, ["reactivacion_hu1"]);
  assert.deepEqual(r.map((x) => x.enviable), [true, false, true]);
});

test("[EQ-84] Si el catálogo no tiene el mensaje de reactivación, falla con un error claro", async () => {
  for (const respuesta of [null, { id: "reactivacion_hu1", categoria: "RESPUESTA", texto: "x" }, { id: "reactivacion_hu1", categoria: "ENVIO", texto: " " }]) {
    const generador = crearGeneradorMensajeReactivacion({ repositorioCatalogo: { obtenerPorId: async () => respuesta } });
    await assert.rejects(generador.personalizarLote([ANA]), (e) => e instanceof ErrorMensajeReactivacion
      && e.codigo === "MENSAJE_REACTIVACION_NO_DISPONIBLE" && e.status === 409);
  }
  assert.throws(() => crearGeneradorMensajeReactivacion({}), /repositorio del catálogo/);
});

// ---------------------------------------------------------------------------
// HTTP: vista previa y envío
// ---------------------------------------------------------------------------
const LUNES_10AM = Date.parse("2026-11-16T17:00:00.000Z"); // dentro del horario de HU9
const QUERY = "?semaforos=ROJO,NARANJA&carreras=Ingenier%C3%ADa%20en%20Software,Licenciatura%20en%20Administraci%C3%B3n&inactividadValor=7&inactividadUnidad=DIAS";
const CUERPO = {
  semaforos: ["ROJO", "NARANJA"],
  carreras: ["Ingeniería en Software", "Licenciatura en Administración"],
  inactividadValor: 7, inactividadUnidad: "DIAS",
};

async function conServidor(opciones, fn) {
  const moduloMonitoreo = crearModuloMonitoreo();
  const historialMonitoreo = [];
  const servidor = crearServidor({
    port: 0, reloj: () => LUNES_10AM, duracionSesionMs: 86_400_000, moduloMonitoreo, historialMonitoreo,
    colaEnvioWhatsApp: { mensajesPorSegundo: 10_000 }, ...opciones,
  });
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const login = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: "00000252115", password: "Password123!" }),
    });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const previa = async () => (await fetch(`${base}/api/v1/disparo-mensajes/vista-previa${QUERY}`, { headers: { Cookie: cookie } })).json();
    const enviar = () => fetch(`${base}/api/v1/disparo-mensajes/enviar`, {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(CUERPO),
    });
    const enviados = () => servidor.colaEnvioWhatsApp.esperarInactiva();
    await fn({ repositorio: moduloMonitoreo.repositorio, historialMonitoreo, previa, enviar, enviados });
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
}

test("[EQ-84] HTTP: la vista previa muestra el mensaje de reactivación personalizado", async () => {
  await conServidor({}, async ({ previa }) => {
    const r = await previa();
    assert.ok(r.total > 0);
    assert.equal(r.mensajeReactivacionDisponible, true);
    assert.equal(r.sinDatosParaMensaje, 0);
    assert.ok(r.mensajesEjemplo.length > 0 && r.mensajesEjemplo.length <= 5);
    for (const texto of r.mensajesEjemplo) {
      assert.match(texto, /^Hola, [^{},]+\. Tu proceso de ingreso a (Ingeniería en Software|Licenciatura en Administración) todavía puede continuar\./);
    }
  });
});

test("[EQ-84] HTTP: envía el texto personalizado y, si falta el nombre, no envía y registra el fallo", async () => {
  await conServidor({}, async ({ repositorio, historialMonitoreo, previa, enviar, enviados }) => {
    const antes = await previa();
    const { aspirantes } = await repositorio.listarAspirantes({ colaboradorId: "00000252115", mostrarAceptados: true, limit: 1000 });
    const elegibles = aspirantes.filter((a) => ["ROJO", "NARANJA"].includes(a.semaforo) && !["ACEPTADA", "RECHAZADA"].includes(a.estadoSolicitud)
      && new Date(a.fechaUltimaActividad) <= new Date(LUNES_10AM - 7 * 86_400_000));
    const sinNombre = repositorio.aspirantes.find((a) => a.id === elegibles[0].id);
    const actividadOriginal = sinNombre.fechaUltimaActividad;
    sinNombre.nombreCompleto = "  ";

    const conFalta = await previa();
    assert.equal(conFalta.total, antes.total, "sigue contando: la falta de datos no cambia la elegibilidad");
    assert.equal(conFalta.sinDatosParaMensaje, 1);

    const mensajesAntes = repositorio.conversaciones.length;
    const res = await enviar();
    const cuerpo = await res.json();
    await enviados();
    assert.equal(res.status, 200);
    assert.equal(cuerpo.totalEnviados, antes.total - 1);
    assert.equal(cuerpo.noEnviados.total, 1);
    assert.deepEqual(cuerpo.noEnviados.detalles[0].faltantes, ["aspirante"]);
    assert.equal(cuerpo.noEnviados.detalles[0].aspiranteId, sinNombre.id);

    // Ningún mensaje para quien le faltaba el nombre; los demás llevan el texto aprobado sin variables sueltas.
    const nuevos = repositorio.conversaciones.slice(mensajesAntes);
    assert.equal(nuevos.length, antes.total - 1);
    assert.ok(nuevos.every((m) => m.aspiranteId !== sinNombre.id));
    assert.ok(nuevos.every((m) => /Tu proceso de ingreso a .+ todavía puede continuar/.test(m.contenido) && !/[{}]/.test(m.contenido)));

    // El fallo queda en el historial y no cuenta como actividad del aspirante.
    const fallo = historialMonitoreo.find((e) => e.aspiranteId === sinNombre.id);
    assert.equal(fallo.tipoEvento, "MENSAJE_AUTOMATICO"); // EQ-87: tipo nuevo de la línea de tiempo
    assert.equal(fallo.metadatos.resultado, "NO_ENVIABLE");
    assert.equal(fallo.titulo, TITULO_FALLO);
    assert.match(fallo.detalle, /«aspirante»/);
    assert.equal(repositorio.historial.filter((e) => e.aspiranteId === sinNombre.id && e.titulo === TITULO_FALLO).length, 1);
    assert.equal(sinNombre.fechaUltimaActividad, actividadOriginal);
  });
});

test("[EQ-84] HTTP: sin el mensaje de reactivación en el catálogo no se envía nada", async () => {
  const semilla = JSON.parse(readFileSync(new URL("../datos-semilla/mensajes-ia.json", import.meta.url), "utf8")).mensajes;
  const moduloCatalogoMensajes = crearModuloCatalogoMensajes({ mensajes: semilla.filter((m) => m.id !== "reactivacion_hu1") });

  await conServidor({ moduloCatalogoMensajes }, async ({ repositorio, previa, enviar }) => {
    const r = await previa();
    assert.ok(r.total > 0);
    assert.equal(r.mensajeReactivacionDisponible, false);
    assert.deepEqual(r.mensajesEjemplo, []);

    const mensajesAntes = repositorio.conversaciones.length;
    const res = await enviar();
    assert.equal(res.status, 409);
    assert.equal((await res.json()).codigo, "MENSAJE_REACTIVACION_NO_DISPONIBLE");
    assert.equal(repositorio.conversaciones.length, mensajesAntes);
  });
});
