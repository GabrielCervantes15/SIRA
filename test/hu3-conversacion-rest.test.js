import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ObtenerConversacionCasoUso,
  RepositorioMonitoreoMemoria,
  RepositorioMonitoreoPostgres,
  MonitoreoControlador,
  crearEnrutadorMonitoreo,
} from "../src/modulos/monitoreo/index.js";

// ---------- Pruebas de Base de Datos y Migración [HU6-4] ----------

test("[HU6-4] 02_ajuste_llaves_historial.sql liga tablas hijas exclusivamente a aspirante_id con ON DELETE CASCADE", async () => {
  const sql = await readFile(
    new URL("../docker/postgres/migrations/02_ajuste_llaves_historial.sql", import.meta.url),
    "utf8"
  );

  // Verifica que las tablas hijas apunten a aspirantes.aspirantes(id) con ON DELETE CASCADE
  assert.match(sql, /CREATE TABLE IF NOT EXISTS aspirantes\.mensajes/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS aspirantes\.constancias/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS aspirantes\.rechazos/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS aspirantes\.conversacion_chat/i);
  assert.match(sql, /REFERENCES aspirantes\.aspirantes\(id\)\s+ON DELETE CASCADE/i);

  // Verifica la eliminación explícita de cualquier columna/llave colaborador_id en tablas hijas
  assert.match(sql, /DROP COLUMN colaborador_id CASCADE/i);
});

// ---------- Pruebas Unitarias y de Repositorio Postgres [HU3-5] ----------

test("[HU3-5] RepositorioMonitoreoPostgres consulta aspirante y mensajes ordenados por fecha_envio ASC", async () => {
  const consultasEjecutadas = [];
  const dbSimulado = {
    async query(sql, params) {
      consultasEjecutadas.push({ sql, params });
      if (sql.includes("FROM aspirantes.aspirantes")) {
        return {
          rows: [
            {
              id: "asp-001",
              folioSolicitud: "FOL-2026-00101",
              nombreCompleto: "Carlos Mendoza Armenta",
              colaboradorId: "colab-001",
            },
          ],
        };
      }
      return {
        rows: [
          {
            id: "msg-1",
            aspiranteId: "asp-001",
            direccion: "SALIENTE",
            remitenteTipo: "BOT_IA",
            contenido: "Mensaje 1",
            fechaEnvio: "2026-10-16T10:05:00Z",
          },
          {
            id: "msg-2",
            aspiranteId: "asp-001",
            direccion: "ENTRANTE",
            remitenteTipo: "ASPIRANTE",
            contenido: "Mensaje 2",
            fechaEnvio: "2026-10-16T10:10:00Z",
          },
        ],
      };
    },
  };

  const repoPg = new RepositorioMonitoreoPostgres({ db: dbSimulado });
  const aspirante = await repoPg.obtenerAspirantePorId("asp-001");
  assert.equal(aspirante.id, "asp-001");

  const mensajes = await repoPg.obtenerConversacionAspirante("asp-001");
  assert.equal(mensajes.length, 2);
  assert.match(consultasEjecutadas[1].sql, /ORDER BY fecha_envio ASC/i);
  assert.deepEqual(consultasEjecutadas[1].params, ["asp-001"]);
});

