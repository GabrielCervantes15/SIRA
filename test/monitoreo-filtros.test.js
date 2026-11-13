import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { crearServidor } from "../src/servidor.js";
import {
  ObtenerFiltrosCasoUso,
  RepositorioMonitoreoMemoria,
} from "../src/modulos/monitoreo/index.js";

// ---------- Pruebas Unitarias del Caso de Uso (HU2-7) ----------

test("[HU2-7] ObtenerFiltrosCasoUso devuelve catálogos y carreras exclusivas del colaborador", async () => {
  const repo = new RepositorioMonitoreoMemoria({
    asignacionesCarreras: {
      "00000252115": ["Ingeniería en Software", "Licenciatura en Administración"],
      "00000233231": ["Ingeniería Industrial"],
    },
  });

  const casoUso = new ObtenerFiltrosCasoUso({ repositorioMonitoreo: repo });

  // Colaborador 1
  const filtrosColab1 = await casoUso.ejecutar("00000252115");
  assert.deepEqual(filtrosColab1.carreras, [
    "Ingeniería en Software",
    "Licenciatura en Administración",
  ]);
  assert.ok(filtrosColab1.preparatorias.includes("CBTIS 37"));
  assert.ok(filtrosColab1.periodos.includes("2027-1"));
  assert.ok(filtrosColab1.estadosSolicitud.includes("EN_REVISION"));
  assert.deepEqual(filtrosColab1.semaforos, ["Verde", "Amarillo", "Naranja", "Rojo"]);

  // Colaborador 2 (carreras distintas)
  const filtrosColab2 = await casoUso.ejecutar("00000233231");
  assert.deepEqual(filtrosColab2.carreras, ["Ingeniería Industrial"]);
});

test("[HU2-7] ObtenerFiltrosCasoUso rechaza petición sin colaborador autenticado con 401", async () => {
  const repo = new RepositorioMonitoreoMemoria();
  const casoUso = new ObtenerFiltrosCasoUso({ repositorioMonitoreo: repo });

  await assert.rejects(
    async () => casoUso.ejecutar(""),
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.codigo, "NO_AUTORIZADO");
      return true;
    }
  );
});

async function obtenerCookieDePrueba(puerto, idInstitucional) {
  const respuesta = await fetch(`http://127.0.0.1:${puerto}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificador: idInstitucional, password: 'Password123!' }),
  });
  assert.equal(respuesta.status, 200);
  const cookie = respuesta.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return cookie;
}

// ---------- Pruebas de Integración HTTP del Endpoint GET /api/monitoreo/filtros ----------

test("[HU2-7] HTTP GET /api/monitoreo/filtros requiere autenticación (401)", async () => {
  const servidor = crearServidor();
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const puerto = servidor.address().port;

  try {
    const respuesta = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${puerto}/api/monitoreo/filtros`, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
        res.on("error", reject);
      });
    });

    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.data.codigo, "NO_AUTORIZADO");
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
});

test("[HU2-7] HTTP GET /api/monitoreo/filtros retorna JSON con catálogos para colaborador autenticado", async () => {
  const servidor = crearServidor();
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const puerto = servidor.address().port;

  try {
    const cookie = await obtenerCookieDePrueba(puerto, '00000252115');
    const respuesta = await new Promise((resolve, reject) => {
      const opciones = {
        hostname: "127.0.0.1",
        port: puerto,
        path: "/api/monitoreo/filtros",
        method: "GET",
        headers: { Cookie: cookie },
      };

      const req = http.request(opciones, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
        res.on("error", reject);
      });
      req.end();
    });

    assert.equal(respuesta.status, 200);
    assert.ok(Array.isArray(respuesta.data.carreras), "carreras debe ser un array");
    assert.ok(Array.isArray(respuesta.data.preparatorias), "preparatorias debe ser un array");
    assert.ok(Array.isArray(respuesta.data.periodos), "periodos debe ser un array");
    assert.ok(Array.isArray(respuesta.data.estadosSolicitud), "estadosSolicitud debe ser un array");
    assert.deepEqual(respuesta.data.semaforos, ["Verde", "Amarillo", "Naranja", "Rojo"]);

    // Debe contener las carreras asignadas al colaborador 00000252115
    assert.ok(respuesta.data.carreras.includes("Ingeniería en Software"));
    assert.ok(respuesta.data.carreras.includes("Licenciatura en Administración"));
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
});

test("[HU2-7] HTTP GET /api/v1/monitoreo/filtros soporta alias de ruta versionada", async () => {
  const servidor = crearServidor();
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const puerto = servidor.address().port;

  try {
    const cookie = await obtenerCookieDePrueba(puerto, '00000233231');
    const respuesta = await new Promise((resolve, reject) => {
      const opciones = {
        hostname: "127.0.0.1",
        port: puerto,
        path: "/api/v1/monitoreo/filtros",
        method: "GET",
        headers: { Cookie: cookie },
      };

      const req = http.request(opciones, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
        res.on("error", reject);
      });
      req.end();
    });

    assert.equal(respuesta.status, 200);
    assert.ok(respuesta.data.carreras.includes("Ingeniería Industrial"));
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
});

