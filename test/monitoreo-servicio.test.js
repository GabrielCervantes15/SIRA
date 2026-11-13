import { test } from "node:test";
import assert from "node:assert/strict";
import { construirAplicacion } from "../src/ensamblar.js";
import { ESTADOS_SOLICITUD as E, crearEventoEstadoCambiado } from "../src/modulos/registro-escolar/index.js";
import {
  ErrorMonitoreo,
  crearRepositorioAspirantes,
  crearServicioMonitoreo,
  textoActividad,
} from "../src/modulos/monitoreo/index.js";

const COL = "col-001";

/** Tres aspirantes de la cartera + uno de otra cartera, con estados y actividades controlados. */
function armar() {
  const base = (id, nombre, extra = {}) => ({
    id, nombre, carrera: "Ingeniería en Software", preparatoria: "CBTIS 37",
    fechaSolicitud: "2026-10-01", telefono: "6440000000", correo: `${id}@ejemplo.mx`, colaboradorId: COL, ...extra,
  });
  const aspirantes = [
    base("a1", "Zoe Álvarez", { carrera: "Ingeniería Industrial", fechaSolicitud: "2026-10-05" }),
    base("a2", "Ángel Zúñiga", { preparatoria: "COBACH 1", fechaSolicitud: "2026-10-03" }),
    base("a3", "Mario Beltrán", { fechaSolicitud: "2026-10-07" }),
    base("a4", "Aceptada Final", {}),
    base("a5", "De Otra Cartera", { colaboradorId: "col-002" }),
  ];
  const msg = (id, aspiranteId, fecha, origen) => ({ id, aspiranteId, tipo: "MENSAJE_ENVIADO", fecha, origen });
  const actividades = [
    msg("x1", "a1", "2026-11-01T10:00:00Z", "automatico"),                      // a1: sin contacto
    msg("x2", "a2", "2026-11-02T10:00:00Z", "colaborador"),                     // a2: con contacto
    { id: "x3", aspiranteId: "a2", tipo: "CONSTANCIA_ENTREGADA", fecha: "2026-11-02T10:00:00Z" }, // misma hora que x2
    msg("x4", "a3", "2026-11-03T10:00:00Z", "colaborador"),                     // a3: con contacto, sin más
    msg("x5", "a4", "2026-11-04T10:00:00Z", "colaborador"),
    msg("x6", "a5", "2026-11-05T10:00:00Z", "automatico"),
  ];
  const estados = [
    { aspiranteId: "a1", estado: E.EN_REVISION, fechaActualizacion: "2026-11-01T10:00:00Z" }, // rojo (sin contacto)
    { aspiranteId: "a2", estado: E.EN_REVISION, fechaActualizacion: "2026-11-02T10:00:00Z" }, // amarillo
    { aspiranteId: "a3", estado: E.RECIBIDA, fechaActualizacion: "2026-10-07T10:00:00Z" },    // naranja
    { aspiranteId: "a4", estado: E.ACEPTADA, fechaActualizacion: "2026-11-04T10:00:00Z" },    // verde (cerrada)
    { aspiranteId: "a5", estado: E.RECIBIDA, fechaActualizacion: "2026-11-05T10:00:00Z" },
  ];
  const repositorio = crearRepositorioAspirantes({ aspirantes, actividades, estados });
  return { repositorio, servicio: crearServicioMonitoreo({ repositorio }) };
}

const ids = (r) => r.datos.map((a) => a.id);

// ---------- Lista ----------

test("la lista solo trae aspirantes de la cartera y oculta los finales por defecto", () => {
  const { servicio } = armar();
  assert.deepEqual(ids(servicio.listarAspirantes(COL)).sort(), ["a1", "a2", "a3"]);
  assert.deepEqual(ids(servicio.listarAspirantes(COL, { incluirCerrados: true })).sort(), ["a1", "a2", "a3", "a4"]);
});

test("por defecto se ordena por semáforo: rojo, naranja, amarillo, verde", () => {
  const { servicio } = armar();
  const r = servicio.listarAspirantes(COL, { incluirCerrados: true });
  assert.deepEqual(r.datos.map((a) => a.semaforo.nivel), ["ROJO", "NARANJA", "AMARILLO", "VERDE"]);
});

