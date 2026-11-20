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

const CAMPOS_HU3_3 = [
  'nombreCompleto', 'carreraSolicitada', 'preparatoriaProcedencia',
  'estadoSolicitud', 'fechaSolicitud', 'telefono', 'correo',
];

test('[EQ-42] aspirante propio: 200 con los campos de HU3-3', async () => {
  await conServidor(async (base) => {
    const cookie = await iniciarSesion(base);
    const res = await fetch(`${base}/api/monitoreo/aspirantes/asp-001`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    const { aspirante } = await res.json();
    for (const campo of CAMPOS_HU3_3) assert.ok(campo in aspirante, `falta ${campo}`);
  });
});

test('[EQ-42] el detalle no expone el colaborador asignado', async () => {
  await conServidor(async (base) => {
    const cookie = await iniciarSesion(base);
    const res = await fetch(`${base}/api/monitoreo/aspirantes/asp-001`, { headers: { Cookie: cookie } });
    const { aspirante } = await res.json();
    assert.equal('colaboradorId' in aspirante, false);
  });
});

test('[EQ-42] aspirante inexistente: 404', async () => {
  await conServidor(async (base) => {
    const cookie = await iniciarSesion(base);
    const res = await fetch(`${base}/api/monitoreo/aspirantes/zzz`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).codigo, 'NO_ENCONTRADO');
  });
});

test('[EQ-42] aspirante de otro colaborador: 403', async () => {
  await conServidor(async (base) => {
    const cookie = await iniciarSesion(base);
    const res = await fetch(`${base}/api/monitoreo/aspirantes/asp-003`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).codigo, 'SIN_PERMISO');
  });
});

test('[EQ-42] sin sesión: 401', async () => {
  await conServidor(async (base) => {
    const res = await fetch(`${base}/api/monitoreo/aspirantes/asp-001`);
    assert.equal(res.status, 401);
  });
});