/**
 * EQ-90 (HU1-14) · Pruebas unitarias de HU1: lote, filtros, horario, idempotencia, mensaje y componentes.
 *
 * Cubre, punto por punto con el ticket: combinaciones de filtros, exclusión de verde,
 * conversión de unidades, contacto previo, validación de horario, idempotencia, armado del
 * mensaje y componentes de filtros y botón. Las reglas vienen de EQ-77
 * (docs/decisiones/HU1-reglas-lote-envio.md). Sin red, sin base de datos y sin navegador.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularFechaCorte, crearServicioVistaPreviaLote, normalizarFiltrosLote, validarFiltrosVistaPrevia,
} from "../src/modulos/disparo-automatico/vista-previa-lote.js";
import { construirLote, huellaPeticion, leerClaveIdempotencia, resumenLote } from "../src/modulos/disparo-automatico/dominio/lote-envio.js";
import { personalizarTexto, valoresDelAspirante } from "../src/modulos/disparo-automatico/mensaje-reactivacion.js";
import { CrearLoteEnvioCasoUso } from "../src/modulos/disparo-automatico/aplicacion/crear-lote-envio.caso-uso.js";
import { RepositorioLotesMemoria } from "../src/modulos/disparo-automatico/infraestructura/repositorio-lotes-memoria.js";
import { crearBusEnMemoria } from "../src/compartido/eventos/bus-en-memoria.js";
import { crearModuloMensajes } from "../src/modulos/mensajes/index.js";
import { crearValidadorHorarioEnvio } from "../src/modulos/mensajes/aplicacion/validar-horario-envio.js";
import {
  botonEnviarDeshabilitado, debeRemarcarse, filtrosDesdeFormulario, resumenEnvio, TEXTO_SIN_ASPIRANTES,
  textoConfirmacion, textoConteo,
} from "../frontend/js/disparo-logica.js";

const AHORA = new Date("2026-11-16T17:00:00.000Z"); // lunes 10:00 en Hermosillo (UTC−7)
const HORA = 3_600_000;
const DIA = 24 * HORA;
const HACE = (ms) => new Date(AHORA.getTime() - ms).toISOString();

// ---------------------------------------------------------------------------
// Cartera de prueba: todas las combinaciones de semáforo, carrera, estado y actividad.
// ---------------------------------------------------------------------------
const SEMAFOROS = ["VERDE", "AMARILLO", "NARANJA", "ROJO"];
const CARRERAS = ["Software", "Administración"];
const ESTADOS = ["RECIBIDA", "EN_REVISION", "ACEPTADA", "RECHAZADA"];
const ACTIVIDAD = { reciente: HACE(2 * DIA), semana: HACE(7 * DIA), vieja: HACE(40 * DIA) };

const CARTERA = [];
for (const semaforo of SEMAFOROS) for (const carrera of CARRERAS) for (const estado of ESTADOS) for (const [clave, fecha] of Object.entries(ACTIVIDAD)) {
  CARTERA.push({
    id: `${semaforo}-${carrera}-${estado}-${clave}`, colaboradorId: "c1", semaforo, carreraSolicitada: carrera,
    estadoSolicitud: estado, fechaUltimaActividad: fecha, nombreCompleto: "Ana Pérez", telefono: "+526440000000",
  });
}
const AJENO = { ...CARTERA[30], id: "ajeno", colaboradorId: "c2" };

function repositorio({ aspirantes = [...CARTERA, AJENO], conversaciones = [], semaforosHU27 = ["Verde", "Amarillo", "Naranja", "Rojo"] } = {}) {
  return {
    obtenerFiltrosColaborador: async () => ({ semaforos: semaforosHU27, carreras: CARRERAS }),
    listarAspirantes: async ({ colaboradorId }) => ({ aspirantes: aspirantes.filter((a) => a.colaboradorId === colaboradorId) }),
    obtenerConversacionAspirante: async (id) => conversaciones.filter((m) => m.aspiranteId === id),
  };
}
const servicio = (repo = repositorio(), configuracion = null) => crearServicioVistaPreviaLote({
  repositorioMonitoreo: repo, reloj: () => AHORA,
  interfazLecturaConfiguracion: configuracion ? { obtenerConfiguracionVigente: () => configuracion } : null,
});

/** Oráculo independiente de las reglas de EQ-77 (§3) para comparar con el servicio. */
function esperado({ semaforos, carreras, inactividadValor, inactividadUnidad }) {
  const corte = calcularFechaCorte(inactividadValor, inactividadUnidad, AHORA).getTime();
  return CARTERA.filter((a) => a.semaforo !== "VERDE" && !["ACEPTADA", "RECHAZADA"].includes(a.estadoSolicitud)
    && semaforos.includes(a.semaforo) && carreras.includes(a.carreraSolicitada)
    && Date.parse(a.fechaUltimaActividad) <= corte).map((a) => a.id).sort();
}

