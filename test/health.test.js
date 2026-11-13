import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { crearServidor } from "../src/servidor.js";

test("servidor backend expone endpoint de salud /health", async () => {
  const servidor = crearServidor();

  // Escuchar en puerto efímero (0)
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const puerto = servidor.address().port;

  try {
    const respuesta = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${puerto}/health`, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data),
          });
        });
        res.on("error", reject);
      });
    });

    assert.equal(respuesta.statusCode, 200);
    assert.equal(respuesta.body.status, "UP");
    assert.equal(respuesta.body.service, "sira-crm-backend");
    assert.deepEqual(respuesta.body.database.schemasConfigured, [
      "usuarios",
      "aspirantes",
      "alertas",
      "conocimiento",
    ]);
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
});
