import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/servidor.js';
import { crearProveedorAutenticacionSimulado } from '../src/modulos/autenticacion/index.js';
import { idValido, puedeContinuar, puedeGuardarCarreras } from '../frontend/colaboradores/validaciones.js';
import { crearCatalogoRegistroDemo } from '../src/modulos/colaboradores/catalogo-registro-demo.js';

const adminId = '00000123456';
const colaboradorId = '00000987654';
const usuarios = [
  { idInstitucional: adminId, password: 'ClaveDemo123!', nombreCompleto: 'Admin Test', correoInstitucional: 'admin@test.edu.mx', telefono: '6440000000', fotoUrl: '', activo: true },
  { idInstitucional: colaboradorId, password: 'ClaveDemo123!', nombreCompleto: 'Colaborador Prueba', correoInstitucional: 'colaborador@test.edu.mx', telefono: '6441111111', fotoUrl: '', activo: true },
];
const usuariosCrm = [
  { idInstitucional: adminId, rol: 'administrador', activo: true },
  { idInstitucional: colaboradorId, rol: 'colaborador', activo: true },
];
const campus = 'Campus Obregón Náinari';
const carrera = 'Ingeniería en Software';

async function conServidor(opciones, fn) {
  const servidor = crearServidor({
    usuarios, usuariosCrm,
    proveedor: crearProveedorAutenticacionSimulado({ usuarios }),
    ...opciones,
  });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  async function login(id = adminId) {
    const respuesta = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificador: id, password: 'ClaveDemo123!' }),
    });
    assert.equal(respuesta.status, 200);
    return respuesta.headers.get('set-cookie').split(';')[0];
  }
  async function pedir(ruta, cookie, body) {
    return fetch(`${base}${ruta}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  try { await fn({ base, pedir, login }); }
  finally { await new Promise((resolve) => servidor.close(resolve)); }
}

test('[EQ-62] interfaz y API de registro requieren una sesión administrativa', async () => {
  await conServidor({}, async ({ pedir, login }) => {
    for (const ruta of ['/app/colaboradores/registro.html', '/app/colaboradores/registro.js', '/api/v1/colaboradores/registro/catalogo']) {
      assert.equal((await pedir(ruta)).status, 401);
    }
    const cookieColaborador = await login(colaboradorId);
    for (const ruta of ['/app/colaboradores/registro.html', '/app/colaboradores/registro.js', '/api/v1/colaboradores/registro/catalogo']) {
      const respuesta = await pedir(ruta, cookieColaborador);
      assert.equal(respuesta.status, 403);
      assert.equal((await respuesta.json()).codigo, 'SIN_PERMISO');
    }
  });
});

test('[EQ-62] administrador abre la pantalla con lectura, campus y botón bloqueado', async () => {
  await conServidor({}, async ({ pedir, login }) => {
    const cookie = await login();
    const respuesta = await pedir('/app/colaboradores/registro.html', cookie);
    assert.equal(respuesta.status, 200);
    const html = await respuesta.text();
    assert.match(html, /id="continuar"[^>]+disabled/);
    assert.match(html, /id="campus"[^>]+disabled/);
    assert.match(html, /id="nombre-perfil"[^>]+readonly/);
    assert.match(html, /id="correo-perfil"[^>]+readonly/);
    assert.match(html, /id="telefono-perfil"[^>]+readonly/);
    assert.match(html, /id="guardar-borrador"[^>]+disabled/);
    assert.equal((await pedir('/app/colaboradores/validaciones.js', cookie)).status, 200);
  });
});

test('[EQ-62] perfil existente entrega datos sin credenciales y ID desconocido informa error', async () => {
  await conServidor({}, async ({ pedir, login }) => {
    const cookie = await login();
    const resp = await pedir(`/api/v1/colaboradores/registro/perfil/${colaboradorId}`, cookie);
    assert.equal(resp.status, 200);
    const { perfil } = await resp.json();
    assert.equal(perfil.nombreCompleto, 'Colaborador Prueba');
    assert.equal(perfil.correoInstitucional, 'colaborador@test.edu.mx');
    assert.equal(perfil.telefono, '6441111111');
    assert.equal(Object.hasOwn(perfil, 'password'), false);
    assert.equal((await pedir('/api/v1/colaboradores/registro/perfil/1', cookie)).status, 400);
    const desconocido = await pedir('/api/v1/colaboradores/registro/perfil/99999999', cookie);
    assert.equal(desconocido.status, 404);
    assert.equal((await desconocido.json()).codigo, 'ID_NO_ENCONTRADO');
  });
});

test('[EQ-62] la validación de ID ya registrado admite integración con EQ-55', async () => {
  await conServidor({ idsColaboradoresYaRegistrados: [colaboradorId] }, async ({ pedir, login }) => {
    const cookie = await login();
    const resp = await pedir(`/api/v1/colaboradores/registro/perfil/${colaboradorId}`, cookie);
    assert.equal(resp.status, 409);
    assert.equal((await resp.json()).codigo, 'YA_REGISTRADO');
  });
});

test('[EQ-62/EQ-63] el catálogo procede de la semilla y separa carreras por campus', async () => {
  await conServidor({}, async ({ pedir, login }) => {
    const cookie = await login();
    const respuesta = await pedir('/api/v1/colaboradores/registro/catalogo', cookie);
    assert.equal(respuesta.status, 200);
    const catalogo = await respuesta.json();
    assert.equal(catalogo.origen, 'DATOS_SEMILLA');
    assert.ok(catalogo.campus.includes(campus));
    assert.ok(catalogo.carrerasPorCampus[campus].includes(carrera));
    assert.equal(
  catalogo.carrerasPorCampus[campus].includes('Carrera inexistente'),
  false
);
  });
});

test('[EQ-62] sin campus bloquea borrador y con campus guarda primer paso', async () => {
  await conServidor({}, async ({ pedir, login }) => {
    const cookie = await login();
    const ruta = '/api/v1/colaboradores/registro/borrador';
    const vacio = await pedir(ruta, cookie, { idInstitucional: colaboradorId, campus: '' });
    assert.equal(vacio.status, 422);
    assert.equal((await vacio.json()).codigo, 'CAMPUS_OBLIGATORIO');
    const invalido = await pedir(ruta, cookie, { idInstitucional: colaboradorId, campus: 'Campus inventado' });
    assert.equal(invalido.status, 422);
    const ok = await pedir(ruta, cookie, { idInstitucional: colaboradorId, campus });
    assert.equal(ok.status, 200);
    const { borrador } = await ok.json();
    assert.equal(borrador.estado, 'BORRADOR');
    assert.equal(borrador.campus, campus);
    assert.equal(Object.hasOwn(borrador, 'carreras'), false);
  });
});

test('[EQ-63] rechaza guardar cero carreras o carreras ajenas al campus', async () => {
  await conServidor({}, async ({ pedir, login }) => {
    const cookie = await login();
    const ruta = '/api/v1/colaboradores/registro/borrador';
    const sinCarreras = await pedir(ruta, cookie, { idInstitucional: colaboradorId, campus, carreras: [] });
    assert.equal(sinCarreras.status, 422);
    assert.equal((await sinCarreras.json()).codigo, 'CARRERAS_OBLIGATORIAS');
    const otraCarrera = await pedir(ruta, cookie, { idInstitucional: colaboradorId, campus, carreras: ['Carrera inexistente'] });
    assert.equal(otraCarrera.status, 422);
    assert.equal((await otraCarrera.json()).codigo, 'CARRERA_INVALIDA');
    assert.equal((await pedir(`${ruta}/${colaboradorId}`, cookie)).status, 404);
  });
});

test('[EQ-63] guarda las carreras y permite recuperar borrador sin confirmar alta', async () => {
  await conServidor({}, async ({ pedir, login }) => {
    const cookie = await login();
    const ruta = '/api/v1/colaboradores/registro/borrador';
    const respuesta = await pedir(ruta, cookie, { idInstitucional: colaboradorId, campus, carreras: [carrera] });
    assert.equal(respuesta.status, 200);
    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.confirmado, false);
    assert.deepEqual(cuerpo.borrador.carreras, [carrera]);
    const obtenido = await pedir(`${ruta}/${colaboradorId}`, cookie);
    assert.equal(obtenido.status, 200);
    assert.deepEqual((await obtenido.json()).borrador.carreras, [carrera]);
  });
});

test('[EQ-62/EQ-63] funciones puras mantienen botones bloqueados hasta cumplir las reglas', () => {
  assert.equal(idValido('00000252115'), true);
  assert.equal(idValido('sinID'), false);
  assert.equal(puedeContinuar({ perfil: { idInstitucional: '001' }, campus: '', campusDisponibles: [campus] }), false);
  assert.equal(puedeContinuar({ perfil: { idInstitucional: '001' }, campus, campusDisponibles: [campus] }), true);
  assert.equal(puedeGuardarCarreras({ carreras: [], disponibles: [carrera] }), false);
  assert.equal(puedeGuardarCarreras({ carreras: ['Otra'], disponibles: [carrera] }), false);
  assert.equal(puedeGuardarCarreras({ carreras: [carrera], disponibles: [carrera] }), true);
});

test('[EQ-63] catálogo permite reemplazo por el adaptador definitivo de EQ-57', () => {
  const catalogo = crearCatalogoRegistroDemo([{ campus: 'Campus Demo', carreraSolicitada: 'Carrera A' }]);
  assert.deepEqual(catalogo.listarCampus(), ['Campus Demo']);
  assert.deepEqual(catalogo.listarCarreras('Campus Demo'), ['Carrera A']);
  assert.equal(catalogo.contieneCarrera('Campus Demo', 'Carrera B'), false);
});
