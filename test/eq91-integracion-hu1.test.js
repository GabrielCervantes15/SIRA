/**
 * EQ-91 (HU1-15) · Pruebas de integración de HU1 con datos semilla y adaptadores simulados.
 *
 * Un lote completo atraviesa el sistema real (servidor, vista previa, lote, bus, colas,
 * consumidor de resultados, Monitoreo y HU9) con WhatsApp simulado (BASE-10 / EQ-114) y
 * SMTP simulado (EQ-61). Cubre: eventos, reintentos, fallos parciales, historial, conteo,
 * horario leído de HU9 y aislamiento entre colaboradores.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearServidor } from "../src/servidor.js";
import { crearModuloMonitoreo } from "../src/modulos/monitoreo/index.js";
import { crearBusEnMemoria } from "../src/compartido/eventos/bus-en-memoria.js";
import { crearProveedorWhatsAppSimulado, ErrorWhatsApp } from "../src/modulos/whatsapp/index.js";
import { crearServicioCorreoSimulado } from "../src/modulos/notificaciones/servicio-correo-simulado.js";

// Reloj que avanza en tiempo real desde el lunes 16/11/2026 10:00 (Hermosillo), para que
// las esperas de los reintentos transcurran de verdad (en milisegundos).
const INICIO = Date.parse("2026-11-16T17:00:00.000Z");
const COLABORADOR_A = { id: "00000252115", password: "Password123!" }; // Software y Administración
const COLABORADOR_B = { id: "00000233231", password: "Password123!" }; // Industrial y Psicología
const ADMIN = { id: "00000100001", password: "AdminPassword2026!" };
const CUERPO_A = {
  semaforos: ["ROJO", "NARANJA"], carreras: ["Ingeniería en Software", "Licenciatura en Administración"],
  inactividadValor: 7, inactividadUnidad: "DIAS", enviarPorCorreo: true,
};
const COLAS_RAPIDAS = { mensajesPorSegundo: 10_000, esperaBaseMs: 5, esperaMaximaMs: 20 };

/** WhatsApp simulado de BASE-10 con fallas a pedido por número. */
function whatsappConFallas({ reloj }) {
  const simulado = crearProveedorWhatsAppSimulado({ reloj });
  const fallasTemporales = new Map(); // teléfono → cuántas veces fallar
  const rechazos = new Set();
  const intentos = new Map();
  return {
    fallasTemporales, rechazos, intentos,
    async enviarPlantilla(solicitud) {
      intentos.set(solicitud.telefono, (intentos.get(solicitud.telefono) ?? 0) + 1);
      const restantes = fallasTemporales.get(solicitud.telefono) ?? 0;
      if (restantes > 0) {
        fallasTemporales.set(solicitud.telefono, restantes - 1);
        throw new ErrorWhatsApp("SERVICIO_NO_DISPONIBLE", "WhatsApp simulado caído.", { reintentable: true });
      }
      if (rechazos.has(solicitud.telefono)) simulado.simularRechazoSiguiente();
      return simulado.enviarPlantilla(solicitud);
    },
    obtenerEstadoEntrega: (id) => simulado.obtenerEstadoEntrega(id),
  };
}

