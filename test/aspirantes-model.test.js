import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("[HU3-2] DDL del esquema Aspirantes define tablas, restricciones e índices requeridos", async () => {
  const ddlSql = await readFile(
    new URL("../docker/postgres/migrations/01_esquema_aspirantes.sql", import.meta.url),
    "utf8"
  );

  // 1. Verificación de Tablas Principales
  assert.match(ddlSql, /CREATE TABLE IF NOT EXISTS aspirantes\.aspirantes/i);
  assert.match(ddlSql, /CREATE TABLE IF NOT EXISTS aspirantes\.historial_eventos/i);
  assert.match(ddlSql, /CREATE TABLE IF NOT EXISTS aspirantes\.conversaciones_mensajes/i);

  // 2. Verificación de Índices Compuestos Requeridos por HU3-2 (aspirante_id y fecha)
  assert.match(
    ddlSql,
    /CREATE INDEX IF NOT EXISTS idx_historial_aspirante_fecha\s+ON aspirantes\.historial_eventos\s*\(\s*aspirante_id,\s*fecha_evento\s+DESC\s*\)/i,
    "El índice compuesto (aspirante_id, fecha_evento DESC) debe existir para la línea de tiempo"
  );

  assert.match(
    ddlSql,
    /CREATE INDEX IF NOT EXISTS idx_conversacion_aspirante_fecha\s+ON aspirantes\.conversaciones_mensajes\s*\(\s*aspirante_id,\s*fecha_envio\s+ASC\s*\)/i,
    "El índice compuesto (aspirante_id, fecha_envio ASC) debe existir para el chat"
  );

  // 3. Regla Arquitectónica HU6-4: Historial y Chat ligados al Aspirante (ON DELETE CASCADE)
  assert.match(
    ddlSql,
    /REFERENCES aspirantes\.aspirantes\s*\(\s*id\s*\)\s+ON DELETE CASCADE/i,
    "Las tablas hijas deben estar ligadas directamente a aspirante.id"
  );

  // 4. Verificación de Catálogos y Restricciones (Semáforos y Estados de Solicitud)
  assert.match(ddlSql, /CHECK\s*\(\s*semaforo\s+IN\s*\('VERDE',\s*'AMARILLO',\s*'ROJO'\)\s*\)/i);
  assert.match(ddlSql, /CHECK\s*\(\s*estado_solicitud\s+IN\s*\('RECIBIDA',\s*'EN_REVISION',\s*'ACEPTADA',\s*'RECHAZADA'\)\s*\)/i);
  assert.match(ddlSql, /CHECK\s*\(\s*direccion\s+IN\s*\('ENTRANTE',\s*'SALIENTE'\)\s*\)/i);
});

test("[HU3-2] Datos Semilla JSON y SQL cubren diversidad de semáforos, estados, historial y chat", async () => {
  const semillaJson = JSON.parse(
    await readFile(new URL("../datos-semilla/aspirantes.json", import.meta.url), "utf8")
  );

  const { aspirantes, historial, conversaciones } = semillaJson;

  // 1. Integridad de Aspirantes
  assert.ok(aspirantes.length >= 4, "Debe haber al menos 4 aspirantes en datos semilla");
  const aspiranteIds = new Set(aspirantes.map((a) => a.id));

  // Validar cobertura de semáforos
  const semaforos = new Set(aspirantes.map((a) => a.semaforo));
  assert.ok(semaforos.has("VERDE"), "Debe haber aspirantes con semáforo VERDE");
  assert.ok(semaforos.has("AMARILLO"), "Debe haber aspirantes con semáforo AMARILLO");
  assert.ok(semaforos.has("ROJO"), "Debe haber aspirantes con semáforo ROJO");

  // Validar cobertura de estados de solicitud
  const estados = new Set(aspirantes.map((a) => a.estadoSolicitud));
  assert.ok(estados.has("RECIBIDA"));
  assert.ok(estados.has("EN_REVISION"));
  assert.ok(estados.has("ACEPTADA"));
  assert.ok(estados.has("RECHAZADA"));

  // 2. Integridad de Historial (HU3)
  assert.ok(historial.length >= 6, "Debe existir historial de eventos nutrido");
  const tiposEvento = new Set(historial.map((h) => h.tipoEvento));
  assert.ok(tiposEvento.has("MENSAJE_ENVIADO"), "Debe incluir mensajes enviados");
  assert.ok(tiposEvento.has("CONSTANCIA_ENTREGADA"), "Debe incluir constancias entregadas");
  assert.ok(tiposEvento.has("RECHAZO_SOLICITUD"), "Debe incluir motivos de rechazo");

  // Validar motivo de rechazo escolar
  const rechazo = historial.find((h) => h.tipoEvento === "RECHAZO_SOLICITUD");
  assert.ok(rechazo && rechazo.motivoRechazo, "El evento de rechazo debe contener el motivo específico");

  // Todos los eventos deben pertenecer a un aspirante existente
  for (const h of historial) {
    assert.ok(aspiranteIds.has(h.aspiranteId), `El evento ${h.id} referencia a un aspirante inexistente`);
  }

  // 3. Integridad de Conversaciones de Chat (HU3 y HU4)
  assert.ok(conversaciones.length >= 6, "Debe existir una conversación de chat con múltiples turnos");
  const direcciones = new Set(conversaciones.map((c) => c.direccion));
  assert.ok(direcciones.has("ENTRANTE"), "Debe incluir mensajes recibidos del aspirante");
  assert.ok(direcciones.has("SALIENTE"), "Debe incluir mensajes enviados al aspirante");

  // Todos los mensajes deben pertenecer a un aspirante existente
  for (const c of conversaciones) {
    assert.ok(aspiranteIds.has(c.aspiranteId), `El mensaje de chat ${c.id} referencia a un aspirante inexistente`);
  }

  // 4. Prueba de Ordenamiento de Historial (HU3-4: del más reciente al más antiguo)
  const historialAsp002 = historial.filter((h) => h.aspiranteId === "asp-002");
  const ordenadoDesc = [...historialAsp002].sort(
    (a, b) => new Date(b.fechaEvento).getTime() - new Date(a.fechaEvento).getTime()
  );
  assert.equal(ordenadoDesc[0].tipoEvento, "MENSAJE_ENVIADO");
  assert.equal(ordenadoDesc[1].tipoEvento, "CAMBIO_ESTADO");
});
