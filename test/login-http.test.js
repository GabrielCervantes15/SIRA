import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/servidor.js';
import { crearProveedorAutenticacionSimulado } from '../src/modulos/autenticacion/index.js';

const usuarios = [
  { idInstitucional: '00000123456', password: 'ClaveDemo123!', nombreCompleto: 'Colaborador Demo', correoInstitucional: 'colaborador@itson.edu.mx', telefono: '+526441234567', fotoUrl: '', activo: true },
  { idInstitucional: '00000654321', password: 'ClaveDemo123!', nombreCompleto: 'Usuario Sin Acceso', correoInstitucional: 'sinacceso@itson.edu.mx', telefono: '+526447654321', fotoUrl: '', activo: true },
];

const usuariosCrmPrueba = [
  {
    idInstitucional: '00000123456',
    rol: 'administrador',
    activo: true
  },
  {
    idInstitucional: '00000654321',
    rol: 'colaborador',
    activo: true
  }
];

async function conServidor(opciones, callback) {
  const server = crearServidor({
  usuarios,
  proveedor: crearProveedorAutenticacionSimulado({ usuarios }),
  usuariosCrm: usuariosCrmPrueba,
  ...opciones
});
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await callback(base); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('[EQ-15] sirve la pantalla de inicio de sesión', async () => {
  await conServidor({}, async (base) => {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Iniciar sesión/);
  });
});

test('[EQ-15] inicia sesión con ID, emite cookie HttpOnly y permite consultar la sesión', async () => {
  await conServidor({ permisos: { administradores: ['00000123456'], usuariosSinAcceso: [] } }, async (base) => {
    const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: '00000123456', password: 'ClaveDemo123!' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const token = cookie.match(/sira_session=([^;]+)/)[1];
    const session = await fetch(`${base}/api/v1/auth/session`, { headers: { Cookie: `sira_session=${token}` } });
    assert.equal(session.status, 200);
    const data = await session.json();
    assert.equal(data.usuario.rol, 'administrador');
    assert.equal(data.usuario.idInstitucional, '00000123456');
  });
});

test('[EQ-15] acepta correo institucional como identificador', async () => {
  await conServidor({}, async (base) => {
    const response = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: 'COLABORADOR@ITSON.EDU.MX', password: 'ClaveDemo123!' }) });
    assert.equal(response.status, 200);
  });
});

test('[EQ-15] cierra la sesión y elimina la cookie', async () => {
  await conServidor({}, async (base) => {
    const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: '00000123456', password: 'ClaveDemo123!' }) });
    const token = login.headers.get('set-cookie').match(/sira_session=([^;]+)/)[1];
    const logout = await fetch(`${base}/api/v1/auth/logout`, { method: 'POST', headers: { Cookie: `sira_session=${token}` } });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    const session = await fetch(`${base}/api/v1/auth/session`, { headers: { Cookie: `sira_session=${token}` } });
    assert.equal(session.status, 401);
  });
});

test('[EQ-15] expira una sesión al vencer el TTL', async () => {
  let now = 1_700_000_000_000;
  await conServidor({ duracionSesionMs: 1000, reloj: () => now }, async (base) => {
    const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: '00000123456', password: 'ClaveDemo123!' }) });
    const token = login.headers.get('set-cookie').match(/sira_session=([^;]+)/)[1];
    now += 1001;
    const session = await fetch(`${base}/api/v1/auth/session`, { headers: { Cookie: `sira_session=${token}` } });
    assert.equal(session.status, 401);
  });
});

test('[EQ-18] rechaza credenciales incorrectas', async () => {
  await conServidor({}, async (base) => {
    const response = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: '00000123456', password: 'incorrecta' }) });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).codigo, 'CREDENCIALES_INVALIDAS');
  });
});

test('[EQ-18] diferencia usuario autenticado sin permiso para SIRA', async () => {
  await conServidor({ permisos: { administradores: [], usuariosSinAcceso: ['00000654321'] } }, async (base) => {
    const response = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: '00000654321', password: 'ClaveDemo123!' }) });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).codigo, 'USUARIO_SIN_ACCESO');
  });
});

test('[EQ-18] informa cuando el proveedor de identidad no está disponible', async () => {
  const proveedor = crearProveedorAutenticacionSimulado({ usuarios });
  proveedor.simularIndisponibilidad(true);
  await conServidor({ proveedor }, async (base) => {
    const response = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: '00000123456', password: 'ClaveDemo123!' }) });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).codigo, 'SERVICIO_NO_DISPONIBLE');
  });
});

test('[EQ-16] asigna rol colaborador desde Usuarios CRM', async () => {
  await conServidor({
    usuariosCrm: [
      {
        idInstitucional: '00000123456',
        rol: 'colaborador',
        activo: true
      }
    ],
    permisos: {
      administradores: ['00000123456'],
      usuariosSinAcceso: []
    }
  }, async (base) => {
    const response = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identificador: '00000123456',
        password: 'ClaveDemo123!'
      })
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.usuario.rol, 'colaborador');
  });
});

test('[EQ-16] rechaza usuario no registrado en CRM', async () => {
  await conServidor({
    usuariosCrm: []
  }, async (base) => {
    const response = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identificador: '00000123456',
        password: 'ClaveDemo123!'
      })
    });

    assert.equal(response.status, 403);
    const data = await response.json();
    assert.equal(data.codigo, 'USUARIO_SIN_ACCESO');
    assert.equal(response.headers.get('set-cookie'), null);
  });
});

test('[EQ-16] rechaza usuario inactivo en CRM', async () => {
  await conServidor({
    usuariosCrm: [
      {
        idInstitucional: '00000123456',
        rol: 'colaborador',
        activo: false
      }
    ]
  }, async (base) => {
    const response = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identificador: '00000123456',
        password: 'ClaveDemo123!'
      })
    });

    assert.equal(response.status, 403);
    const data = await response.json();
    assert.equal(data.codigo, 'USUARIO_SIN_ACCESO');
    assert.equal(response.headers.get('set-cookie'), null);
  });
});