const subconjuntos = (lista) => lista.reduce((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]]).filter((s) => s.length);

// ---------------------------------------------------------------------------
// 1. Combinaciones de filtros
// ---------------------------------------------------------------------------
test("[EQ-90] Combinaciones de filtros: cada semáforo × carrera × inactividad cuenta lo mismo que las reglas de EQ-77", async () => {
  const s = servicio();
  let combinaciones = 0;
  for (const semaforos of subconjuntos(["AMARILLO", "NARANJA", "ROJO"])) {
    for (const carreras of subconjuntos(CARRERAS)) {
      for (const [inactividadValor, inactividadUnidad] of [[1, "DIAS"], [7, "DIAS"], [1, "SEMANAS"], [1, "MESES"], [2, "MESES"]]) {
        const filtros = { semaforos, carreras, inactividadValor, inactividadUnidad };
        const r = await s.calcular("c1", filtros);
        assert.equal(r.valido, true, JSON.stringify(filtros));
        assert.deepEqual(r.elegibles.map((a) => a.id).sort(), esperado(filtros), JSON.stringify(filtros));
        assert.equal(r.total, r.elegibles.length);
        combinaciones += 1;
      }
    }
  }
  assert.equal(combinaciones, 7 * 3 * 5);
});

test("[EQ-90] Combinaciones de filtros: nunca entran aceptadas, rechazadas ni aspirantes de otra cartera", async () => {
  const r = await servicio().calcular("c1", { semaforos: ["AMARILLO", "NARANJA", "ROJO"], carreras: CARRERAS, inactividadValor: 1, inactividadUnidad: "DIAS" });
  assert.ok(r.elegibles.every((a) => !["ACEPTADA", "RECHAZADA"].includes(a.estadoSolicitud)));
  assert.ok(!r.elegibles.some((a) => a.id === "ajeno"));
  assert.equal(r.excluidos.estadoSolicitud, 2 * 3 * 2 * 3, "aceptadas y rechazadas de los tres colores no verdes");
});

test("[EQ-90] Combinaciones de filtros: se exige al menos un semáforo y una carrera de las opciones", () => {
  const opciones = { semaforos: ["AMARILLO", "NARANJA", "ROJO"], carreras: CARRERAS };
  const v = (f) => validarFiltrosVistaPrevia(normalizarFiltrosLote({ semaforos: "ROJO", carreras: "Software", inactividadValor: 7, inactividadUnidad: "DIAS", ...f }), opciones);
  assert.equal(v({}).valido, true);
  assert.ok(v({ semaforos: "" }).errores.semaforos);
  assert.ok(v({ carreras: "" }).errores.carreras);
  assert.ok(v({ carreras: "Medicina" }).errores.carreras);
  assert.ok(v({ semaforos: "AZUL" }).errores.semaforos);
  const todos = v({ semaforos: "", carreras: "", inactividadValor: 0, inactividadUnidad: "AÑOS" }).errores;
  assert.deepEqual(Object.keys(todos).sort(), ["carreras", "inactividadUnidad", "inactividadValor", "semaforos"]);
});

