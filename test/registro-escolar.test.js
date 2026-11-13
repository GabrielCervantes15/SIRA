import { test } from "node:test";
import assert from "node:assert/strict";
import { crearBusEnMemoria } from "../src/compartido/eventos/bus-en-memoria.js";
import {
  ESTADOS_FINALES,
  ESTADOS_SOLICITUD as E,
  ErrorRegistroEscolar,
  TIPO_ESTADO_CAMBIADO,
  VERSION_EVENTO,
  crearEventoEstadoCambiado,
  crearRegistroEscolarSimulado,
  esEstadoFinal,
  esEstadoValido,
  implementaRegistroEscolar,
  validarEventoEstadoCambiado,
} from "../src/modulos/registro-escolar/index.js";

const AHORA = "2026-11-12T15:30:00.000Z";

function armar() {
  const bus = crearBusEnMemoria();
  const registro = crearRegistroEscolarSimulado({
    solicitudes: [
      { aspiranteId: "a1", estado: E.EN_REVISION, fechaActualizacion: "2026-11-02T16:00:00Z" },
      { aspiranteId: "a2", estado: E.ACEPTADA, fechaActualizacion: "2026-11-05T18:30:00Z" },
    ],
    cambios: [
      { aspiranteId: "a2", estadoAnterior: E.EN_REVISION, estadoNuevo: E.ACEPTADA, fechaCambio: "2026-11-05T18:30:00Z", motivoRechazo: null },
      { aspiranteId: "a1", estadoAnterior: E.RECIBIDA, estadoNuevo: E.EN_REVISION, fechaCambio: "2026-11-02T16:00:00Z", motivoRechazo: null },
    ],
    bus,
    ahora: () => new Date(AHORA),
    generarId: () => "evt-1",
  });
  return { bus, registro };
}

// ---------- Interfaz ----------

test("el adaptador simulado cumple la interfaz del contrato", () => {
  assert.equal(implementaRegistroEscolar(armar().registro), true);
  assert.equal(implementaRegistroEscolar({}), false);
});

test("obtenerEstadoSolicitud devuelve el estado o null si no existe", async () => {
  const { registro } = armar();
  assert.deepEqual(await registro.obtenerEstadoSolicitud("a1"), {
    aspiranteId: "a1",
    estado: E.EN_REVISION,
    fechaActualizacion: "2026-11-02T16:00:00Z",
  });
  assert.equal(await registro.obtenerEstadoSolicitud("no-existe"), null);
});

test("obtenerCambiosDesde filtra (>=) y ordena de más antiguo a más reciente", async () => {
  const { registro } = armar();
  const todos = await registro.obtenerCambiosDesde("2026-01-01T00:00:00Z");
  assert.deepEqual(todos.map((c) => c.aspiranteId), ["a1", "a2"]);

  const desde = await registro.obtenerCambiosDesde("2026-11-05T18:30:00Z");
  assert.deepEqual(desde.map((c) => c.aspiranteId), ["a2"]);
});

test("obtenerCambiosDesde rechaza una fecha inválida", async () => {
  const { registro } = armar();
  await assert.rejects(registro.obtenerCambiosDesde("ayer"), TypeError);
});

test("si Registro Escolar no está disponible lanza ErrorRegistroEscolar NO_DISPONIBLE", async () => {
  const { registro } = armar();
  registro.simularIndisponibilidad(true);
  await assert.rejects(registro.obtenerEstadoSolicitud("a1"), (e) =>
    e instanceof ErrorRegistroEscolar && e.codigo === "NO_DISPONIBLE");
  registro.simularIndisponibilidad(false);
  assert.ok(await registro.obtenerEstadoSolicitud("a1"));
});

// ---------- Simulación del cambio de estado ----------

test("simularCambioDeEstado actualiza el estado, el historial y publica un evento válido", async () => {
  const { bus, registro } = armar();
  const recibidos = [];
  bus.suscribir("registro_escolar.#", (e, clave) => recibidos.push({ e, clave }));

  const evento = await registro.simularCambioDeEstado({
    aspiranteId: "a1",
    estadoNuevo: E.RECHAZADA,
    motivoRechazo: "Constancia ilegible",
  });

  assert.equal(validarEventoEstadoCambiado(evento).valido, true);
  assert.deepEqual(evento, {
    eventId: "evt-1",
    tipo: TIPO_ESTADO_CAMBIADO,
    version: VERSION_EVENTO,
    publicadoEn: AHORA,
    datos: {
      aspiranteId: "a1",
      estadoAnterior: E.EN_REVISION,
      estadoNuevo: E.RECHAZADA,
      fechaCambio: AHORA,
      motivoRechazo: "Constancia ilegible",
    },
  });
  assert.equal(recibidos.length, 1);
  assert.equal(recibidos[0].clave, TIPO_ESTADO_CAMBIADO);

  assert.equal((await registro.obtenerEstadoSolicitud("a1")).estado, E.RECHAZADA);
  const cambios = await registro.obtenerCambiosDesde(AHORA);
  assert.equal(cambios.length, 1);
  assert.equal(cambios[0].motivoRechazo, "Constancia ilegible");
});