test("[HU3-5] ObtenerConversacionCasoUso valida propiedad de cartera (200, 403, 404, 401) y ordena cronológicamente", async () => {
  const repo = new RepositorioMonitoreoMemoria({
    aspirantes: [
      {
        id: "asp-100",
        nombreCompleto: "Aspirante Propio",
        colaboradorId: "colab-001",
      },
      {
        id: "asp-200",
        nombreCompleto: "Aspirante Ajeno",
        colaboradorId: "colab-002",
      },
    ],
    conversaciones: [
      {
        id: "m-tarde",
        aspiranteId: "asp-100",
        direccion: "ENTRANTE",
        remitenteTipo: "ASPIRANTE",
        contenido: "Segundo mensaje (más reciente)",
        fechaEnvio: "2026-11-10T15:00:00Z",
      },
      {
        id: "m-temprano",
        aspiranteId: "asp-100",
        direccion: "SALIENTE",
        remitenteTipo: "BOT_IA",
        contenido: "Primer mensaje (más antiguo)",
        fechaEnvio: "2026-11-10T09:00:00Z",
      },
    ],
  });

  const casoUso = new ObtenerConversacionCasoUso({ repositorioMonitoreo: repo });

  // 1. Éxito (200): pertenece al colaborador (colab-001 / 00000252115) y ordena ascendentemente
  const resultado = await casoUso.ejecutar({
    colaboradorId: "00000252115",
    aspiranteId: "asp-100",
  });
  assert.equal(resultado.aspiranteId, "asp-100");
  assert.equal(resultado.total, 2);
  assert.deepEqual(
    resultado.mensajes.map((m) => m.id),
    ["m-temprano", "m-tarde"]
  );

  // 2. Bloqueo 403 Forbidden: el aspirante pertenece a otro colaborador
  await assert.rejects(
    () => casoUso.ejecutar({ colaboradorId: "00000252115", aspiranteId: "asp-200" }),
    (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.codigo, "SIN_PERMISO");
      return true;
    }
  );

  // 3. Error 404 Not Found: el aspirante no existe
  await assert.rejects(
    () => casoUso.ejecutar({ colaboradorId: "00000252115", aspiranteId: "asp-inexistente" }),
    (err) => {
      assert.equal(err.status, 404);
      assert.equal(err.codigo, "NO_ENCONTRADO");
      return true;
    }
  );

  // 4. Error 401 Unauthorized: sin colaborador autenticado
  await assert.rejects(
    () => casoUso.ejecutar({ colaboradorId: "", aspiranteId: "asp-100" }),
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.codigo, "NO_AUTORIZADO");
      return true;
    }
  );
});

test("[HU3-5] Controlador y Enrutador despachan GET /api/monitoreo/aspirantes/:id/conversacion con códigos HTTP exactos", async () => {
  const repo = new RepositorioMonitoreoMemoria({
    aspirantes: [
      { id: "asp-001", nombreCompleto: "Carlos Mendoza", colaboradorId: "colab-001" },
      { id: "asp-003", nombreCompleto: "Jorge Valenzuela", colaboradorId: "colab-002" },
    ],
    conversaciones: [
      {
        id: "m-2",
        aspiranteId: "asp-001",
        direccion: "ENTRANTE",
        remitenteTipo: "ASPIRANTE",
        contenido: "Respuesta del aspirante",
        fechaEnvio: "2026-11-01T12:00:00Z",
      },
      {
        id: "m-1",
        aspiranteId: "asp-001",
        direccion: "SALIENTE",
        remitenteTipo: "BOT_IA",
        contenido: "Saludo inicial",
        fechaEnvio: "2026-11-01T10:00:00Z",
      },
    ],
  });

  const obtenerConversacionCasoUso = new ObtenerConversacionCasoUso({ repositorioMonitoreo: repo });
  const controlador = new MonitoreoControlador({
    obtenerFiltrosCasoUso: { ejecutar: async () => ({}) },
    obtenerConversacionCasoUso,
  });
  const enrutador = crearEnrutadorMonitoreo({ controlador });

  async function simularPeticion(url, colaboradorId = null) {
    let statusCode = null;
    let bodyTexto = "";
    const req = {
      url,
      method: "GET",
      headers: { host: "localhost" },
    };
    const res = {
      writeHead(status) {
        statusCode = status;
      },
      end(payload) {
        bodyTexto = payload;
      },
    };
    const contexto = colaboradorId ? { usuario: { idInstitucional: colaboradorId } } : {};
    const manejado = await enrutador(req, res, contexto);
    return { manejado, status: statusCode, body: bodyTexto ? JSON.parse(bodyTexto) : null };
  }

  // 200 OK y orden ascendente
  const ok = await simularPeticion("/api/monitoreo/aspirantes/asp-001/conversacion", "00000252115");
  assert.equal(ok.manejado, true);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.mensajes.map((m) => m.id), ["m-1", "m-2"]);

  // 403 Forbidden en aspirante de otra cartera
  const prohibido = await simularPeticion("/api/monitoreo/aspirantes/asp-003/conversacion", "00000252115");
  assert.equal(prohibido.status, 403);
  assert.equal(prohibido.body.codigo, "SIN_PERMISO");

  // 404 Not Found en aspirante inexistente
  const noEncontrado = await simularPeticion("/api/monitoreo/aspirantes/asp-999/conversacion", "00000252115");
  assert.equal(noEncontrado.status, 404);
  assert.equal(noEncontrado.body.codigo, "NO_ENCONTRADO");
});