// ---------------------------------------------------------------------------
// 2. Exclusión de verde
// ---------------------------------------------------------------------------
test("[EQ-90] Exclusión de verde: no se puede elegir, no se ofrece y no se cuenta", async () => {
  const s = servicio();
  const r = await s.calcular("c1", { semaforos: ["VERDE"], carreras: CARRERAS, inactividadValor: 1, inactividadUnidad: "DIAS" });
  assert.equal(r.valido, false);
  assert.match(r.errores.semaforos, /verde/i);
  assert.ok(!r.opciones.semaforos.includes("VERDE"));

  const mezcla = await s.calcular("c1", { semaforos: ["VERDE", "ROJO"], carreras: CARRERAS, inactividadValor: 1, inactividadUnidad: "DIAS" });
  assert.equal(mezcla.valido, false, "ni mezclado con otros");

  const todos = await s.calcular("c1", { semaforos: ["AMARILLO", "NARANJA", "ROJO"], carreras: CARRERAS, inactividadValor: 1, inactividadUnidad: "DIAS" });
  assert.ok(todos.elegibles.every((a) => a.semaforo !== "VERDE"));
  assert.equal(todos.excluidos.verde, CARRERAS.length * ESTADOS.length * Object.keys(ACTIVIDAD).length);
});

// ---------------------------------------------------------------------------
// 3. Conversión de unidades
// ---------------------------------------------------------------------------
test("[EQ-90] Conversión de unidades: días, semanas y meses a fecha de corte", () => {
  const casos = [
    [1, "DIAS", "2026-11-16T17:00:00.000Z", "2026-11-15T17:00:00.000Z"],
    [7, "DIAS", "2026-11-16T17:00:00.000Z", "2026-11-09T17:00:00.000Z"],
    [30, "dias", "2026-11-16T17:00:00.000Z", "2026-10-17T17:00:00.000Z"],
    [1, "SEMANAS", "2026-11-16T17:00:00.000Z", "2026-11-09T17:00:00.000Z"],
    [4, "SEMANAS", "2026-11-16T17:00:00.000Z", "2026-10-19T17:00:00.000Z"],
    [1, "MESES", "2026-11-16T17:00:00.000Z", "2026-10-16T17:00:00.000Z"],
    [1, "MESES", "2026-03-31T12:00:00.000Z", "2026-02-28T12:00:00.000Z"],
    [1, "MESES", "2028-03-31T12:00:00.000Z", "2028-02-29T12:00:00.000Z"],
    [1, "MESES", "2026-12-31T12:00:00.000Z", "2026-11-30T12:00:00.000Z"],
    [2, "MESES", "2026-01-15T12:00:00.000Z", "2025-11-15T12:00:00.000Z"],
    [12, "MESES", "2026-02-28T12:00:00.000Z", "2025-02-28T12:00:00.000Z"],
  ];
  for (const [valor, unidad, desde, corte] of casos) {
    assert.equal(calcularFechaCorte(valor, unidad, new Date(desde)).toISOString(), corte, `${valor} ${unidad} desde ${desde}`);
  }
  assert.throws(() => calcularFechaCorte(1, "HORAS", AHORA), RangeError);
});

test("[EQ-90] Conversión de unidades: el límite es inclusivo (justo en la fecha de corte sí aplica)", async () => {
  const base = { colaboradorId: "c1", semaforo: "ROJO", carreraSolicitada: "Software", estadoSolicitud: "RECIBIDA" };
  const aspirantes = [
    { ...base, id: "justo", fechaUltimaActividad: HACE(7 * DIA) },
    { ...base, id: "un-ms-despues", fechaUltimaActividad: HACE(7 * DIA - 1) },
  ];
  const r = await servicio(repositorio({ aspirantes })).calcular("c1", { semaforos: ["ROJO"], carreras: ["Software"], inactividadValor: 1, inactividadUnidad: "SEMANAS" });
  assert.deepEqual(r.elegibles.map((a) => a.id), ["justo"]);
});