test("un cambio inválido no modifica el estado ni publica nada", async () => {
  const { bus, registro } = armar();
  const invalidos = [
    { aspiranteId: "no-existe", estadoNuevo: E.ACEPTADA },
    { aspiranteId: "a1", estadoNuevo: "INVENTADO" },
    { aspiranteId: "a1", estadoNuevo: E.EN_REVISION },                       // mismo estado
    { aspiranteId: "a1", estadoNuevo: E.ACEPTADA, motivoRechazo: "texto" },  // motivo sin rechazo
  ];
  for (const cambio of invalidos) {
    await assert.rejects(registro.simularCambioDeEstado(cambio));
  }
  assert.equal((await registro.obtenerEstadoSolicitud("a1")).estado, E.EN_REVISION);
  assert.equal(bus.publicados().length, 0);
});

// ---------- Validación del evento ----------

function eventoBase() {
  return crearEventoEstadoCambiado(
    {
      aspiranteId: "a1",
      estadoAnterior: E.EN_REVISION,
      estadoNuevo: E.ACEPTADA,
      fechaCambio: "2026-11-12T15:28:00Z",
    },
    { ahora: () => new Date(AHORA), generarId: () => "evt-9" },
  );
}

test("validarEventoEstadoCambiado acepta un evento correcto (primer estado con estadoAnterior null)", () => {
  assert.deepEqual(validarEventoEstadoCambiado(eventoBase()), { valido: true, errores: [] });

  const primero = eventoBase();
  primero.datos.estadoAnterior = null;
  assert.equal(validarEventoEstadoCambiado(primero).valido, true);
});

test("validarEventoEstadoCambiado detecta eventos mal formados", () => {
  const casos = [
    [null, /objeto/],
    [{ ...eventoBase(), eventId: "" }, /eventId/],
    [{ ...eventoBase(), tipo: "otro.tipo" }, /tipo/],
    [{ ...eventoBase(), version: 2 }, /version/],
    [{ ...eventoBase(), publicadoEn: "ayer" }, /publicadoEn/],
    [{ ...eventoBase(), datos: null }, /datos es obligatorio/],
    [{ ...eventoBase(), datos: { ...eventoBase().datos, aspiranteId: "" } }, /aspiranteId/],
    [{ ...eventoBase(), datos: { ...eventoBase().datos, estadoNuevo: "X" } }, /estadoNuevo/],
    [{ ...eventoBase(), datos: { ...eventoBase().datos, estadoAnterior: undefined } }, /estadoAnterior/],
    [{ ...eventoBase(), datos: { ...eventoBase().datos, fechaCambio: "2026-11-12" } }, /fechaCambio/],
    [{ ...eventoBase(), datos: { ...eventoBase().datos, motivoRechazo: "no aplica" } }, /solo se permite/],
  ];
  for (const [evento, patron] of casos) {
    const { valido, errores } = validarEventoEstadoCambiado(evento);
    assert.equal(valido, false, `debería ser inválido: ${patron}`);
    assert.match(errores.join(" "), patron);
  }
});

// ---------- Catálogo de estados ----------


test("el catálogo distingue la constancia rechazada (en proceso) del rechazo definitivo", () => {
  assert.equal(esEstadoValido(E.CONSTANCIA_RECHAZADA), true);
  assert.equal(esEstadoFinal(E.CONSTANCIA_RECHAZADA), false);
  assert.deepEqual([...ESTADOS_FINALES].sort(), [E.ACEPTADA, E.RECHAZADA].sort());
  assert.equal(esEstadoFinal(E.ACEPTADA), true);
  assert.equal(esEstadoFinal(E.EN_REVISION), false);
});

test("el motivo de rechazo se permite con CONSTANCIA_RECHAZADA y RECHAZADA, y no con otros estados", () => {
  const conEstado = (estadoNuevo, motivoRechazo) => {
    const e = eventoBase();
    e.datos.estadoNuevo = estadoNuevo;
    e.datos.motivoRechazo = motivoRechazo;
    return validarEventoEstadoCambiado(e).valido;
  };
  assert.equal(conEstado(E.CONSTANCIA_RECHAZADA, "le faltó una hoja"), true);
  assert.equal(conEstado(E.RECHAZADA, "no cumple el promedio mínimo"), true);
  assert.equal(conEstado(E.EN_REVISION, "no aplica"), false);
  assert.equal(conEstado(E.ACEPTADA, "no aplica"), false);
});