test("el orden por semáforo ascendente invierte el anterior", () => {
  const { servicio } = armar();
  const r = servicio.listarAspirantes(COL, { incluirCerrados: true, direccion: "asc" });
  assert.deepEqual(r.datos.map((a) => a.semaforo.nivel), ["VERDE", "AMARILLO", "NARANJA", "ROJO"]);
});

test("ordenar por nombre ignora acentos y mayúsculas", () => {
  const { servicio } = armar();
  assert.deepEqual(ids(servicio.listarAspirantes(COL, { ordenarPor: "nombre", direccion: "asc" })), ["a2", "a3", "a1"]);
  assert.deepEqual(ids(servicio.listarAspirantes(COL, { ordenarPor: "nombre", direccion: "desc" })), ["a1", "a3", "a2"]);
});

test("ordenar por carrera, preparatoria y fecha de solicitud", () => {
  const { servicio } = armar();
  assert.equal(ids(servicio.listarAspirantes(COL, { ordenarPor: "carrera", direccion: "asc" }))[2], "a1"); // Industrial al final
  assert.equal(ids(servicio.listarAspirantes(COL, { ordenarPor: "preparatoria", direccion: "desc" }))[0], "a2"); // COBACH 1 > CBTIS 37
  assert.deepEqual(ids(servicio.listarAspirantes(COL, { ordenarPor: "fechaSolicitud", direccion: "asc" })), ["a2", "a1", "a3"]);
});

test("ordenar por última actividad: más reciente primero en desc", () => {
  const { servicio } = armar();
  assert.deepEqual(ids(servicio.listarAspirantes(COL, { ordenarPor: "ultimaActividad", direccion: "desc" })), ["a3", "a2", "a1"]);
});

test("paginación: tamaño, totales y página fuera de rango", () => {
  const { servicio } = armar();
  const p1 = servicio.listarAspirantes(COL, { tamano: 2, ordenarPor: "nombre", direccion: "asc" });
  assert.deepEqual(p1.paginacion, { pagina: 1, tamano: 2, totalResultados: 3, totalPaginas: 2 });
  assert.equal(p1.datos.length, 2);

  const p2 = servicio.listarAspirantes(COL, { tamano: 2, pagina: 2, ordenarPor: "nombre", direccion: "asc" });
  assert.equal(p2.datos.length, 1);

  const fuera = servicio.listarAspirantes(COL, { tamano: 2, pagina: 99, ordenarPor: "nombre", direccion: "asc" });
  assert.equal(fuera.paginacion.pagina, 2); // se ajusta a la última
});

test("una cartera vacía devuelve lista vacía y cero páginas", () => {
  const { servicio } = armar();
  const r = servicio.listarAspirantes("col-999");
  assert.deepEqual(r, { datos: [], paginacion: { pagina: 1, tamano: 13, totalResultados: 0, totalPaginas: 0 } });
});

test("los parámetros inválidos se rechazan con PARAMETRO_INVALIDO", () => {
  const { servicio } = armar();
  const malos = [{ pagina: 0 }, { pagina: NaN }, { tamano: 0 }, { tamano: 101 }, { ordenarPor: "telefono" }, { direccion: "arriba" }];
  for (const opciones of malos) {
    assert.throws(() => servicio.listarAspirantes(COL, opciones),
      (e) => e instanceof ErrorMonitoreo && e.codigo === "PARAMETRO_INVALIDO", JSON.stringify(opciones));
  }
});

// ---------- Detalle ----------

test("el detalle trae los datos de contacto, el estatus y el semáforo", () => {
  const { servicio } = armar();
  const d = servicio.obtenerDetalle(COL, "a2");
  assert.equal(d.nombre, "Ángel Zúñiga");
  assert.equal(d.estado.codigo, E.EN_REVISION);
  assert.match(d.estado.texto, /Registro Escolar la está revisando/);
  assert.equal(d.semaforo.nivel, "AMARILLO");
  assert.equal(d.contactoIniciado, true);
  assert.equal(d.telefono, "6440000000");
});

test("detalle: 404 si no existe y 403 si es de otra cartera", () => {
  const { servicio } = armar();
  assert.throws(() => servicio.obtenerDetalle(COL, "zzz"), (e) => e.codigo === "NO_ENCONTRADO");
  assert.throws(() => servicio.obtenerDetalle(COL, "a5"), (e) => e.codigo === "SIN_PERMISO");
});

// ---------- Actividades ----------