// ---------------------------------------------------------------------------
// 4. Contacto previo (48 h de HU9)
// ---------------------------------------------------------------------------
test("[EQ-90] Contacto previo: 48 h desde el último saliente correcto, por conversación o por fecha de última notificación", async () => {
  const base = { colaboradorId: "c1", semaforo: "ROJO", carreraSolicitada: "Software", estadoSolicitud: "RECIBIDA", fechaUltimaActividad: HACE(30 * DIA) };
  const aspirantes = [
    { ...base, id: "chat-47h59m" }, { ...base, id: "chat-48h" },
    { ...base, id: "notif-10h", fechaUltimaNotificacion: HACE(10 * HORA) }, { ...base, id: "notif-49h", fechaUltimaNotificacion: HACE(49 * HORA) },
    { ...base, id: "fallido-1h" }, { ...base, id: "entrante-1h" }, { ...base, id: "sin-contacto" },
  ];
  const msg = (aspiranteId, horas, extra = {}) => ({ aspiranteId, direccion: "SALIENTE", estadoEntrega: "ENTREGADO", fechaEnvio: HACE(horas * HORA), ...extra });
  const conversaciones = [
    msg("chat-47h59m", 47 + 59 / 60), msg("chat-48h", 48),
    msg("fallido-1h", 1, { estadoEntrega: "FALLIDO" }), msg("entrante-1h", 1, { direccion: "ENTRANTE" }),
  ];
  const filtros = { semaforos: ["ROJO"], carreras: ["Software"], inactividadValor: 7, inactividadUnidad: "DIAS" };
  const r = await servicio(repositorio({ aspirantes, conversaciones })).calcular("c1", filtros);
  assert.deepEqual(r.elegibles.map((a) => a.id).sort(), ["chat-48h", "entrante-1h", "fallido-1h", "notif-49h", "sin-contacto"]);
  assert.equal(r.excluidos.contactoReciente, 2);

  const con72h = await servicio(repositorio({ aspirantes, conversaciones }), { tiempoEsperaContactoPrevio: { valor: 3, unidad: "dias", equivalenciaHoras: 72 } }).calcular("c1", filtros);
  assert.deepEqual(con72h.elegibles.map((a) => a.id).sort(), ["entrante-1h", "fallido-1h", "sin-contacto"], "con 72 h configuradas en el panel ⚙");
});

// ---------------------------------------------------------------------------
// 5. Validación de horario (HU9 / EQ-82)
// ---------------------------------------------------------------------------
test("[EQ-90] Horario: lunes a viernes de 08:00 a 18:00 en Hermosillo; fuera de eso se rechaza el envío", () => {
  const validador = crearValidadorHorarioEnvio({ interfazLectura: crearModuloMensajes().interfazLectura });
  const casos = [
    ["2026-11-16T14:59:00.000Z", false, "lunes 07:59"],
    ["2026-11-16T15:00:00.000Z", true, "lunes 08:00"],
    ["2026-11-16T17:00:00.000Z", true, "lunes 10:00"],
    ["2026-11-17T00:59:00.000Z", true, "lunes 17:59"],
    ["2026-11-20T17:00:00.000Z", true, "viernes 10:00"],
    ["2026-11-21T17:00:00.000Z", false, "sábado 10:00"],
    ["2026-11-22T17:00:00.000Z", false, "domingo 10:00"],
  ];
  for (const [iso, permitido, nombre] of casos) {
    const estado = validador.obtenerEstadoHorario(new Date(iso));
    assert.equal(estado.permitido, permitido, nombre);
    if (!permitido) assert.ok(estado.siguienteApertura, `${nombre}: indica la siguiente apertura`);
  }
  const fuera = crearValidadorHorarioEnvio({ interfazLectura: crearModuloMensajes().interfazLectura, reloj: () => new Date("2026-11-21T17:00:00.000Z") });
  assert.throws(() => fuera.validarEnvioPermitido(), (e) => e.codigo === "FUERA_DE_HORARIO_PERMITIDO" && e.status === 409);
  const dentro = crearValidadorHorarioEnvio({ interfazLectura: crearModuloMensajes().interfazLectura, reloj: () => AHORA });
  assert.equal(dentro.validarEnvioPermitido().permitido, true);
});

