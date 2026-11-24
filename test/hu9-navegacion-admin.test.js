import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const raiz = new URL("../", import.meta.url);

async function leer(ruta) {
  return readFile(new URL(ruta, raiz), "utf8");
}

test("[HU9-9] la opción de configuración está dentro de Mensajes y oculta por defecto", async () => {
  const html = await leer("frontend/index.html");
  const inicioMensajes = html.indexOf('id="vista-mensajes-ia"');
  const finMensajes = html.indexOf("</section>", inicioMensajes);
  const vistaMensajes = html.slice(inicioMensajes, finMensajes);

  assert.ok(inicioMensajes >= 0, "debe existir la vista de Mensajes");
  assert.match(vistaMensajes, /id="abrir-configuracion"[^>]*hidden/);
  assert.match(vistaMensajes, /id="panel-configuracion"/);
  assert.doesNotMatch(html, /id="nav-configuracion"|id="vista-configuracion"/);
});

test("[HU9-9] el frontend habilita el panel únicamente con el rol Administrador", async () => {
  const app = await leer("frontend/js/app.js");
  const panel = await leer("frontend/js/configuracion-mensajes.js");

  assert.match(app, /esAdministrador:\s*sesion\.usuario\?\.rol\s*===\s*"administrador"/);
  assert.match(panel, /botonAbrir\.hidden\s*=\s*!esAdministrador/);
  assert.match(panel, /if\s*\(!esAdministrador\)\s*return/);
});

test("[HU9-5/6] el frontend usa el endpoint administrativo del módulo Mensajes", async () => {
  const api = await leer("frontend/js/api.js");
  const servidor = await leer("src/servidor.js");

  assert.match(api, /\/api\/v1\/mensajes\/configuracion/);
  assert.match(servidor, /moduloMensajes\.enrutador\(req,\s*res,\s*\{/);
  assert.match(servidor, /usuario:\s*sesion\?\.usuario\s*\?\?\s*null/);
});