test("las actividades salen del más reciente al más antiguo y desempatan por id descendente", () => {
  const { servicio } = armar();
  const r = servicio.obtenerActividades(COL, "a2");
  assert.deepEqual(r.datos.map((a) => a.id), ["x3", "x2"]); // misma fecha: x3 antes que x2
  assert.equal(r.total, 2);
});

test("el rango de fechas incluye los extremos", () => {
  const { servicio } = armar();
  const r = servicio.obtenerActividades(COL, "a2", { desde: "2026-11-02T10:00:00Z", hasta: "2026-11-02T10:00:00Z" });
  assert.equal(r.total, 2);
  assert.equal(servicio.obtenerActividades(COL, "a2", { desde: "2026-11-03T00:00:00Z" }).total, 0);
});

test("rango inválido o invertido se rechaza; sin permiso y sin aspirante también", () => {
  const { servicio } = armar();
  assert.throws(() => servicio.obtenerActividades(COL, "a2", { desde: "ayer" }), (e) => e.codigo === "PARAMETRO_INVALIDO");
  assert.throws(() => servicio.obtenerActividades(COL, "a2", { desde: "2026-12-01T00:00:00Z", hasta: "2026-11-01T00:00:00Z" }), (e) => e.codigo === "PARAMETRO_INVALIDO");
  assert.throws(() => servicio.obtenerActividades(COL, "a5"), (e) => e.codigo === "SIN_PERMISO");
  assert.throws(() => servicio.obtenerActividades(COL, "zzz"), (e) => e.codigo === "NO_ENCONTRADO");
});

test("los textos del historial siguen la redacción del Figma", () => {
  assert.equal(textoActividad({ tipo: "MENSAJE_ENVIADO", origen: "automatico" }), "Recibió un mensaje automático.");
  assert.equal(textoActividad({ tipo: "MENSAJE_ENVIADO", origen: "colaborador" }), "Recibió un mensaje de un colaborador.");
  assert.equal(textoActividad({ tipo: "CONSTANCIA_ENTREGADA" }), "Entregó la constancia de calificaciones a Registro Escolar.");
  assert.equal(
    textoActividad({ tipo: "RECHAZO", objeto: "constancia", motivo: "le faltó una hoja con las calificaciones del primer semestre." }),
    "La constancia de calificaciones fue rechazada por Registro Escolar debido a que le faltó una hoja con las calificaciones del primer semestre.",
  );
  assert.equal(textoActividad({ tipo: "RECHAZO", objeto: "solicitud", motivo: null }), "La solicitud fue rechazada por Registro Escolar.");
});

// ---------- Consumidor del evento de Registro Escolar ----------

const evento = (datos, extra = {}) => crearEventoEstadoCambiado(
  { aspiranteId: "a3", estadoAnterior: E.RECIBIDA, estadoNuevo: E.EN_REVISION, fechaCambio: "2026-11-10T12:00:00Z", ...datos },
  { ahora: () => new Date("2026-11-10T12:00:05Z"), generarId: () => extra.id ?? "ev-1" },
);

test("EN_REVISION actualiza el estado y agrega «constancia entregada» al historial", () => {
  const { repositorio, servicio } = armar();
  assert.deepEqual(repositorio.aplicarCambioEstado(evento({})), { aplicado: true });

  assert.equal(servicio.obtenerDetalle(COL, "a3").estado.codigo, E.EN_REVISION);
  assert.equal(servicio.obtenerDetalle(COL, "a3").semaforo.nivel, "AMARILLO");
  assert.equal(servicio.obtenerActividades(COL, "a3").datos[0].texto, "Entregó la constancia de calificaciones a Registro Escolar.");
});

test("CONSTANCIA_RECHAZADA agrega el motivo al historial y pone el semáforo en rojo", () => {
  const { repositorio, servicio } = armar();
  repositorio.aplicarCambioEstado(evento({ estadoNuevo: E.CONSTANCIA_RECHAZADA, estadoAnterior: E.EN_REVISION, motivoRechazo: "le faltó una hoja" }));
  assert.equal(servicio.obtenerDetalle(COL, "a3").semaforo.nivel, "ROJO");
  assert.match(servicio.obtenerActividades(COL, "a3").datos[0].texto, /fue rechazada por Registro Escolar debido a que le faltó una hoja\.$/);
});