// ---------------------------------------------------------------------------
// 6. Idempotencia
// ---------------------------------------------------------------------------
test("[EQ-90] Idempotencia: clave válida, huella estable y un solo lote por clave", async () => {
  assert.equal(leerClaveIdempotencia(null), null);
  assert.throws(() => leerClaveIdempotencia("x"), (e) => e.codigo === "CLAVE_IDEMPOTENCIA_INVALIDA");
  const filtros = { semaforos: ["ROJO", "NARANJA"], carreras: ["B", "A"], inactividadValor: 7, inactividadUnidad: "DIAS" };
  assert.equal(huellaPeticion("c1", filtros, false), huellaPeticion("c1", { ...filtros, semaforos: ["NARANJA", "ROJO"], carreras: ["A", "B"] }, false));
  assert.notEqual(huellaPeticion("c1", filtros, false), huellaPeticion("c1", { ...filtros, inactividadValor: 8 }, false));

  const bus = crearBusEnMemoria();
  let publicados = 0;
  bus.suscribir("#", () => { publicados += 1; });
  const asp = { id: "a1", nombreCompleto: "Ana", carreraSolicitada: "Software", telefono: "+526440000000" };
  const caso = new CrearLoteEnvioCasoUso({
    repositorioLotes: new RepositorioLotesMemoria(), bus, reloj: () => AHORA,
    servicioVistaPreviaLote: { calcular: async () => ({ valido: true, errores: {}, total: 1, elegibles: [asp] }) },
    generadorMensaje: { personalizarLote: async (l) => l.map((a) => ({ aspirante: a, mensajeId: "m", ...personalizarTexto("Hola, {aspirante}.", a) })) },
    validadorHorario: { validarEnvioPermitido: () => ({ permitido: true }), obtenerEstadoHorario: () => ({ permitido: true }) },
  });
  const r = await Promise.all([1, 2, 3].map(() => caso.ejecutar({ colaboradorId: "c1", claveIdempotencia: "clave-unitaria-01", cuerpo: filtros })));
  assert.equal(new Set(r.map((x) => x.resumen.loteId)).size, 1);
  assert.equal(r.filter((x) => !x.repetido).length, 1);
  assert.equal(publicados, 1);
});

// ---------------------------------------------------------------------------
// 7. Armado del mensaje
// ---------------------------------------------------------------------------
test("[EQ-90] Mensaje: nombre y carrera del aspirante, en el orden de la plantilla", () => {
  const texto = "Hola, {aspirante}. Tu proceso de ingreso a {carrera} todavía puede continuar.";
  assert.deepEqual(personalizarTexto(texto, { nombreCompleto: "José Ángel Núñez", carreraSolicitada: "Ingeniería en Software" }), {
    enviable: true, texto: "Hola, José. Tu proceso de ingreso a Ingeniería en Software todavía puede continuar.",
    parametros: ["José", "Ingeniería en Software"],
  });
  assert.deepEqual(personalizarTexto("{carrera}: hola {{aspirante}}", { nombre: "Luz", carreraSolicitada: "Psicología" }).parametros, ["Psicología", "Luz"]);
  assert.deepEqual(valoresDelAspirante({ nombreCompleto: "  María   Fernanda  López ", carreraSolicitada: " Administración " }), { aspirante: "María", carrera: "Administración" });
  for (const [aspirante, faltantes] of [[{ carreraSolicitada: "X" }, ["aspirante"]], [{ nombreCompleto: "Ana" }, ["carrera"]], [{}, ["aspirante", "carrera"]]]) {
    const r = personalizarTexto(texto, aspirante);
    assert.deepEqual([r.enviable, r.faltantes], [false, faltantes]);
  }
});

test("[EQ-90] Lote: un envío por aspirante y canal, con el resumen que usa el modal", () => {
  let n = 0;
  const personalizados = [
    { id: "a1", nombreCompleto: "Ana", carreraSolicitada: "S", telefono: "+526440000001", correo: "a1@x.mx" },
    { id: "a2", nombreCompleto: "", carreraSolicitada: "S", telefono: "+526440000002", correo: "a2@x.mx" },
  ].map((a) => ({ aspirante: a, mensajeId: "m", ...personalizarTexto("Hola, {aspirante} de {carrera}.", a) }));
  const registro = construirLote({ colaboradorId: "c1", clave: null, huella: "h", filtros: { semaforos: [], carreras: [] }, enviarPorCorreo: true,
    personalizados, ahora: AHORA, generarId: () => `id-${++n}` });
  assert.equal(registro.envios.length, 4);
  const r = resumenLote(registro);
  assert.deepEqual([r.totalAspirantes, r.totalEnviados, r.noEnviados.total, r.envios.whatsapp, r.envios.correo], [2, 1, 1, 1, 1]);
});