async function conSistema(fn) {
  const reloj = () => new Date(INICIO + (Date.now() - arranque));
  const arranque = Date.now();
  const moduloMonitoreo = crearModuloMonitoreo();
  const bus = crearBusEnMemoria();
  const eventos = [];
  bus.suscribir("disparo.#", (evento, routingKey) => { eventos.push({ routingKey, evento }); });
  const whatsapp = whatsappConFallas({ reloj });
  const smtp = crearServicioCorreoSimulado({ fallarVeces: 2 });
  const historialMonitoreo = [];
  const servidor = crearServidor({
    port: 0, reloj: () => reloj().getTime(), duracionSesionMs: 86_400_000, moduloMonitoreo, bus, historialMonitoreo,
    proveedorWhatsApp: whatsapp, servicioCorreoDisparo: smtp, colaEnvioWhatsApp: COLAS_RAPIDAS, colaEnvioCorreo: COLAS_RAPIDAS,
  });
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const login = async ({ id, password }) => (await fetch(`${base}/api/v1/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identificador: id, password }),
  })).headers.get("set-cookie").split(";")[0];
  const pedir = async (cookie, ruta, { metodo = "GET", cuerpo, clave } = {}) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { Cookie: cookie, ...(cuerpo ? { "Content-Type": "application/json" } : {}), ...(clave ? { "Idempotency-Key": clave } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    return { status: r.status, cuerpo: await r.json() };
  };
  const query = (c) => `?semaforos=${c.semaforos.join(",")}&carreras=${c.carreras.map(encodeURIComponent).join(",")}`
    + `&inactividadValor=${c.inactividadValor}&inactividadUnidad=${c.inactividadUnidad}`;
  try {
    await fn({
      login, pedir, query, eventos, whatsapp, smtp, historialMonitoreo,
      repositorio: moduloMonitoreo.repositorio, esperar: () => servidor.esperarEnviosHU1(),
    });
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
}

const porTipo = (eventos, routingKey) => eventos.filter((e) => e.routingKey === routingKey);
const buscar = (repositorio, nombre) => repositorio.aspirantes.find((a) => a.nombreCompleto === nombre);

test("[EQ-91] Lote completo con WhatsApp y SMTP simulados: eventos, reintentos, fallos parciales, historial y conteo", async () => {
  await conSistema(async ({ login, pedir, query, eventos, whatsapp, smtp, historialMonitoreo, repositorio, esperar }) => {
    const cookie = await login(COLABORADOR_A);

    // Preparación sobre la semilla: una caída temporal de WhatsApp, un rechazo permanente y un correo inválido.
    const carlos = buscar(repositorio, "Carlos Mendoza Armenta");
    const ximena = buscar(repositorio, "Ximena Romero Armenta");
    const hector = buscar(repositorio, "Héctor Mendoza López");
    whatsapp.fallasTemporales.set(carlos.telefono, 2);
    whatsapp.rechazos.add(ximena.telefono);
    hector.correo = "correo-sin-arroba";

    const previa = await pedir(cookie, `/api/v1/disparo-mensajes/vista-previa${query(CUERPO_A)}`);
    assert.equal(previa.status, 200);
    const N = previa.cuerpo.total;
    assert.ok(N >= 10, `la semilla da ${N} aplicables`);

    const envio = await pedir(cookie, "/api/v1/disparo-mensajes/enviar", { metodo: "POST", cuerpo: CUERPO_A, clave: "eq91-lote-completo-1" });
    assert.equal(envio.status, 200);
    const lote = envio.cuerpo;
    assert.deepEqual([lote.totalAspirantes, lote.envios.whatsapp, lote.envios.correo], [N, N, N - 1]);
    assert.equal(lote.correo.fallidos, 1, "el correo inválido no sale");
    await esperar();

    // Eventos: uno solicitado por aspirante y canal; un resultado final por cada uno.
    assert.equal(porTipo(eventos, "disparo.envio.solicitado.whatsapp").length, N);
    assert.equal(porTipo(eventos, "disparo.envio.solicitado.correo").length, N - 1);
    assert.equal(porTipo(eventos, "disparo.envio.enviado.whatsapp").length, N - 1);
    assert.equal(porTipo(eventos, "disparo.envio.fallido.whatsapp").length, 1);
    assert.equal(porTipo(eventos, "disparo.envio.enviado.correo").length, N - 1);
    assert.ok(eventos.every((e) => e.evento.datos.loteId === lote.loteId));

    // Reintentos: WhatsApp de Carlos se recuperó al tercer intento; el SMTP, tras dos caídas.
    assert.equal(whatsapp.intentos.get(carlos.telefono), 3);
    const enviadoCarlos = porTipo(eventos, "disparo.envio.enviado.whatsapp").find((e) => e.evento.datos.aspiranteId === carlos.id);
    assert.equal(enviadoCarlos.evento.datos.intentos, 3);
    // Las 2 caídas del SMTP se reparten entre los correos que estén en turno: en total, 2 reintentos.
    const reintentosCorreo = porTipo(eventos, "disparo.envio.enviado.correo").reduce((suma, e) => suma + e.evento.datos.intentos - 1, 0);
    assert.equal(reintentosCorreo, 2);
    assert.equal(smtp.bandeja().length, N - 1);
    assert.ok(smtp.bandeja().every((c) => /todavía puede continuar/.test(c.texto) && c.asunto));

    // Fallos parciales: los canales son independientes (EQ-77 §8.3).
    const [rechazo] = porTipo(eventos, "disparo.envio.fallido.whatsapp");
    assert.deepEqual([rechazo.evento.datos.aspiranteId, rechazo.evento.datos.codigo], [ximena.id, "ENVIO_RECHAZADO"]);
    assert.ok(smtp.bandeja().some((c) => c.para === ximena.correo), "a Ximena sí le llegó el correo");
    assert.ok(!smtp.bandeja().some((c) => c.para === "correo-sin-arroba"));

    // Historial: un MENSAJE_AUTOMATICO por canal y resultado; el fallo, sin contar.
    const de = (id) => repositorio.historial.filter((h) => h.aspiranteId === id && h.tipoEvento === "MENSAJE_AUTOMATICO").map((h) => h.titulo).sort();
    assert.deepEqual(de(carlos.id), ["Mensaje automático enviado por WhatsApp", "Mensaje automático enviado por correo"]);
    assert.deepEqual(de(ximena.id), ["Mensaje automático enviado por correo", "Mensaje automático no enviado por WhatsApp"]);
    assert.deepEqual(de(hector.id), ["Mensaje automático enviado por WhatsApp"]);
    assert.equal(historialMonitoreo.length, (N - 1) + 1 + (N - 1));

    // Conteo: por aspirante (todos recibieron por al menos un canal), una vez por lote.
    const conteo = await pedir(cookie, `/api/v1/disparo-mensajes/lotes/${lote.loteId}`);
    assert.deepEqual(
      [conteo.cuerpo.notificados, conteo.cuerpo.fallidos, conteo.cuerpo.pendientes, conteo.cuerpo.diferidos, conteo.cuerpo.completo],
      [N, 0, 0, 0, true],
    );
    assert.deepEqual(conteo.cuerpo.porCanal.WHATSAPP, { enviados: N - 1, fallidos: 1, diferidos: 0, pendientes: 0, noEnviables: 0 });
    assert.deepEqual(conteo.cuerpo.porCanal.CORREO, { enviados: N - 1, fallidos: 0, diferidos: 0, pendientes: 0, noEnviables: 1 });
    assert.equal(carlos.vecesNotificado, 1, "dos canales en el mismo lote cuentan una vez");
    assert.equal(ximena.vecesNotificado, 1);
    assert.ok(carlos.fechaUltimaNotificacion);
    assert.notEqual(carlos.fechaUltimaActividad, carlos.fechaUltimaNotificacion, "la última actividad no cambia");
  });
});

test("[EQ-91] Horario leído de HU9: lo que el administrador configura bloquea o permite el envío al momento", async () => {
  await conSistema(async ({ login, pedir, query, eventos }) => {
    const colaborador = await login(COLABORADOR_A);
    const admin = await login(ADMIN);
    const configuracion = (await pedir(admin, "/api/v1/mensajes/configuracion")).cuerpo;

    // El administrador apaga el lunes desde el panel ⚙.
    const sinLunes = structuredClone(configuracion);
    sinLunes.jornada.lunes = { habilitado: false, horaInicio: null, horaFin: null };
    assert.equal((await pedir(admin, "/api/v1/mensajes/configuracion", { metodo: "PUT", cuerpo: sinLunes })).status, 200);

    const previa = await pedir(colaborador, `/api/v1/disparo-mensajes/vista-previa${query(CUERPO_A)}`);
    assert.deepEqual([previa.status, previa.cuerpo.dentroDeHorario], [200, false], "se puede consultar fuera de horario");
    assert.ok(previa.cuerpo.total > 0);
    const bloqueado = await pedir(colaborador, "/api/v1/disparo-mensajes/enviar", { metodo: "POST", cuerpo: CUERPO_A, clave: "eq91-horario-00001" });
    assert.deepEqual([bloqueado.status, bloqueado.cuerpo.codigo], [409, "FUERA_DE_HORARIO_PERMITIDO"]);
    assert.equal(eventos.length, 0, "no se creó ni publicó nada");

    // Lo vuelve a habilitar: el mismo envío pasa sin reiniciar nada.
    assert.equal((await pedir(admin, "/api/v1/mensajes/configuracion", { metodo: "PUT", cuerpo: configuracion })).status, 200);
    const permitido = await pedir(colaborador, "/api/v1/disparo-mensajes/enviar", { metodo: "POST", cuerpo: CUERPO_A, clave: "eq91-horario-00001" });
    assert.equal(permitido.status, 200);
    assert.equal(permitido.cuerpo.repetido, false);
  });
});

test("[EQ-91] Aislamiento entre colaboradores: cada uno trabaja solo con su cartera y sus lotes", async () => {
  await conSistema(async ({ login, pedir, query, repositorio, esperar }) => {
    const a = await login(COLABORADOR_A);
    const b = await login(COLABORADOR_B);
    const carteraB = repositorio.aspirantes.filter((x) => ["colab-002", "00000233231"].includes(x.colaboradorId)).map((x) => x.id);
    assert.ok(carteraB.length > 0);

    // Opciones: cada quien ve sus carreras.
    const opcionesB = (await pedir(b, "/api/v1/disparo-mensajes/vista-previa?inactividadValor=7&inactividadUnidad=DIAS")).cuerpo;
    assert.deepEqual(opcionesB.carrerasDisponibles.sort(), ["Ingeniería Industrial", "Licenciatura en Psicología"]);

    // B no puede pedir las carreras de A, ni con un colaboradorId en el cuerpo o en la URL.
    const ajeno = await pedir(b, "/api/v1/disparo-mensajes/enviar", {
      metodo: "POST", cuerpo: { ...CUERPO_A, colaboradorId: COLABORADOR_A.id }, clave: "eq91-ajeno-000001",
    });
    assert.deepEqual([ajeno.status, ajeno.cuerpo.codigo], [400, "FILTROS_INVALIDOS"]);
    assert.match(ajeno.cuerpo.errores.carreras, /tu cartera/);
    const porUrl = await pedir(b, `/api/v1/disparo-mensajes/vista-previa${query(CUERPO_A)}&colaboradorId=${COLABORADOR_A.id}`);
    assert.equal(porUrl.cuerpo.valido, false);

    // A envía su lote: nada toca la cartera de B, y B no puede ver el lote de A.
    const loteA = (await pedir(a, "/api/v1/disparo-mensajes/enviar", { metodo: "POST", cuerpo: CUERPO_A, clave: "eq91-aislado-00001" })).cuerpo;
    await esperar();
    assert.equal((await pedir(b, `/api/v1/disparo-mensajes/lotes/${loteA.loteId}`)).status, 404);
    assert.equal((await pedir(a, `/api/v1/disparo-mensajes/lotes/${loteA.loteId}`)).status, 200);
    assert.ok(!repositorio.historial.some((h) => carteraB.includes(h.aspiranteId) && h.tipoEvento === "MENSAJE_AUTOMATICO"));
    assert.ok(repositorio.aspirantes.filter((x) => carteraB.includes(x.id)).every((x) => !x.fechaUltimaNotificacion));

    // La misma clave de idempotencia en otro colaborador no choca: es otro lote.
    const cuerpoB = { semaforos: ["ROJO", "NARANJA"], carreras: opcionesB.carrerasDisponibles, inactividadValor: 1, inactividadUnidad: "DIAS" };
    const loteB = await pedir(b, "/api/v1/disparo-mensajes/enviar", { metodo: "POST", cuerpo: cuerpoB, clave: "eq91-aislado-00001" });
    if (loteB.status === 200) {
      assert.notEqual(loteB.cuerpo.loteId, loteA.loteId);
      assert.equal(loteB.cuerpo.repetido, false);
    } else {
      assert.equal(loteB.cuerpo.codigo, "SIN_ASPIRANTES", "si su cartera no tiene aplicables, se rechaza por eso, no por la clave de A");
    }
  });
});
