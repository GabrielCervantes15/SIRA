/**
 * EQ-87 (HU1-11) · Consumir resultados: conteo de notificados, fecha de última notificación e historial.
 * Reglas: docs/decisiones/HU1-reglas-lote-envio.md (EQ-77 §6.3 y §11).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearServidor } from "../src/servidor.js";
import { crearModuloMonitoreo } from "../src/modulos/monitoreo/index.js";
import { RepositorioMonitoreoMemoria } from "../src/modulos/monitoreo/infraestructura/repositorio-monitoreo-memoria.js";
import { aceptaResultado, construirLote, resumenResultados } from "../src/modulos/disparo-automatico/dominio/lote-envio.js";
import { RepositorioLotesMemoria } from "../src/modulos/disparo-automatico/infraestructura/repositorio-lotes-memoria.js";
import { crearConsumidorResultadosEnvio, tituloEventoHistorial } from "../src/modulos/disparo-automatico/aplicacion/consumir-resultados-envio.js";
import { crearEventoResultadoEnvio, TIPO_ENVIO_DIFERIDO, TIPO_ENVIO_ENVIADO, TIPO_ENVIO_FALLIDO } from "../src/modulos/disparo-automatico/eventos.js";
import { crearServicioVistaPreviaLote } from "../src/modulos/disparo-automatico/vista-previa-lote.js";
import { crearProveedorWhatsAppCloudApi } from "../src/modulos/whatsapp/index.js";
import { personalizarTexto } from "../src/modulos/disparo-automatico/mensaje-reactivacion.js";

const AHORA = Date.parse("2026-11-16T17:00:00.000Z"); // lunes 10:00 en Hermosillo
const ISO = (ms) => new Date(ms).toISOString();
const ACTIVIDAD_VIEJA = "2026-10-01T15:00:00.000Z";

// ---------------------------------------------------------------------------
// Dominio: qué resultados se aceptan y cómo se cuenta el lote
// ---------------------------------------------------------------------------
test("[EQ-87] Solo se aceptan resultados de envíos pendientes; ENVIADO y FALLIDO son finales", () => {
  const pendiente = { estado: "PENDIENTE", resultado: null };
  assert.equal(aceptaResultado(pendiente, "ENVIADO"), true);
  assert.equal(aceptaResultado(pendiente, "DIFERIDO"), true);
  assert.equal(aceptaResultado({ ...pendiente, resultado: "DIFERIDO" }, "ENVIADO"), true);
  assert.equal(aceptaResultado({ ...pendiente, resultado: "DIFERIDO" }, "DIFERIDO"), false);
  assert.equal(aceptaResultado({ ...pendiente, resultado: "ENVIADO" }, "ENVIADO"), false, "repetido");
  assert.equal(aceptaResultado({ ...pendiente, resultado: "FALLIDO" }, "ENVIADO"), false);
  assert.equal(aceptaResultado({ estado: "NO_ENVIABLE", resultado: null }, "ENVIADO"), false);
  assert.equal(aceptaResultado(pendiente, "OTRO"), false);
  assert.equal(aceptaResultado(null, "ENVIADO"), false);
});

test("[EQ-87] El conteo del lote es por aspirante, no por mensaje ni por canal", () => {
  const e = (aspiranteId, canal, estado, resultado = null) => ({ aspiranteId, canal, estado, resultado });
  const r = resumenResultados([
    e("ambos", "WHATSAPP", "PENDIENTE", "ENVIADO"), e("ambos", "CORREO", "PENDIENTE", "ENVIADO"),
    e("correo-ok", "WHATSAPP", "PENDIENTE", "FALLIDO"), e("correo-ok", "CORREO", "PENDIENTE", "ENVIADO"),
    e("esperando", "WHATSAPP", "PENDIENTE"),
    e("diferido", "WHATSAPP", "PENDIENTE", "DIFERIDO"),
    e("fallido", "WHATSAPP", "PENDIENTE", "FALLIDO"),
    e("sin-datos", "WHATSAPP", "NO_ENVIABLE"),
  ]);
  assert.deepEqual(
    { total: r.totalAspirantes, notificados: r.notificados, pendientes: r.pendientes, diferidos: r.diferidos, fallidos: r.fallidos, completo: r.completo },
    { total: 6, notificados: 2, pendientes: 1, diferidos: 1, fallidos: 2, completo: false },
  );
  assert.deepEqual(r.porCanal.WHATSAPP, { enviados: 1, fallidos: 2, diferidos: 1, pendientes: 1, noEnviables: 1 });
  assert.deepEqual(r.porCanal.CORREO, { enviados: 2, fallidos: 0, diferidos: 0, pendientes: 0, noEnviables: 0 });
  assert.equal(resumenResultados([e("a", "WHATSAPP", "PENDIENTE", "ENVIADO")]).completo, true);
});

// ---------------------------------------------------------------------------
// Consumidor con repositorios en memoria
// ---------------------------------------------------------------------------
const TEXTO = "Hola, {aspirante}. Tu proceso de ingreso a {carrera} todavía puede continuar.";

async function armar({ conCorreo = true, mostrarEnConversacion = true } = {}) {
  const aspirantes = ["a1", "a2"].map((id, i) => ({
    id, nombreCompleto: ["Ana López", "Luis Ruiz"][i], carreraSolicitada: "Software", telefono: `+52644000000${i}`,
    correo: `${id}@correo.mx`, colaboradorId: "c1", semaforo: "ROJO", fechaUltimaActividad: ACTIVIDAD_VIEJA,
  }));
  const repositorioMonitoreo = new RepositorioMonitoreoMemoria({ aspirantes: aspirantes.map((a) => ({ ...a })) });
  const repositorioLotes = new RepositorioLotesMemoria();
  let n = 0;
  const crearLote = async (enviarPorCorreo = conCorreo) => {
    const registro = construirLote({
      colaboradorId: "c1", clave: null, huella: `h${n}`, filtros: { semaforos: ["ROJO"], carreras: ["Software"], inactividadValor: 7, inactividadUnidad: "DIAS" },
      enviarPorCorreo, ahora: new Date(AHORA), generarId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
      personalizados: aspirantes.map((a) => ({ aspirante: a, mensajeId: "reactivacion_hu1", ...personalizarTexto(TEXTO, a) })),
    });
    await repositorioLotes.guardarLote(registro);
    return registro;
  };
  const consumidor = crearConsumidorResultadosEnvio({ repositorioLotes, repositorioMonitoreo, mostrarEnConversacion });
  const envioDe = (registro, aspiranteId, canal) => registro.envios.find((e) => e.aspiranteId === aspiranteId && e.canal === canal);
  const resultado = (tipo, registro, envio, extra = {}, ms = AHORA) => crearEventoResultadoEnvio(tipo, {
    datos: { loteId: registro.lote.id, envioId: envio.id, colaboradorId: "c1", aspiranteId: envio.aspiranteId, canal: envio.canal },
  }, { enviadoEn: tipo === TIPO_ENVIO_ENVIADO ? ISO(ms) : undefined, ...extra }, new Date(ms));
  const aspirante = (id) => repositorioMonitoreo.aspirantes.find((a) => a.id === id);
  const historialDe = (id) => repositorioMonitoreo.historial.filter((h) => h.aspiranteId === id);
  const chatDe = (id) => repositorioMonitoreo.conversaciones.filter((m) => m.aspiranteId === id);
  return { consumidor, repositorioLotes, crearLote, envioDe, resultado, aspirante, historialDe, chatDe };
}

test("[EQ-87] Envío exitoso: suma al conteo, actualiza la fecha de última notificación, registra historial y Chat", async () => {
  const t = await armar();
  const lote = await t.crearLote();
  const envio = t.envioDe(lote, "a1", "WHATSAPP");
  const r = await t.consumidor.procesar(t.resultado(TIPO_ENVIO_ENVIADO, lote, envio, { whatsappMessageId: "wamid.1", intentos: 1 }));
  assert.deepEqual(r, { procesado: true, resultado: "ENVIADO" });

  const a1 = t.aspirante("a1");
  assert.equal(a1.vecesNotificado, 1);
  assert.equal(a1.fechaUltimaNotificacion, ISO(AHORA));
  assert.equal(a1.fechaUltimaActividad, ACTIVIDAD_VIEJA, "un mensaje saliente no es actividad del aspirante");

  const [evento] = t.historialDe("a1");
  assert.equal(evento.tipoEvento, "MENSAJE_AUTOMATICO");
  assert.equal(evento.titulo, "Mensaje automático enviado por WhatsApp");
  assert.equal(evento.detalle, "Hola, Ana. Tu proceso de ingreso a Software todavía puede continuar.");
  assert.equal(evento.fechaEvento, ISO(AHORA));
  assert.deepEqual(evento.metadatos, { canal: "WHATSAPP", loteId: lote.lote.id, envioId: envio.id, resultado: "ENVIADO", whatsappMessageId: "wamid.1" });

  const [mensaje] = t.chatDe("a1");
  assert.deepEqual(
    [mensaje.id, mensaje.direccion, mensaje.remitenteTipo, mensaje.contenido, mensaje.whatsappMessageId],
    [envio.id, "SALIENTE", "BOT_IA", evento.detalle, "wamid.1"],
  );

  const guardado = await t.repositorioLotes.obtenerLote(lote.lote.id);
  const enLote = guardado.envios.find((e) => e.id === envio.id);
  assert.deepEqual([enLote.resultado, enLote.whatsappMessageId, enLote.intentos, enLote.resultadoEn], ["ENVIADO", "wamid.1", 1, ISO(AHORA)]);
});

test("[EQ-87] Un resultado repetido no suma dos veces ni duplica historial o Chat", async () => {
  const t = await armar();
  const lote = await t.crearLote();
  const evento = t.resultado(TIPO_ENVIO_ENVIADO, lote, t.envioDe(lote, "a1", "WHATSAPP"), { whatsappMessageId: "wamid.1" });
  await t.consumidor.procesar(evento);
  assert.deepEqual(await t.consumidor.procesar(evento), { procesado: false });
  assert.equal(t.aspirante("a1").vecesNotificado, 1);
  assert.equal(t.historialDe("a1").length, 1);
  assert.equal(t.chatDe("a1").length, 1);
});

test("[EQ-87] Dos canales en el mismo lote cuentan una vez; otro lote vuelve a contar", async () => {
  const t = await armar();
  const lote = await t.crearLote();
  await t.consumidor.procesar(t.resultado(TIPO_ENVIO_ENVIADO, lote, t.envioDe(lote, "a1", "WHATSAPP")));
  await t.consumidor.procesar(t.resultado(TIPO_ENVIO_ENVIADO, lote, t.envioDe(lote, "a1", "CORREO"), {}, AHORA + 60_000));
  const a1 = t.aspirante("a1");
  assert.equal(a1.vecesNotificado, 1);
  assert.equal(a1.fechaUltimaNotificacion, ISO(AHORA + 60_000), "queda la fecha más reciente");
  assert.deepEqual(t.historialDe("a1").map((h) => h.titulo), ["Mensaje automático enviado por WhatsApp", "Mensaje automático enviado por correo"]);
  assert.equal(t.chatDe("a1").length, 1, "el correo no va al Chat de WhatsApp");

  const otro = await t.crearLote(false);
  await t.consumidor.procesar(t.resultado(TIPO_ENVIO_ENVIADO, otro, t.envioDe(otro, "a1", "WHATSAPP"), {}, AHORA + 3 * 86_400_000));
  assert.equal(t.aspirante("a1").vecesNotificado, 2);
});

test("[EQ-87] Un fallo se registra sin tocar el conteo ni la fecha", async () => {
  const t = await armar();
  const lote = await t.crearLote();
  const envio = t.envioDe(lote, "a2", "WHATSAPP");
  await t.consumidor.procesar(t.resultado(TIPO_ENVIO_FALLIDO, lote, envio, {
    codigo: "META_131026", motivo: "El número no puede recibir el mensaje.", codigoProveedor: "META_131026", intentos: 1,
  }));
  const a2 = t.aspirante("a2");
  assert.equal(a2.vecesNotificado ?? 0, 0);
  assert.equal(a2.fechaUltimaNotificacion ?? null, null);
  assert.equal(a2.fechaUltimaActividad, ACTIVIDAD_VIEJA);
  const [evento] = t.historialDe("a2");
  assert.deepEqual(
    [evento.tipoEvento, evento.titulo, evento.detalle, evento.metadatos.resultado, evento.metadatos.codigo],
    ["MENSAJE_AUTOMATICO", "Mensaje automático no enviado por WhatsApp", "El número no puede recibir el mensaje.", "FALLIDO", "META_131026"],
  );
  assert.equal(t.chatDe("a2").length, 0);
  // Un éxito tardío después de un fallo final se ignora.
  assert.deepEqual(await t.consumidor.procesar(t.resultado(TIPO_ENVIO_ENVIADO, lote, envio)), { procesado: false });
});

test("[EQ-87] Diferido: solo queda en el lote; cuando sale, se registra normal", async () => {
  const t = await armar({ conCorreo: false });
  const lote = await t.crearLote();
  const envio = t.envioDe(lote, "a1", "WHATSAPP");
  await t.consumidor.procesar(t.resultado(TIPO_ENVIO_DIFERIDO, lote, envio, { codigo: "LIMITE_24H", motivo: "Límite", reanudaEn: ISO(AHORA + 86_400_000) }));
  assert.equal(t.historialDe("a1").length, 0);
  assert.equal(t.aspirante("a1").vecesNotificado ?? 0, 0);
  let resumen = resumenResultados((await t.repositorioLotes.obtenerLote(lote.lote.id)).envios);
  assert.deepEqual([resumen.diferidos, resumen.pendientes, resumen.completo], [1, 1, false]);

  await t.consumidor.procesar(t.resultado(TIPO_ENVIO_ENVIADO, lote, envio, {}, AHORA + 86_400_000));
  await t.consumidor.procesar(t.resultado(TIPO_ENVIO_ENVIADO, lote, t.envioDe(lote, "a2", "WHATSAPP")));
  resumen = resumenResultados((await t.repositorioLotes.obtenerLote(lote.lote.id)).envios);
  assert.deepEqual([resumen.notificados, resumen.diferidos, resumen.completo], [2, 0, true]);
  assert.equal(t.aspirante("a1").vecesNotificado, 1);
});

test("[EQ-87] Si se decide no mostrarlo en el Chat, solo queda en el historial", async () => {
  const t = await armar({ mostrarEnConversacion: false });
  const lote = await t.crearLote();
  await t.consumidor.procesar(t.resultado(TIPO_ENVIO_ENVIADO, lote, t.envioDe(lote, "a1", "WHATSAPP")));
  assert.equal(t.chatDe("a1").length, 0);
  assert.equal(t.historialDe("a1").length, 1);
});

test("[EQ-87] La espera de 48 h usa la fecha de última notificación aunque no haya mensaje en el Chat", async () => {
  const aspirante = {
    id: "a1", colaboradorId: "c1", semaforo: "ROJO", estadoSolicitud: "RECIBIDA", carreraSolicitada: "Software",
    fechaUltimaActividad: ACTIVIDAD_VIEJA, fechaUltimaNotificacion: ISO(AHORA - 10 * 3_600_000),
  };
  const repositorioMonitoreo = {
    obtenerFiltrosColaborador: async () => ({ semaforos: ["Rojo"], carreras: ["Software"] }),
    listarAspirantes: async () => ({ aspirantes: [aspirante] }),
    obtenerConversacionAspirante: async () => [],
  };
  const servicio = crearServicioVistaPreviaLote({ repositorioMonitoreo, reloj: () => new Date(AHORA) });
  const filtros = { semaforos: "ROJO", carreras: "Software", inactividadValor: 7, inactividadUnidad: "DIAS" };
  assert.equal((await servicio.calcular("c1", filtros)).excluidos.contactoReciente, 1);
  aspirante.fechaUltimaNotificacion = ISO(AHORA - 49 * 3_600_000);
  assert.equal((await servicio.calcular("c1", filtros)).total, 1);
});

test("[EQ-87] Títulos de la línea de tiempo por canal", () => {
  assert.equal(tituloEventoHistorial("ENVIADO", "WHATSAPP"), "Mensaje automático enviado por WhatsApp");
  assert.equal(tituloEventoHistorial("FALLIDO", "CORREO"), "Mensaje automático no enviado por correo");
});

// ---------------------------------------------------------------------------
// HTTP: lote completo de punta a punta
// ---------------------------------------------------------------------------
const CUERPO = {
  semaforos: ["ROJO", "NARANJA"], carreras: ["Ingeniería en Software", "Licenciatura en Administración"],
  inactividadValor: 7, inactividadUnidad: "DIAS",
};

async function conServidor(opciones, fn) {
  const moduloMonitoreo = crearModuloMonitoreo();
  const servidor = crearServidor({
    port: 0, reloj: () => AHORA, duracionSesionMs: 86_400_000, moduloMonitoreo,
    colaEnvioWhatsApp: { mensajesPorSegundo: 10_000 }, ...opciones,
  });
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const login = async (identificador, password) => (await fetch(`${base}/api/v1/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identificador, password }),
  })).headers.get("set-cookie").split(";")[0];
  try {
    const cookie = await login("00000252115", "Password123!");
    const get = async (ruta, c = cookie) => {
      const r = await fetch(base + ruta, { headers: { Cookie: c } });
      return { status: r.status, cuerpo: await r.json() };
    };
    const enviar = async () => (await fetch(`${base}/api/v1/disparo-mensajes/enviar`, {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": "eq87-lote-000001" },
      body: JSON.stringify(CUERPO),
    })).json();
    await fn({ base, get, enviar, login, repositorio: moduloMonitoreo.repositorio, esperar: () => servidor.colaEnvioWhatsApp.esperarInactiva() });
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
}

test("[EQ-87] HTTP: conteo del lote, fecha de última notificación, línea de tiempo y Chat; la última actividad y el semáforo no cambian", async () => {
  await conServidor({}, async ({ get, enviar, repositorio, esperar }) => {
    const carlosAntes = (await get("/api/monitoreo/aspirantes?nombre=Carlos%20Mendoza")).cuerpo.aspirantes[0];
    const lote = await enviar();
    await esperar();

    const { status, cuerpo } = await get(`/api/v1/disparo-mensajes/lotes/${lote.loteId}`);
    assert.equal(status, 200);
    assert.deepEqual(
      [cuerpo.totalAspirantes, cuerpo.notificados, cuerpo.fallidos, cuerpo.diferidos, cuerpo.pendientes, cuerpo.completo],
      [lote.totalAspirantes, lote.totalEnviados, 0, 0, 0, true],
    );
    assert.equal(cuerpo.porCanal.WHATSAPP.enviados, lote.envios.whatsapp);

    const carlos = repositorio.aspirantes.find((a) => a.id === carlosAntes.id);
    assert.equal(carlos.vecesNotificado, 1);
    assert.equal(carlos.fechaUltimaNotificacion, ISO(AHORA));
    const carlosDespues = (await get("/api/monitoreo/aspirantes?nombre=Carlos%20Mendoza")).cuerpo.aspirantes[0];
    assert.equal(carlosDespues.fechaUltimaActividad, carlosAntes.fechaUltimaActividad, "«Última actividad» no cambia");
    assert.equal(carlosDespues.semaforo, carlosAntes.semaforo, "el semáforo no cambia");

    const actividades = (await get(`/api/monitoreo/aspirantes/${carlos.id}/actividades`)).cuerpo.actividades;
    const [ultima] = actividades;
    assert.equal(ultima.tipo, "MENSAJE_AUTOMATICO");
    assert.match(ultima.texto, /^Mensaje automático enviado por WhatsApp — Hola, Carlos\. Tu proceso de ingreso a Ingeniería en Software/);
    assert.equal(ultima.fecha, ISO(AHORA));

    const chat = await get(`/api/monitoreo/aspirantes/${carlos.id}/conversacion`);
    assert.match(JSON.stringify(chat.cuerpo), /Hola, Carlos\. Tu proceso de ingreso a Ingeniería en Software/);
  });
});

test("[EQ-87] HTTP: un fallo de WhatsApp aparece en el conteo y en la línea de tiempo, sin contar como notificado", async () => {
  let n = 0;
  const fetch = async () => {
    n += 1;
    return n === 1
      ? { ok: false, status: 400, json: async () => ({ error: { code: 131026, message: "undeliverable" } }) }
      : { ok: true, status: 200, json: async () => ({ messages: [{ id: `wamid.${n}` }] }) };
  };
  const proveedorWhatsApp = crearProveedorWhatsAppCloudApi({ token: "t", phoneNumberId: "1", fetch, reloj: () => new Date(AHORA) });
  await conServidor({ proveedorWhatsApp }, async ({ get, enviar, repositorio, esperar }) => {
    const lote = await enviar();
    await esperar();
    const { cuerpo } = await get(`/api/v1/disparo-mensajes/lotes/${lote.loteId}`);
    assert.deepEqual([cuerpo.notificados, cuerpo.fallidos], [lote.totalAspirantes - 1, 1]);

    const fallido = repositorio.historial.find((h) => h.tipoEvento === "MENSAJE_AUTOMATICO" && h.metadatos.resultado === "FALLIDO");
    assert.match(fallido.detalle, /no puede recibir/);
    const aspirante = repositorio.aspirantes.find((a) => a.id === fallido.aspiranteId);
    assert.equal(aspirante.vecesNotificado ?? 0, 0);
    assert.equal(aspirante.fechaUltimaNotificacion ?? null, null);
  });
});

test("[EQ-87] HTTP: el conteo de un lote es solo para el colaborador que lo lanzó", async () => {
  await conServidor({}, async ({ base, get, enviar, login, esperar }) => {
    const lote = await enviar();
    await esperar();
    assert.equal((await fetch(`${base}/api/v1/disparo-mensajes/lotes/${lote.loteId}`)).status, 401);
    const admin = await login("00000100001", "AdminPassword2026!");
    assert.equal((await get(`/api/v1/disparo-mensajes/lotes/${lote.loteId}`, admin)).status, 404);
    assert.equal((await get("/api/v1/disparo-mensajes/lotes/00000000-0000-4000-8000-000000000000")).status, 404);
  });
});
