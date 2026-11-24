/**
 * HU 6 por HTTP con los datos semilla del proyecto:
 *   EQ-71 listado, EQ-55 perfil, EQ-64 vista previa, EQ-59 confirmación y EQ-61 correo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/servidor.js';

const ADMIN = { identificador: '00000100001', password: 'AdminPassword2026!' };
const COLABORADOR = { identificador: '00000252115', password: 'Password123!' };

async function conServidor(opciones, ejecutar) {
  const servidor = crearServidor(opciones);
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try { await ejecutar({ base, servidor }); }
  finally { await new Promise((resolve) => servidor.close(resolve)); }
}

async function login(base, credenciales) {
  const r = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credenciales),
  });
  assert.equal(r.status, 200, `login ${credenciales.identificador}`);
  return r.headers.get('set-cookie').split(';')[0];
}

const post = (base, ruta, cookie, cuerpo) => fetch(`${base}${ruta}`, {
  method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
});

test('[EQ-71] los dos roles consultan el listado; sin sesión 401', async () => {
  await conServidor({}, async ({ base }) => {
    assert.equal((await fetch(`${base}/api/v1/colaboradores`)).status, 401);
    assert.equal((await fetch(`${base}/app/colaboradores/listado.html`)).status, 401);
    const colaborador = await login(base, COLABORADOR);
    const r = await fetch(`${base}/api/v1/colaboradores`, { headers: { Cookie: colaborador } });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).total, 5);
  });
});

test('[EQ-71] vista de colaborador: abre listado.html, pero registro e inactivos siguen siendo de administrador', async () => {
  const colaboradores = [
    { idInstitucional: '00000252115', campus: 'Campus Obregón Náinari', carreras: ['Ingeniería en Software'] },
    { idInstitucional: '00000233231', campus: 'Campus Obregón Centro', carreras: ['Ingeniería Industrial'], estado: 'inactivo' },
  ];
  await conServidor({ colaboradores }, async ({ base }) => {
    const colaborador = await login(base, COLABORADOR);
    const get = (ruta) => fetch(`${base}${ruta}`, { headers: { Cookie: colaborador } });

    const pagina = await get('/app/colaboradores/listado.html');
    assert.equal(pagina.status, 200);
    const html = await pagina.text();
    assert.doesNotMatch(html, /id="abrir-registro"/, 'sin botón Registrar colaborador');
    assert.doesNotMatch(html, /id="mostrar-inactivos"/, 'sin interruptor de inactivos');
    for (const recurso of ['listado.js', 'listado-colaboradores.js', 'registro.css', 'validaciones.js']) {
      assert.equal((await get(`/app/colaboradores/${recurso}`)).status, 200, recurso);
    }

    const conInactivos = await (await get('/api/v1/colaboradores?incluir_inactivos=true')).json();
    assert.deepEqual(conInactivos.colaboradores.map((c) => c.idInstitucional), ['00000252115'], 'el colaborador nunca ve inactivos');

    for (const ruta of ['/app/colaboradores/registro.html', '/app/colaboradores/registro.js', '/api/v1/colaboradores/registro/catalogo', '/api/v1/colaboradores/registro/perfil/00000260001']) {
      assert.equal((await get(ruta)).status, 403, ruta);
    }

    const admin = await login(base, ADMIN);
    const todos = await (await fetch(`${base}/api/v1/colaboradores?incluir_inactivos=true`, { headers: { Cookie: admin } })).json();
    assert.equal(todos.total, 2, 'el administrador sí ve inactivos');
  });
});

test('[EQ-71] el listado semilla trae a los 5 colaboradores con su carga real y filtra por campus', async () => {
  await conServidor({}, async ({ base }) => {
    const cookie = await login(base, ADMIN);
    const todos = await (await fetch(`${base}/api/v1/colaboradores`, { headers: { Cookie: cookie } })).json();
    assert.equal(todos.total, 5);
    const sebastian = todos.colaboradores.find((c) => c.idInstitucional === '00000252115');
    assert.equal(sebastian.nombreCompleto, 'Sebastián Bórquez Huerta');
    assert.equal(sebastian.totalAspirantes, 40, 'los 40 aspirantes semilla de colab-001');
    assert.ok(todos.campus.includes('Campus Navojoa'));

    const nainari = await (await fetch(`${base}/api/v1/colaboradores?campus=${encodeURIComponent('Campus Obregón Náinari')}`, { headers: { Cookie: cookie } })).json();
    assert.deepEqual(nainari.colaboradores.map((c) => c.idInstitucional).sort(), ['00000252115', '00000252390']);

    const malo = await fetch(`${base}/api/v1/colaboradores?campus=Marte`, { headers: { Cookie: cookie } });
    assert.equal(malo.status, 400);
  });
});

test('[EQ-55] con la semilla, un colaborador ya registrado da 409 en el paso 1', async () => {
  await conServidor({}, async ({ base }) => {
    const cookie = await login(base, ADMIN);
    const r = await fetch(`${base}/api/v1/colaboradores/registro/perfil/00000252115`, { headers: { Cookie: cookie } });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).codigo, 'YA_REGISTRADO');
  });
});

// Usuarios propios para registrar a alguien que no está en la semilla.
const usuarios = [
  { idInstitucional: '00000100001', password: 'AdminPassword2026!', nombreCompleto: 'Admin Prueba', correoInstitucional: 'admin@itson.edu.mx', telefono: '6440000000', activo: true },
  { idInstitucional: '00000300001', password: 'Password123!', nombreCompleto: 'Nora Nueva Díaz', correoInstitucional: 'nora@itson.edu.mx', telefono: '6440000001', activo: true },
];
const usuariosCrm = [
  { idInstitucional: '00000100001', rol: 'administrador', activo: true },
  { idInstitucional: '00000300001', rol: 'colaborador', activo: true },
];
const SOLICITUD = { idInstitucional: '00000300001', campus: 'Campus Navojoa', carreras: ['Ingeniería en Software'] };

test('[EQ-64→EQ-59→EQ-61] vista previa, confirmación, correo y nueva cartera del colaborador', async () => {
  await conServidor({ usuarios, usuariosCrm, opcionesNotificaciones: { esperaBaseMs: 1 } }, async ({ base, servidor }) => {
    const admin = await login(base, { identificador: '00000100001', password: 'AdminPassword2026!' });

    const vista = await post(base, '/api/v1/colaboradores/registro/vista-previa', admin, SOLICITUD);
    assert.equal(vista.status, 200);
    const previa = await vista.json();
    assert.equal(previa.totalAspirantes, 18, '3 de colab-001, 11 de colab-003 y 4 de colab-004 en Navojoa/Software');
    assert.equal(previa.cargas[0].despues, 18);

    const confirmado = await post(base, '/api/v1/colaboradores/registro', admin, SOLICITUD);
    assert.equal(confirmado.status, 201);
    const cuerpo = await confirmado.json();
    assert.equal(cuerpo.asignacion.totalAspirantesAsignados, previa.totalAspirantes, 'se asigna exactamente lo que se revisó');

    const repetido = await post(base, '/api/v1/colaboradores/registro', admin, SOLICITUD);
    assert.equal(repetido.status, 409);

    await servidor.modulos.notificaciones.consumidorRegistro.esperarPendientes();
    const bandeja = servidor.modulos.notificaciones.servicioCorreo.bandeja();
    assert.equal(bandeja.length, 1);
    assert.equal(bandeja[0].para, 'nora@itson.edu.mx');

    const listado = await (await fetch(`${base}/api/v1/colaboradores`, { headers: { Cookie: admin } })).json();
    assert.deepEqual(listado.colaboradores.map((c) => [c.idInstitucional, c.totalAspirantes]), [['00000300001', 18]]);

    const nora = await login(base, { identificador: '00000300001', password: 'Password123!' });
    const cartera = await (await fetch(`${base}/api/monitoreo/aspirantes?limit=50`, { headers: { Cookie: nora } })).json();
    assert.equal(cartera.total, 18);
  });
});

test('[EQ-64] la vista previa también exige administrador y valida la solicitud', async () => {
  await conServidor({ usuarios, usuariosCrm }, async ({ base }) => {
    const nora = await login(base, { identificador: '00000300001', password: 'Password123!' });
    assert.equal((await post(base, '/api/v1/colaboradores/registro/vista-previa', nora, SOLICITUD)).status, 403);
    const admin = await login(base, { identificador: '00000100001', password: 'AdminPassword2026!' });
    const sinCarreras = await post(base, '/api/v1/colaboradores/registro/vista-previa', admin, { ...SOLICITUD, carreras: [] });
    assert.equal(sinCarreras.status, 400);
    assert.equal((await sinCarreras.json()).codigo, 'CARRERAS_OBLIGATORIAS');
    const jsonRoto = await fetch(`${base}/api/v1/colaboradores/registro/vista-previa`, {
      method: 'POST', headers: { Cookie: admin, 'Content-Type': 'application/json' }, body: '{roto',
    });
    assert.equal(jsonRoto.status, 400);
  });
});
