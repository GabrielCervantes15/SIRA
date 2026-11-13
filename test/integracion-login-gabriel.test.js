import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/servidor.js';

async function conServidor(ejecutar) {
  const servidor = crearServidor();
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try { await ejecutar(base); }
  finally { await new Promise((resolve) => servidor.close(resolve)); }
}

async function iniciarSesion(base) {
  const respuesta = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificador: '00000252115', password: 'Password123!' }),
  });
  assert.equal(respuesta.status, 200);
  return respuesta.headers.get('set-cookie')?.split(';')[0];
}

test('[INTEGRACION] el frontend de Gabriel y sus recursos requieren sesión', async () => {
  await conServidor(async (base) => {
    const sinSesion = await fetch(`${base}/app`, { redirect: 'manual' });
    assert.equal(sinSesion.status, 302);
    assert.equal(sinSesion.headers.get('location'), '/');
    const recurso = await fetch(`${base}/app/js/app.js`);
    assert.equal(recurso.status, 401);

    const cookie = await iniciarSesion(base);
    const app = await fetch(`${base}/app`, { headers: { Cookie: cookie } });
    assert.equal(app.status, 200);
    const html = await app.text();
    assert.match(html, /class="barra-superior"/);
    assert.match(html, /id="incluir-aceptados"/);
    assert.doesNotMatch(html, /id="include-accepted"/);
    const js = await fetch(`${base}/app/js/app.js`, { headers: { Cookie: cookie } });
    assert.equal(js.status, 200);
  });
});

test('[INTEGRACION EQ-30] el filtro excluye e incluye aceptados con la misma sesión', async () => {
  await conServidor(async (base) => {
    const cookie = await iniciarSesion(base);
    const opciones = { headers: { Cookie: cookie } };
    const ocultos = await fetch(`${base}/api/monitoreo/aspirantes?mostrar_aceptados=false`, opciones);
    const visibles = await fetch(`${base}/api/monitoreo/aspirantes?mostrar_aceptados=true`, opciones);
    assert.equal(ocultos.status, 200);
    assert.equal(visibles.status, 200);
    const ocultosDatos = await ocultos.json();
    const visiblesDatos = await visibles.json();
    assert.ok(visiblesDatos.total > ocultosDatos.total);
    assert.ok(ocultosDatos.aspirantes.every(a => a.estadoSolicitud !== 'ACEPTADA'));
  });
});

test('[INTEGRACION EQ-40] contacto e historial comparten cartera y protegen datos', async () => {
  await conServidor(async (base) => {
    const cookie = await iniciarSesion(base);
    const detalle = await fetch(`${base}/api/monitoreo/aspirantes/asp-001`, { headers: { Cookie: cookie } });
    assert.equal(detalle.status, 200);
    assert.equal((await detalle.json()).aspirante.id, 'asp-001');

    const historial = await fetch(`${base}/api/monitoreo/aspirantes/asp-001/actividades`, { headers: { Cookie: cookie } });
    assert.equal(historial.status, 200);
    assert.ok(Array.isArray((await historial.json()).actividades));

    const ajeno = await fetch(`${base}/api/monitoreo/aspirantes/asp-003`, { headers: { Cookie: cookie } });
    assert.equal(ajeno.status, 403);
    const anonimo = await fetch(`${base}/api/monitoreo/aspirantes/asp-001/actividades`);
    assert.equal(anonimo.status, 401);
  });
});

test('[SEGURIDAD] no se puede suplir una sesión enviando x-colaborador-id', async () => {
  await conServidor(async (base) => {
    const ruta = `${base}/api/monitoreo/aspirantes`;
    const res = await fetch(ruta, { headers: { 'x-colaborador-id': '00000252115' } });
    assert.equal(res.status, 401);
    const cookie = await iniciarSesion(base);
    const logout = await fetch(`${base}/api/v1/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(logout.status, 200);
    const despues = await fetch(`${base}/app`, { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(despues.status, 302);
  });
});
