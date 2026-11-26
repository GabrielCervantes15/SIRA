/**
 * EQ-81 (HU1-5) · Vista previa del lote: conteo de aspirantes aplicables.
 * Reglas: docs/decisiones/HU1-reglas-lote-envio.md (EQ-77).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearServidor } from "../src/servidor.js";
import { crearModuloMonitoreo } from "../src/modulos/monitoreo/index.js";
import {
  calcularFechaCorte,
  crearServicioVistaPreviaLote,
  horasContactoPrevio,
  normalizarFiltrosLote,
  opcionesDesdeFiltrosHU27,
  ultimoContactoSaliente,
  validarFiltrosVistaPrevia,
} from "../src/modulos/disparo-automatico/vista-previa-lote.js";

const AHORA = new Date("2026-11-21T18:00:00.000Z");
const HACE = (horas) => new Date(AHORA.getTime() - horas * 3_600_000).toISOString();

// ---------------------------------------------------------------------------
// Repositorio falso con la forma del de Monitoreo (HU2-7 y HU3-5).
// ---------------------------------------------------------------------------
function crearRepositorioFalso({ aspirantes, conversaciones = [], carreras = ["Software", "Administración"] }) {
  const llamadas = { listar: [], conversacion: [] };
  return {
    llamadas,
    async obtenerFiltrosColaborador() {
      return { carreras, semaforos: ["Verde", "Naranja", "Rojo"], preparatorias: [], periodos: [], estadosSolicitud: [] };
    },
    async listarAspirantes(filtros) {
      llamadas.listar.push(filtros);
      return { aspirantes: aspirantes.filter((a) => a.colaboradorId === filtros.colaboradorId) };
    },
    async obtenerConversacionAspirante(id) {
      llamadas.conversacion.push(id);
      return conversaciones.filter((m) => m.aspiranteId === id);
    },
  };
}

const asp = (id, extra = {}) => ({
  id, colaboradorId: "colab-1", semaforo: "ROJO", estadoSolicitud: "RECIBIDA",
  carreraSolicitada: "Software", fechaUltimaActividad: HACE(24 * 10), ...extra,
});

const FILTROS = { semaforos: "ROJO,NARANJA", carreras: "Software,Administración", inactividadValor: 7, inactividadUnidad: "DIAS" };

function servicio(repo, configuracion = null) {
  return crearServicioVistaPreviaLote({
    repositorioMonitoreo: repo,
    interfazLecturaConfiguracion: configuracion ? { obtenerConfiguracionVigente: () => configuracion } : null,
    reloj: () => AHORA,
  });
}

// ---------------------------------------------------------------------------
// Unitarias
// ---------------------------------------------------------------------------
test("[EQ-81] Fecha de corte: días y semanas en bloques exactos; meses de calendario con último día", () => {
  assert.equal(calcularFechaCorte(7, "DIAS", AHORA).toISOString(), "2026-11-14T18:00:00.000Z");
  assert.equal(calcularFechaCorte(2, "SEMANAS", AHORA).toISOString(), "2026-11-07T18:00:00.000Z");
  assert.equal(calcularFechaCorte(1, "MESES", AHORA).toISOString(), "2026-10-21T18:00:00.000Z");
  assert.equal(calcularFechaCorte(1, "MESES", new Date("2026-03-31T10:00:00Z")).toISOString(), "2026-02-28T10:00:00.000Z");
  assert.equal(calcularFechaCorte(1, "MESES", new Date("2028-03-31T10:00:00Z")).toISOString(), "2028-02-29T10:00:00.000Z");
  assert.equal(calcularFechaCorte(3, "MESES", new Date("2027-01-15T00:00:00Z")).toISOString(), "2026-10-15T00:00:00.000Z");
  assert.equal(calcularFechaCorte(1, "dias", AHORA).toISOString(), "2026-11-20T18:00:00.000Z", "la unidad no distingue mayúsculas");
  assert.throws(() => calcularFechaCorte(1, "AÑOS", AHORA), RangeError);
});

test("[EQ-81] Normaliza filtros de URL y de JSON", () => {
  assert.deepEqual(normalizarFiltrosLote({ semaforos: "rojo, Naranja,,ROJO", carreras: "Software", inactividadValor: "7", inactividadUnidad: "dias" }), {
    semaforos: ["ROJO", "NARANJA"], carreras: ["Software"], inactividadValor: 7, inactividadUnidad: "DIAS",
  });
  assert.deepEqual(normalizarFiltrosLote({ semaforos: ["ROJO"], carreras: [" Software "] }).carreras, ["Software"]);
  assert.deepEqual(normalizarFiltrosLote({}).semaforos, []);
});

test("[EQ-81] Opciones de HU2-7 sin verde", () => {
  assert.deepEqual(opcionesDesdeFiltrosHU27({ semaforos: ["Verde", "Naranja", "Rojo"], carreras: ["Software"] }), {
    semaforos: ["NARANJA", "ROJO"], carreras: ["Software"],
  });
  assert.deepEqual(opcionesDesdeFiltrosHU27({}).semaforos, []);
});

test("[EQ-81] Valida al menos una opción de semáforo y de carrera, dentro de las opciones", () => {
  const opciones = { semaforos: ["NARANJA", "ROJO"], carreras: ["Software"] };
  const v = (f) => validarFiltrosVistaPrevia(normalizarFiltrosLote({ ...FILTROS, carreras: "Software", ...f }), opciones);

  assert.equal(v({}).valido, true);
  assert.match(v({ semaforos: "" }).errores.semaforos, /al menos un semáforo/);
  assert.match(v({ semaforos: "VERDE" }).errores.semaforos, /verde/);
  assert.match(v({ semaforos: "AZUL" }).errores.semaforos, /Solo se permite/);
  assert.match(v({ carreras: "" }).errores.carreras, /al menos una carrera/);
  assert.match(v({ carreras: "Medicina" }).errores.carreras, /tu cartera/);
  for (const valor of [0, -1, 1.5, 1000, "abc"]) assert.ok(v({ inactividadValor: valor }).errores.inactividadValor, `valor ${valor}`);
  assert.ok(v({ inactividadUnidad: "HORAS" }).errores.inactividadUnidad);
});

test("[EQ-81] Tiempo de espera de HU9: usa la configuración vigente y 48 h por omisión", () => {
  assert.equal(horasContactoPrevio(null), 48);
  assert.equal(horasContactoPrevio({ tiempoEsperaContactoPrevio: { valor: 48, unidad: "horas", equivalenciaHoras: 48 } }), 48);
  assert.equal(horasContactoPrevio({ tiempoEsperaContactoPrevio: { valor: 3, unidad: "dias" } }), 72);
  assert.equal(horasContactoPrevio({ tiempoEsperaContactoPrevio: { valor: 0, unidad: "horas" } }), 48);
});

test("[EQ-81] Último contacto: solo salientes enviados correctamente", () => {
  const fecha = ultimoContactoSaliente([
    { direccion: "SALIENTE", estadoEntrega: "ENTREGADO", fechaEnvio: HACE(30) },
    { direccion: "SALIENTE", estadoEntrega: "FALLIDO", fechaEnvio: HACE(1) },
    { direccion: "SALIENTE", estadoEntrega: "PENDIENTE", fechaEnvio: HACE(2) },
    { direccion: "ENTRANTE", estadoEntrega: "LEIDO", fechaEnvio: HACE(3) },
    { direccion: "SALIENTE", estadoEntrega: "LEIDO", fechaEnvio: HACE(20) },
  ]);
  assert.equal(fecha.toISOString(), HACE(20));
  assert.equal(ultimoContactoSaliente([]), null);
});

test("[EQ-81] Cuenta solo la cartera del colaborador y excluye verde, aceptadas y rechazadas", async () => {
  const repo = crearRepositorioFalso({
    aspirantes: [
      asp("a1"),
      asp("a2", { semaforo: "NARANJA", carreraSolicitada: "Administración" }),
      asp("verde", { semaforo: "VERDE" }),
      asp("aceptada", { estadoSolicitud: "ACEPTADA" }),
      asp("rechazada", { estadoSolicitud: "RECHAZADA" }),
      asp("otra-cartera", { colaboradorId: "colab-2" }),
    ],
  });
  const r = await servicio(repo).calcular("colab-1", FILTROS);

  assert.equal(r.valido, true);
  assert.deepEqual(r.elegibles.map((a) => a.id), ["a1", "a2"]);
  assert.equal(r.total, 2);
  assert.deepEqual(r.excluidos, { verde: 1, estadoSolicitud: 2, contactoReciente: 0 });
  assert.equal(repo.llamadas.listar[0].colaboradorId, "colab-1");
  assert.equal(repo.llamadas.listar[0].mostrarAceptados, true);
});

test("[EQ-81] Respeta los filtros de semáforo y carrera", async () => {
  const repo = crearRepositorioFalso({
    aspirantes: [asp("rojo-sw"), asp("naranja-sw", { semaforo: "NARANJA" }), asp("rojo-adm", { carreraSolicitada: "Administración" })],
  });
  const r = await servicio(repo).calcular("colab-1", { ...FILTROS, semaforos: "ROJO", carreras: "Software" });
  assert.deepEqual(r.elegibles.map((a) => a.id), ["rojo-sw"]);
});

test("[EQ-81] Inactividad mínima: el límite de la fecha de corte es inclusivo", async () => {
  const repo = crearRepositorioFalso({
    aspirantes: [
      asp("justo", { fechaUltimaActividad: HACE(24 * 7) }),
      asp("un-segundo-despues", { fechaUltimaActividad: new Date(AHORA.getTime() - 7 * 86_400_000 + 1000).toISOString() }),
      asp("sin-actividad", { fechaUltimaActividad: null, fechaSolicitud: HACE(24 * 30) }),
      asp("sin-fechas", { fechaUltimaActividad: null }),
    ],
  });
  const r = await servicio(repo).calcular("colab-1", FILTROS);
  assert.deepEqual(r.elegibles.map((a) => a.id), ["justo", "sin-actividad"]);
  assert.equal(r.fechaCorte.toISOString(), "2026-11-14T18:00:00.000Z");
});

test("[EQ-81] Excluye a quien está dentro del tiempo de espera de HU9", async () => {
  const repo = crearRepositorioFalso({
    aspirantes: [asp("hace-10h"), asp("hace-47h"), asp("hace-48h"), asp("fallido"), asp("sin-mensajes")],
    conversaciones: [
      { aspiranteId: "hace-10h", direccion: "SALIENTE", estadoEntrega: "ENVIADO", fechaEnvio: HACE(10) },
      { aspiranteId: "hace-47h", direccion: "SALIENTE", estadoEntrega: "ENTREGADO", fechaEnvio: HACE(47) },
      { aspiranteId: "hace-48h", direccion: "SALIENTE", estadoEntrega: "LEIDO", fechaEnvio: HACE(48) },
      { aspiranteId: "fallido", direccion: "SALIENTE", estadoEntrega: "FALLIDO", fechaEnvio: HACE(1) },
    ],
  });
  const r = await servicio(repo).calcular("colab-1", FILTROS);
  assert.deepEqual(r.elegibles.map((a) => a.id), ["hace-48h", "fallido", "sin-mensajes"]);
  assert.equal(r.excluidos.contactoReciente, 2);

  const con24h = await servicio(repo, { tiempoEsperaContactoPrevio: { valor: 24, unidad: "horas", equivalenciaHoras: 24 } })
    .calcular("colab-1", FILTROS);
  assert.equal(con24h.horasContactoPrevio, 24);
  assert.deepEqual(con24h.elegibles.map((a) => a.id), ["hace-47h", "hace-48h", "fallido", "sin-mensajes"]);
});

test("[EQ-81] Con filtros inválidos no consulta la cartera y devuelve las opciones", async () => {
  const repo = crearRepositorioFalso({ aspirantes: [asp("a1")] });
  const r = await servicio(repo).calcular("colab-1", { inactividadValor: 7, inactividadUnidad: "DIAS" });
  assert.equal(r.valido, false);
  assert.equal(r.total, 0);
  assert.deepEqual(r.opciones, { semaforos: ["NARANJA", "ROJO"], carreras: ["Software", "Administración"] });
  assert.equal(repo.llamadas.listar.length, 0);
});

test("[EQ-81] Solo consulta mensajes de quienes pasaron los demás filtros", async () => {
  const repo = crearRepositorioFalso({ aspirantes: [asp("a1"), asp("verde", { semaforo: "VERDE" }), asp("reciente", { fechaUltimaActividad: HACE(1) })] });
  await servicio(repo).calcular("colab-1", FILTROS);
  assert.deepEqual(repo.llamadas.conversacion, ["a1"]);
});

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
async function conServidor(fn) {
  const moduloMonitoreo = crearModuloMonitoreo();
  const servidor = crearServidor({ port: 0, reloj: () => AHORA.getTime(), duracionSesionMs: 7 * 86_400_000, moduloMonitoreo });
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    await fn({ base, repositorio: moduloMonitoreo.repositorio });
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
}

async function login(base, identificador, password) {
  const r = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identificador, password }),
  });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}

const RUTA = "/api/v1/disparo-mensajes/vista-previa";
const QUERY = "?semaforos=ROJO,NARANJA&carreras=Ingenier%C3%ADa%20en%20Software,Licenciatura%20en%20Administraci%C3%B3n&inactividadValor=7&inactividadUnidad=DIAS";

test("[EQ-81] HTTP: sin sesión responde 401", async () => {
  await conServidor(async ({ base }) => {
    assert.equal((await fetch(base + RUTA + QUERY)).status, 401);
  });
});

test("[EQ-81] HTTP: filtros inválidos responden 200 con valido:false, errores y opciones de HU2-7 sin verde", async () => {
  await conServidor(async ({ base }) => {
    const cookie = await login(base, "00000252115", "Password123!");
    const r = await fetch(`${base}${RUTA}?inactividadValor=7&inactividadUnidad=DIAS`, { headers: { Cookie: cookie } });
    const cuerpo = await r.json();
    assert.equal(r.status, 200);
    assert.equal(cuerpo.valido, false);
    assert.ok(cuerpo.errores.semaforos && cuerpo.errores.carreras);
    assert.deepEqual(cuerpo.semaforosDisponibles, ["NARANJA", "ROJO"]);
    assert.deepEqual(cuerpo.carrerasDisponibles, ["Ingeniería en Software", "Licenciatura en Administración"]);
    assert.equal(cuerpo.total, 0);
    assert.equal(cuerpo.fechaCorte, null);
  });
});

test("[EQ-81] HTTP: cuenta con los datos semilla y excluye rechazadas y contacto reciente", async () => {
  await conServidor(async ({ base, repositorio }) => {
    const cookie = await login(base, "00000252115", "Password123!");
    const pedir = async (query = QUERY) => (await fetch(base + RUTA + query, { headers: { Cookie: cookie } })).json();

    const inicial = await pedir();
    assert.equal(inicial.valido, true);
    assert.equal(inicial.total, 19);
    assert.deepEqual(inicial.excluidos, { verde: 16, estadoSolicitud: 5, contactoReciente: 0 });
    assert.equal(inicial.fechaCorte, "2026-11-14T18:00:00.000Z");
    assert.equal(inicial.horasContactoPrevio, 48);
    assert.ok(inicial.mensajesEjemplo.length > 0);

    // Un mensaje saliente correcto hace 5 h saca a un aspirante del conteo; uno fallido no.
    const { aspirantes } = await repositorio.listarAspirantes({ colaboradorId: "00000252115", mostrarAceptados: true, limit: 1000 });
    const [uno, dos] = aspirantes.filter((a) => a.semaforo === "ROJO" && a.estadoSolicitud !== "RECHAZADA"
      && new Date(a.fechaUltimaActividad) <= new Date("2026-11-14T18:00:00Z"));
    repositorio.conversaciones.push(
      { id: "eq81-1", aspiranteId: uno.id, direccion: "SALIENTE", estadoEntrega: "ENVIADO", fechaEnvio: HACE(5) },
      { id: "eq81-2", aspiranteId: dos.id, direccion: "SALIENTE", estadoEntrega: "FALLIDO", fechaEnvio: HACE(5) },
    );
    const despues = await pedir();
    assert.equal(despues.total, 18);
    assert.equal(despues.excluidos.contactoReciente, 1);

    // Por semanas y meses la fecha de corte se recorre y el conteo no crece.
    const meses = await pedir(QUERY.replace("inactividadValor=7&inactividadUnidad=DIAS", "inactividadValor=1&inactividadUnidad=MESES"));
    assert.equal(meses.fechaCorte, "2026-10-21T18:00:00.000Z");
    assert.ok(meses.total <= despues.total);
  });
});

test("[EQ-81] HTTP: no se puede pedir la cartera de otro colaborador ni carreras ajenas", async () => {
  await conServidor(async ({ base }) => {
    const cookie = await login(base, "00000252115", "Password123!");
    const conOtro = await (await fetch(`${base}${RUTA}${QUERY}&colaboradorId=colab-999`, { headers: { Cookie: cookie } })).json();
    const normal = await (await fetch(base + RUTA + QUERY, { headers: { Cookie: cookie } })).json();
    assert.equal(conOtro.total, normal.total);

    const ajena = await (await fetch(`${base}${RUTA}?semaforos=ROJO&carreras=Medicina&inactividadValor=7&inactividadUnidad=DIAS`, { headers: { Cookie: cookie } })).json();
    assert.equal(ajena.valido, false);
    assert.match(ajena.errores.carreras, /tu cartera/);
  });
});

test("[EQ-81] HTTP: el envío usa las mismas reglas que la vista previa", async () => {
  // Lunes 16 nov 2026, 10:00 en Hermosillo: dentro de horario.
  const moduloMonitoreo = crearModuloMonitoreo();
  const instante = Date.parse("2026-11-16T17:00:00.000Z");
  const servidor = crearServidor({ port: 0, reloj: () => instante, duracionSesionMs: 86_400_000, moduloMonitoreo });
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const cookie = await login(base, "00000252115", "Password123!");
    const previa = await (await fetch(base + RUTA + QUERY, { headers: { Cookie: cookie } })).json();
    assert.ok(previa.total > 0);

    const envio = await fetch(`${base}/api/v1/disparo-mensajes/enviar`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        semaforos: ["ROJO", "NARANJA"],
        carreras: ["Ingeniería en Software", "Licenciatura en Administración"],
        inactividadValor: 7, inactividadUnidad: "DIAS",
      }),
    });
    assert.equal(envio.status, 200);
    assert.equal((await envio.json()).totalEnviados, previa.total);

    const sinCarrera = await fetch(`${base}/api/v1/disparo-mensajes/enviar`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ semaforos: ["ROJO"], carreras: [], inactividadValor: 7, inactividadUnidad: "DIAS" }),
    });
    assert.equal(sinCarrera.status, 400);
    assert.equal((await sinCarrera.json()).codigo, "FILTROS_INVALIDOS");
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
});