// ---------------------------------------------------------------------------
// 8. Componentes de filtros y botón (frontend/js/disparo-logica.js)
// ---------------------------------------------------------------------------
test("[EQ-90] Componente de filtros: arma lo que se manda al servidor", () => {
  assert.deepEqual(filtrosDesdeFormulario({ semaforos: ["ROJO"], carreras: new Set(["Software"]), inactividadValor: "7", inactividadUnidad: "DIAS" }),
    { semaforos: ["ROJO"], carreras: ["Software"], inactividadValor: 7, inactividadUnidad: "DIAS" });
  assert.equal(filtrosDesdeFormulario({ inactividadValor: "" }).inactividadValor, 1, "vacío se toma como 1");
  assert.equal(filtrosDesdeFormulario({ inactividadValor: "abc" }).inactividadValor, 1);
  assert.equal(filtrosDesdeFormulario({ enviarPorCorreo: "on" }).enviarPorCorreo, true);
  assert.equal("enviarPorCorreo" in filtrosDesdeFormulario({}), false, "la vista previa no lo manda");
});

test("[EQ-90] Componente de filtros: ningún grupo de casillas queda vacío (HU1-12)", () => {
  assert.equal(debeRemarcarse(false, 0), true, "desmarcar la última casilla la vuelve a marcar");
  assert.equal(debeRemarcarse(false, 1), false);
  assert.equal(debeRemarcarse(true, 0), false);
});

test("[EQ-90] Botón Enviar: solo con aspirantes, filtros válidos y dentro de horario", () => {
  const casos = [
    [{ valido: true, total: 19, dentroDeHorario: true }, false],
    [{ valido: true, total: 0, dentroDeHorario: true }, true],
    [{ valido: true, total: 19, dentroDeHorario: false }, true],
    [{ valido: false, total: 0, dentroDeHorario: true }, true],
    [null, true],
  ];
  for (const [vista, deshabilitado] of casos) assert.equal(botonEnviarDeshabilitado(vista), deshabilitado, JSON.stringify(vista));
  assert.equal(textoConteo({ total: 19 }), "19 alumnos serán notificados");
  assert.equal(textoConteo({ total: 0 }), TEXTO_SIN_ASPIRANTES);
  assert.equal(textoConfirmacion("19 alumnos serán notificados"), "¿Confirmas enviar el mensaje automático a 19 alumnos serán notificados?");
});

test("[EQ-90] Resumen después de enviar: notificados, repetido, datos faltantes y correo", () => {
  const base = { totalEnviados: 18, repetido: false, noEnviados: { total: 0, detalles: [] }, correo: { exitosos: 0, fallidos: 0, detalles: [] } };
  assert.deepEqual(resumenEnvio(base, false), { texto: "Se notificó a 18 aspirante(s).", conErrores: false });
  assert.match(resumenEnvio({ ...base, repetido: true }, false).texto, /^Este lote ya se había enviado/);
  const faltan = resumenEnvio({ ...base, noEnviados: { total: 1, detalles: [{ nombre: "asp-9", faltantes: ["aspirante"] }] } }, false);
  assert.deepEqual([faltan.conErrores, /No se envió a 1 por datos faltantes: asp-9 \(aspirante\)\./.test(faltan.texto)], [true, true]);
  const correo = resumenEnvio({ ...base, correo: { exitosos: 17, fallidos: 1, detalles: [{ nombre: "Luis", motivo: "correo inválido" }] } }, true);
  assert.deepEqual([correo.conErrores, correo.texto.endsWith("Correo: 17 enviados, 1 fallidos. Luis (correo inválido).")], [true, true]);
});