test("un evento repetido (mismo eventId) se ignora", () => {
  const { repositorio, servicio } = armar();
  const e = evento({});
  assert.equal(repositorio.aplicarCambioEstado(e).aplicado, true);
  const segundo = repositorio.aplicarCambioEstado(e);
  assert.equal(segundo.aplicado, false);
  assert.match(segundo.motivo, /repetido/);
  assert.equal(servicio.obtenerActividades(COL, "a3").total, 2); // la original + una sola entrega
});

test("un evento más viejo entra al historial pero no sobrescribe el estado actual", () => {
  const { repositorio, servicio } = armar();
  repositorio.aplicarCambioEstado(evento({ estadoNuevo: E.ACEPTADA, fechaCambio: "2026-11-11T09:00:00Z" }, { id: "nuevo" }));
  repositorio.aplicarCambioEstado(evento({ estadoNuevo: E.EN_REVISION, fechaCambio: "2026-11-09T09:00:00Z" }, { id: "viejo" }));
  assert.equal(servicio.obtenerDetalle(COL, "a3").estado.codigo, E.ACEPTADA);
  assert.equal(servicio.obtenerActividades(COL, "a3").total, 2); // ya quedó en el historial
});

test("eventos inválidos o de aspirantes desconocidos se ignoran sin romper nada", () => {
  const { repositorio } = armar();
  assert.equal(repositorio.aplicarCambioEstado({ tipo: "otro" }).aplicado, false);
  assert.match(repositorio.aplicarCambioEstado(evento({ aspiranteId: "zzz" })).motivo, /desconocido/);
});

// ---------- Integración con el módulo de Registro Escolar (el avance anterior) ----------

test("con los datos semilla: el estado sale de Registro Escolar y los cambios llegan por el bus", async () => {
  const app = await construirAplicacion();
  const antes = app.servicio.listarAspirantes(app.colaborador.id);
  assert.equal(antes.paginacion.totalResultados, 31);
  assert.deepEqual(
    antes.datos.reduce((cuenta, a) => ({ ...cuenta, [a.semaforo.nivel]: (cuenta[a.semaforo.nivel] ?? 0) + 1 }), {}),
    { ROJO: 8, NARANJA: 3, AMARILLO: 2 }, // igual que la primera página del Figma
  );

  // Registro Escolar (simulado) rechaza la constancia de asp-011 (naranja, con contacto)
  await app.registroEscolar.simularCambioDeEstado({
    aspiranteId: "asp-011",
    estadoNuevo: E.EN_REVISION,
  });
  await app.registroEscolar.simularCambioDeEstado({
    aspiranteId: "asp-011",
    estadoNuevo: E.CONSTANCIA_RECHAZADA,
    motivoRechazo: "la constancia no estaba firmada",
  });

  const detalle = app.servicio.obtenerDetalle(app.colaborador.id, "asp-011");
  assert.equal(detalle.estado.codigo, E.CONSTANCIA_RECHAZADA);
  assert.equal(detalle.semaforo.nivel, "ROJO");
  // El rechazo usa la hora real del sistema; los datos semilla tienen fechas futuras,
  // así que no siempre queda primero. Se busca por contenido, no por posición.
  const actividades = app.servicio.obtenerActividades(app.colaborador.id, "asp-011").datos;
  assert.ok(actividades.some((a) => a.tipo === "RECHAZO" &&
    /debido a que la constancia no estaba firmada\.$/.test(a.texto)));
});

test("Leonardo Flores Leyva (asp-002) reproduce el ejemplo del Figma", async () => {
  const app = await construirAplicacion();
  const d = app.servicio.obtenerDetalle("col-001", "asp-002");
  assert.equal(d.nombre, "Leonardo Flores Leyva");
  assert.equal(d.semaforo.nivel, "ROJO");
  assert.equal(d.semaforo.texto, "No se ha iniciado contacto con el aspirante");
  assert.equal(d.estado.texto, "Entregó la constancia de calificaciones pero fue rechazada");

  const textos = app.servicio.obtenerActividades("col-001", "asp-002").datos.map((a) => a.texto);
  assert.deepEqual(textos, [
    "La constancia de calificaciones fue rechazada por Registro Escolar debido a que le faltó una hoja con las calificaciones del primer semestre.",
    "Entregó la constancia de calificaciones a Registro Escolar.",
    "Recibió un mensaje automático.",
  ]);
});
