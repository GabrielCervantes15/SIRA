/**
 * EQ-83 (HU1-7) · Endpoint de envío: crear el lote y publicar eventos al bus.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearServidor } from "../src/servidor.js";
import { crearModuloMonitoreo } from "../src/modulos/monitoreo/index.js";
import { crearBusEnMemoria } from "../src/compartido/eventos/bus-en-memoria.js";
import {
  construirLote, destinoDelCanal, ErrorLoteEnvio, huellaPeticion, leerClaveIdempotencia, resumenLote, VENTANA_SIN_CLAVE_MS,
} from "../src/modulos/disparo-automatico/dominio/lote-envio.js";
import { CrearLoteEnvioCasoUso } from "../src/modulos/disparo-automatico/aplicacion/crear-lote-envio.caso-uso.js";
import { RepositorioLotesMemoria } from "../src/modulos/disparo-automatico/infraestructura/repositorio-lotes-memoria.js";
import { RepositorioLotesPostgres } from "../src/modulos/disparo-automatico/infraestructura/repositorio-lotes-postgres.js";
import { personalizarTexto } from "../src/modulos/disparo-automatico/mensaje-reactivacion.js";
import { TIPO_ENVIO_SOLICITADO, routingKeyEnvio } from "../src/modulos/disparo-automatico/eventos.js";

const AHORA = new Date("2026-11-16T17:00:00.000Z"); // lunes 10:00 en Hermosillo
const TEXTO = "Hola, {aspirante}. Tu proceso de ingreso a {carrera} todavía puede continuar.";
const FILTROS = { semaforos: ["ROJO"], carreras: ["Software"], inactividadValor: 7, inactividadUnidad: "DIAS" };

const asp = (id, extra = {}) => ({
  id, nombreCompleto: `Nombre ${id}`, carreraSolicitada: "Software",
  telefono: "+526441234567", correo: `${id}@correo.mx`, ...extra,
});

// ---------------------------------------------------------------------------
// Dominio
// ---------------------------------------------------------------------------
test("[EQ-83] Clave de idempotencia: opcional, con formato", () => {
  assert.equal(leerClaveIdempotencia(undefined), null);
  assert.equal(leerClaveIdempotencia("  "), null);
  assert.equal(leerClaveIdempotencia("3f2a9c1e-0b7d-4e55-9a41-2c6b8e0f1d23"), "3f2a9c1e-0b7d-4e55-9a41-2c6b8e0f1d23");
  for (const mala of ["corta", "con espacios aquí", "x".repeat(101), "<script>alert</script>"]) {
    assert.throws(() => leerClaveIdempotencia(mala), (e) => e.codigo === "CLAVE_IDEMPOTENCIA_INVALIDA" && e.status === 400);
  }
});

test("[EQ-83] Huella: no depende del orden de las listas y cambia con el correo o el colaborador", () => {
  const a = huellaPeticion("c1", { ...FILTROS, semaforos: ["ROJO", "NARANJA"] }, false);
  assert.equal(a, huellaPeticion("c1", { ...FILTROS, semaforos: ["NARANJA", "ROJO"] }, false));
  assert.notEqual(a, huellaPeticion("c1", { ...FILTROS, semaforos: ["ROJO", "NARANJA"] }, true));
  assert.notEqual(a, huellaPeticion("c2", { ...FILTROS, semaforos: ["ROJO", "NARANJA"] }, false));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("[EQ-83] Destino por canal: teléfono internacional y correo válido", () => {
  assert.deepEqual(destinoDelCanal("WHATSAPP", { telefono: "+52 644 123 4567" }), { destino: "+526441234567", motivo: null });
  assert.match(destinoDelCanal("WHATSAPP", { telefono: "" }).motivo, /no tiene teléfono/);
  assert.match(destinoDelCanal("WHATSAPP", { telefono: "6441234567" }).motivo, /formato internacional/);
  assert.deepEqual(destinoDelCanal("CORREO", { correo: " ana@itson.mx " }), { destino: "ana@itson.mx", motivo: null });
  assert.match(destinoDelCanal("CORREO", { correo: "" }).motivo, /no tiene correo/);
  assert.match(destinoDelCanal("CORREO", { correo: "ana@" }).motivo, /formato válido/);
});

test("[EQ-83] Un envío por aspirante y canal; los que no se pueden enviar llevan su motivo", () => {
  let n = 0;
  const personalizados = [asp("a1"), asp("a2", { correo: "malo" }), asp("a3", { nombreCompleto: "" }), asp("a4", { telefono: "" })]
    .map((a) => ({ aspirante: a, mensajeId: "reactivacion_hu1", ...personalizarTexto(TEXTO, a) }));
  const { lote, envios } = construirLote({
    colaboradorId: "c1", clave: null, huella: "h", filtros: FILTROS, enviarPorCorreo: true,
    personalizados, ahora: AHORA, generarId: () => `id-${++n}`,
  });

  assert.equal(envios.length, 8);
  const estado = (id, canal) => envios.find((e) => e.aspiranteId === id && e.canal === canal);
  assert.equal(estado("a1", "WHATSAPP").estado, "PENDIENTE");
  assert.equal(estado("a1", "WHATSAPP").texto, "Hola, Nombre. Tu proceso de ingreso a Software todavía puede continuar.");
  assert.equal(estado("a1", "CORREO").destino, "a1@correo.mx");
  assert.equal(estado("a2", "WHATSAPP").estado, "PENDIENTE");
  assert.equal(estado("a2", "CORREO").codigoMotivo, "CANAL_NO_DISPONIBLE");
  assert.deepEqual([estado("a3", "WHATSAPP").codigoMotivo, estado("a3", "CORREO").codigoMotivo], ["VARIABLE_FALTANTE", "VARIABLE_FALTANTE"]);
  assert.deepEqual(estado("a3", "WHATSAPP").faltantes, ["aspirante"]);
  assert.equal(estado("a4", "WHATSAPP").estado, "NO_ENVIABLE");
  assert.equal(estado("a4", "CORREO").estado, "PENDIENTE");
  assert.deepEqual([lote.totalAspirantes, lote.totalEnviosPendientes, lote.estado], [4, 4, "CREADO"]);

  const r = resumenLote({ lote, envios });
  assert.equal(r.totalEnviados, 3, "a4 cuenta: le llega por correo");
  assert.deepEqual(r.envios, { whatsapp: 2, correo: 2 });
  assert.deepEqual(r.noEnviados.detalles.map((d) => [d.aspiranteId, d.codigo, d.faltantes]), [["a3", "VARIABLE_FALTANTE", ["aspirante"]]]);
  assert.deepEqual([r.correo.exitosos, r.correo.fallidos, r.correo.detalles[0].aspiranteId], [2, 1, "a2"]);
});

// ---------------------------------------------------------------------------
// Caso de uso
// ---------------------------------------------------------------------------
function armar({ aspirantes = [asp("a1"), asp("a2")], horarioAbierto = true, bus = crearBusEnMemoria(), reloj } = {}) {
  const repositorioLotes = new RepositorioLotesMemoria();
  const eventos = [];
  bus.suscribir("#", (evento, routingKey) => { eventos.push({ routingKey, evento }); });
  const llamadas = { calcular: 0, noEnviables: 0 };
  const estado = { aspirantes, ahora: AHORA };
  const caso = new CrearLoteEnvioCasoUso({
    repositorioLotes,
    bus,
    reloj: reloj ?? (() => estado.ahora),
    servicioVistaPreviaLote: {
      async calcular(_colaborador, cuerpo) {
        llamadas.calcular += 1;
        const valido = Array.isArray(cuerpo.carreras) && cuerpo.carreras.length > 0;
        return valido
          ? { valido, errores: {}, total: estado.aspirantes.length, elegibles: estado.aspirantes }
          : { valido, errores: { carreras: "Selecciona al menos una carrera." }, total: 0, elegibles: [] };
      },
    },
    generadorMensaje: {
      async personalizarLote(lista) {
        return lista.map((a) => ({ aspirante: a, mensajeId: "reactivacion_hu1", ...personalizarTexto(TEXTO, a) }));
      },
    },
    validadorHorario: {
      validarEnvioPermitido() {
        if (!horarioAbierto) throw Object.assign(new Error("Fuera de horario"), { codigo: "FUERA_DE_HORARIO_PERMITIDO", status: 409 });
        return { permitido: true };
      },
      obtenerEstadoHorario: () => ({ permitido: horarioAbierto }),
    },
    alRegistrarNoEnviables: async () => { llamadas.noEnviables += 1; },
  });
  return { caso, repositorioLotes, eventos, llamadas, estado };
}

const CLAVE = "clave-de-prueba-0001";

test("[EQ-83] Crea el lote y publica un evento por aspirante y canal", async () => {
  const { caso, repositorioLotes, eventos } = armar();
  const r = await caso.ejecutar({ colaboradorId: "c1", claveIdempotencia: CLAVE, cuerpo: { ...FILTROS, enviarPorCorreo: true } });

  assert.equal(r.repetido, false);
  assert.equal(r.eventosPublicados, 4);
  assert.deepEqual(eventos.map((e) => e.routingKey).sort(), [
    "disparo.envio.solicitado.correo", "disparo.envio.solicitado.correo",
    "disparo.envio.solicitado.whatsapp", "disparo.envio.solicitado.whatsapp",
  ]);
  const { evento } = eventos.find((e) => e.routingKey === routingKeyEnvio("WHATSAPP"));
  assert.equal(evento.tipo, TIPO_ENVIO_SOLICITADO);
  assert.equal(evento.version, 1);
  assert.equal(evento.datos.loteId, r.resumen.loteId);
  assert.equal(evento.eventId, evento.datos.envioId);
  assert.equal(evento.datos.destino, "+526441234567");
  assert.match(evento.datos.texto, /^Hola, Nombre\. Tu proceso de ingreso a Software/);

  const guardado = await repositorioLotes.obtenerLote(r.resumen.loteId);
  assert.equal(guardado.lote.claveIdempotencia, CLAVE);
  assert.ok(guardado.envios.every((e) => e.publicadoEn === AHORA.toISOString()));
});

test("[EQ-83] Recalcula al enviar y rechaza si no hay aspirantes, sin crear nada", async () => {
  const { caso, repositorioLotes, eventos, llamadas, estado } = armar();
  estado.aspirantes = [];
  await assert.rejects(caso.ejecutar({ colaboradorId: "c1", claveIdempotencia: CLAVE, cuerpo: FILTROS }),
    (e) => e instanceof ErrorLoteEnvio && e.codigo === "SIN_ASPIRANTES" && e.status === 400);
  assert.equal(llamadas.calcular, 1);
  assert.equal(repositorioLotes.lotes.size, 0);
  assert.equal(eventos.length, 0);

  // Con la misma clave, ahora que sí hay aspirantes, se crea el lote: el rechazo no «gastó» la clave.
  estado.aspirantes = [asp("a1")];
  assert.equal((await caso.ejecutar({ colaboradorId: "c1", claveIdempotencia: CLAVE, cuerpo: FILTROS })).repetido, false);
});

test("[EQ-83] Filtros inválidos y fuera de horario no crean lote", async () => {
  const filtrosMal = armar();
  await assert.rejects(filtrosMal.caso.ejecutar({ colaboradorId: "c1", cuerpo: { ...FILTROS, carreras: [] } }),
    (e) => e.codigo === "FILTROS_INVALIDOS" && Boolean(e.errores.carreras));
  assert.equal(filtrosMal.repositorioLotes.lotes.size, 0);

  const cerrado = armar({ horarioAbierto: false });
  await assert.rejects(cerrado.caso.ejecutar({ colaboradorId: "c1", cuerpo: FILTROS }), (e) => e.codigo === "FUERA_DE_HORARIO_PERMITIDO");
  assert.equal(cerrado.llamadas.calcular, 0, "ni siquiera recalcula");
  assert.equal(cerrado.repositorioLotes.lotes.size, 0);
});

test("[EQ-83] Idempotente: la misma clave devuelve el mismo lote sin publicar de nuevo", async () => {
  const { caso, repositorioLotes, eventos, llamadas } = armar();
  const primero = await caso.ejecutar({ colaboradorId: "c1", claveIdempotencia: CLAVE, cuerpo: FILTROS });
  const segundo = await caso.ejecutar({ colaboradorId: "c1", claveIdempotencia: CLAVE, cuerpo: FILTROS });

  assert.equal(segundo.repetido, true);
  assert.equal(segundo.resumen.loteId, primero.resumen.loteId);
  assert.equal(segundo.eventosPublicados, 0);
  assert.equal(eventos.length, 2);
  assert.equal(repositorioLotes.lotes.size, 1);
  assert.equal(llamadas.calcular, 1, "la repetición no recalcula");
  assert.equal(llamadas.noEnviables, 0);
});

test("[EQ-83] Doble clic simultáneo: con o sin clave, un solo lote", async () => {
  const conClave = armar();
  const [a, b] = await Promise.all([1, 2].map(() => conClave.caso.ejecutar({ colaboradorId: "c1", claveIdempotencia: CLAVE, cuerpo: FILTROS })));
  assert.equal(a.resumen.loteId, b.resumen.loteId);
  assert.deepEqual([a.repetido, b.repetido].sort(), [false, true]);
  assert.equal(conClave.eventos.length, 2);

  const sinClave = armar();
  const r = await Promise.all([1, 2, 3].map(() => sinClave.caso.ejecutar({ colaboradorId: "c1", cuerpo: FILTROS })));
  assert.equal(new Set(r.map((x) => x.resumen.loteId)).size, 1);
  assert.equal(sinClave.repositorioLotes.lotes.size, 1);
  assert.equal(sinClave.eventos.length, 2);
});

test("[EQ-83] Sin clave, la huella solo protege durante la ventana; otra clave u otro colaborador crean otro lote", async () => {
  const { caso, repositorioLotes, estado } = armar();
  await caso.ejecutar({ colaboradorId: "c1", cuerpo: FILTROS });
  estado.ahora = new Date(AHORA.getTime() + VENTANA_SIN_CLAVE_MS - 1000);
  assert.equal((await caso.ejecutar({ colaboradorId: "c1", cuerpo: FILTROS })).repetido, true);
  estado.ahora = new Date(AHORA.getTime() + VENTANA_SIN_CLAVE_MS + 1000);
  assert.equal((await caso.ejecutar({ colaboradorId: "c1", cuerpo: FILTROS })).repetido, false);
  assert.equal((await caso.ejecutar({ colaboradorId: "c1", claveIdempotencia: "otra-clave-0002", cuerpo: FILTROS })).repetido, false);
  assert.equal((await caso.ejecutar({ colaboradorId: "c2", claveIdempotencia: CLAVE, cuerpo: FILTROS })).repetido, false);
  assert.equal(repositorioLotes.lotes.size, 4);
});

test("[EQ-83] La misma clave con otros filtros se rechaza", async () => {
  const { caso } = armar();
  await caso.ejecutar({ colaboradorId: "c1", claveIdempotencia: CLAVE, cuerpo: FILTROS });
  await assert.rejects(caso.ejecutar({ colaboradorId: "c1", claveIdempotencia: CLAVE, cuerpo: { ...FILTROS, enviarPorCorreo: true } }),
    (e) => e.codigo === "CLAVE_IDEMPOTENCIA_REUTILIZADA" && e.status === 422);
});

test("[EQ-83] Si la publicación se corta, el reintento publica solo lo que faltó", async () => {
  const bus = crearBusEnMemoria();
  let fallar = true;
  const publicarOriginal = bus.publicar;
  let intentos = 0;
  bus.publicar = async (rk, ev) => {
    intentos += 1;
    if (fallar && intentos === 2) throw new Error("conexión perdida");
    return publicarOriginal(rk, ev);
  };
  const { caso, repositorioLotes, eventos } = armar({ aspirantes: [asp("a1"), asp("a2"), asp("a3")], bus });

  await assert.rejects(caso.ejecutar({ colaboradorId: "c1", claveIdempotencia: CLAVE, cuerpo: FILTROS }), /conexión perdida/);
  assert.equal(repositorioLotes.lotes.size, 1, "el lote quedó guardado");
  assert.equal(eventos.length, 1);

  fallar = false;
  const reintento = await caso.ejecutar({ colaboradorId: "c1", claveIdempotencia: CLAVE, cuerpo: FILTROS });
  assert.equal(reintento.repetido, true);
  assert.equal(reintento.eventosPublicados, 2);
  assert.equal(new Set(eventos.map((e) => e.evento.eventId)).size, 3, "cada envío se publicó una sola vez");
  const [registro] = repositorioLotes.lotes.values();
  assert.ok(registro.envios.every((e) => e.publicadoEn));
});

test("[EQ-83] Un error dentro de la transacción no deja el lote a medias", async () => {
  const repo = new RepositorioLotesMemoria();
  const lote = { id: "l1", colaboradorId: "c1", claveIdempotencia: CLAVE, huella: "h", creadoEn: AHORA.toISOString() };
  await assert.rejects(repo.transaccion(async (tx) => {
    await tx.guardarLote({ lote, envios: [] });
    throw new Error("falla después de guardar");
  }));
  assert.equal(await repo.obtenerLote("l1"), null);
  await repo.transaccion((tx) => tx.guardarLote({ lote, envios: [] }));
  await assert.rejects(repo.guardarLote({ lote: { ...lote, id: "l2" }, envios: [] }), /clave de idempotencia/);
});

test("[EQ-83] PostgreSQL: transacción con bloqueo por colaborador y ROLLBACK si falla", async () => {
  const consultas = [];
  const cliente = {
    async query(sql, params) {
      consultas.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      if (sql.includes("INSERT INTO disparo.envio") && params[0] === "falla") throw new Error("violación");
      return { rows: [] };
    },
    release() { consultas.push({ sql: "RELEASE" }); },
  };
  const repo = new RepositorioLotesPostgres({ db: { query: cliente.query, connect: async () => cliente } });
  const lote = {
    id: "11111111-1111-4111-8111-111111111111", colaboradorId: "c1", claveIdempotencia: CLAVE, huella: "a".repeat(64),
    filtros: FILTROS, enviarPorCorreo: false, estado: "CREADO", totalAspirantes: 1, totalEnviosPendientes: 1, creadoEn: AHORA.toISOString(),
  };
  const envio = { id: "falla", loteId: lote.id, aspiranteId: "a1", canal: "WHATSAPP", estado: "PENDIENTE", mensajeId: "reactivacion_hu1",
    destino: "+526441234567", texto: "Hola", motivo: null, codigoMotivo: null, faltantes: [], publicadoEn: null };

  await assert.rejects(repo.transaccion(async (tx) => {
    await tx.bloquearColaborador("c1");
    await tx.guardarLote({ lote, envios: [envio] });
  }), /violación/);
  const sqls = consultas.map((c) => c.sql);
  assert.equal(sqls[0], "BEGIN");
  assert.match(sqls[1], /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  assert.deepEqual(consultas[1].params, ["disparo.lote:c1"]);
  assert.match(sqls[2], /^INSERT INTO disparo\.lote /);
  assert.deepEqual(sqls.slice(-2), ["ROLLBACK", "RELEASE"]);
  assert.ok(!sqls.includes("COMMIT"));
});

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const CUERPO = {
  semaforos: ["ROJO", "NARANJA"], carreras: ["Ingeniería en Software", "Licenciatura en Administración"],
  inactividadValor: 7, inactividadUnidad: "DIAS",
};

async function conServidor(opciones, fn) {
  const moduloMonitoreo = crearModuloMonitoreo();
  const bus = crearBusEnMemoria();
  const eventos = [];
  bus.suscribir("disparo.#", (evento, routingKey) => { eventos.push({ routingKey, evento }); });
  const servidor = crearServidor({ port: 0, reloj: () => AHORA.getTime(), duracionSesionMs: 86_400_000, moduloMonitoreo, bus, ...opciones });
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const login = async (identificador, password) => {
    const r = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identificador, password }),
    });
    return r.headers.get("set-cookie").split(";")[0];
  };
  const enviar = (cookie, cuerpo = CUERPO, clave) => fetch(`${base}/api/v1/disparo-mensajes/enviar`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", ...(clave ? { "Idempotency-Key": clave } : {}) },
    body: JSON.stringify(cuerpo),
  });
  try {
    await fn({ base, login, enviar, eventos, repositorio: moduloMonitoreo.repositorio });
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
}

test("[EQ-83] HTTP: solo el rol Colaborador puede enviar", async () => {
  await conServidor({}, async ({ base, login, enviar, eventos }) => {
    assert.equal((await fetch(`${base}/api/v1/disparo-mensajes/enviar`, { method: "POST", body: "{}" })).status, 401);
    const admin = await login("00000100001", "AdminPassword2026!");
    const r = await enviar(admin);
    assert.equal(r.status, 403);
    assert.equal((await r.json()).codigo, "SIN_PERMISO");
    assert.equal(eventos.length, 0);
  });
});

test("[EQ-83] HTTP: crea el lote, publica por aspirante y canal y el consumidor simulado registra el mensaje", async () => {
  await conServidor({}, async ({ login, enviar, eventos, repositorio }) => {
    const cookie = await login("00000252115", "Password123!");
    const antes = repositorio.conversaciones.length;
    const r = await enviar(cookie, { ...CUERPO, enviarPorCorreo: true }, "lote-http-00000001");
    const cuerpo = await r.json();

    assert.equal(r.status, 200);
    assert.equal(cuerpo.repetido, false);
    assert.match(cuerpo.loteId, /^[0-9a-f-]{36}$/);
    assert.ok(cuerpo.totalEnviados > 0);
    assert.equal(cuerpo.envios.whatsapp, cuerpo.totalEnviados);
    assert.equal(eventos.filter((e) => e.routingKey === "disparo.envio.solicitado.whatsapp").length, cuerpo.envios.whatsapp);
    assert.equal(eventos.filter((e) => e.routingKey === "disparo.envio.solicitado.correo").length, cuerpo.envios.correo);
    assert.ok(eventos.every((e) => e.evento.datos.loteId === cuerpo.loteId));
    assert.equal(repositorio.conversaciones.length - antes, cuerpo.envios.whatsapp);
    assert.equal(cuerpo.estadoHorario.permitido, true);
  });
});

test("[EQ-83] HTTP: doble clic con la misma clave crea un solo lote y un solo mensaje por aspirante", async () => {
  await conServidor({}, async ({ login, enviar, eventos, repositorio }) => {
    const cookie = await login("00000252115", "Password123!");
    const antes = repositorio.conversaciones.length;
    const [r1, r2] = await Promise.all([enviar(cookie, CUERPO, "doble-clic-000001"), enviar(cookie, CUERPO, "doble-clic-000001")]);
    const [c1, c2] = [await r1.json(), await r2.json()];

    assert.deepEqual([r1.status, r2.status], [200, 200]);
    assert.equal(c1.loteId, c2.loteId);
    assert.deepEqual([c1.repetido, c2.repetido].sort(), [false, true]);
    assert.equal(c1.totalEnviados, c2.totalEnviados);
    assert.equal(eventos.length, c1.envios.whatsapp);
    assert.equal(repositorio.conversaciones.length - antes, c1.envios.whatsapp);

    // Un reintento posterior con la misma clave tampoco reenvía.
    const r3 = await (await enviar(cookie, CUERPO, "doble-clic-000001")).json();
    assert.equal(r3.repetido, true);
    assert.equal(eventos.length, c1.envios.whatsapp);
  });
});

test("[EQ-83] HTTP: un lote nuevo recalcula (tras enviar ya no quedan aplicables) y la clave inválida se rechaza", async () => {
  await conServidor({}, async ({ login, enviar }) => {
    const cookie = await login("00000252115", "Password123!");
    assert.equal((await enviar(cookie, CUERPO, "primer-lote-000001")).status, 200);

    const otro = await enviar(cookie, CUERPO, "segundo-lote-00002");
    assert.equal(otro.status, 400);
    assert.equal((await otro.json()).codigo, "SIN_ASPIRANTES");

    const mala = await enviar(cookie, CUERPO, "no valida!");
    assert.equal(mala.status, 400);
    assert.equal((await mala.json()).codigo, "CLAVE_IDEMPOTENCIA_INVALIDA");

    const reusada = await enviar(cookie, { ...CUERPO, enviarPorCorreo: true }, "primer-lote-000001");
    assert.equal(reusada.status, 422);
  });
});

test("[EQ-83] HTTP: sin consumidor simulado, solo se publican los eventos", async () => {
  await conServidor({ simularEnvios: false }, async ({ login, enviar, eventos, repositorio }) => {
    const cookie = await login("00000252115", "Password123!");
    const antes = repositorio.conversaciones.length;
    const cuerpo = await (await enviar(cookie, CUERPO, "sin-consumidor-001")).json();
    assert.equal(eventos.length, cuerpo.envios.whatsapp);
    assert.equal(repositorio.conversaciones.length, antes);
  });
});
