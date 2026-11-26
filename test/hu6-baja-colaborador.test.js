/** HU6-18 / HU7: baja de colaborador por HTTP con la semilla del proyecto. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/servidor.js';
import { crearBusEnMemoria } from '../src/compartido/eventos/bus-en-memoria.js';

const ADMIN = { identificador: '00000100001', password: 'AdminPassword2026!' };
const COLABORADOR = { identificador: '00000252115', password: 'Password123!' };
const NAINARI_1 = '00000252115'; // comparte campus con 00000252390
const NAINARI_2 = '00000252390';
const NAVOJOA = '00000247933';   // único en su campus

async function conServidor(opciones, ejecutar) {
  const servidor = crearServidor(opciones);
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try { await ejecutar({ base }); } finally { await new Promise((r) => servidor.close(r)); }
}
async function login(base, credenciales) {
  const r = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credenciales) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const post = (base, ruta, cookie, cuerpo = {}) => fetch(`${base}${ruta}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
const listar = async (base, cookie) => (await (await fetch(`${base}/api/v1/colaboradores?incluir_inactivos=true`, { headers: { Cookie: cookie } })).json()).colaboradores;

test('vista previa: reparte solo entre activos del mismo campus y no modifica nada', async () => {
  await conServidor({}, async ({ base }) => {
    const cookie = await login(base, ADMIN);
    const antes = await listar(base, cookie);
    const r = await post(base, `/api/v1/colaboradores/${NAINARI_1}/baja/vista-previa`, cookie);
    assert.equal(r.status, 200);
    const vp = await r.json();
    assert.equal(vp.informacionActual.campus, 'Campus Obregón Náinari');
    assert.ok(vp.totalAspirantes > 0);
    const porId = Object.fromEntries(antes.map((c) => [c.idInstitucional, c]));
    for (const receptor of vp.distribucion) {
      assert.notEqual(receptor.colaboradorId, NAINARI_1);
      for (const c of receptor.carreras) assert.equal(c.campus, porId[receptor.colaboradorId].campus, 'misma zona');
    }
    assert.equal(vp.distribucion.reduce((t, r) => t + r.nuevosAspirantes, 0), vp.totalAspirantes);
    assert.deepEqual(await listar(base, cookie), antes, 'la vista previa no cambia nada');
  });
});

test('confirmar: inactiva, reasigna toda la cartera, guarda el periodo y publica el evento', async () => {
  const bus = crearBusEnMemoria();
  const eventos = [];
  bus.suscribir('colaboradores.baja.confirmada', (e) => { eventos.push(e); });
  await conServidor({ busEventos: bus }, async ({ base }) => {
    const cookie = await login(base, ADMIN);
    const r = await post(base, `/api/v1/colaboradores/${NAINARI_1}/baja`, cookie, { tipo: 'periodo', inicio: '2026-11-26', fin: '2027-01-15' });
    assert.equal(r.status, 200, await r.clone().text());
    const resultado = await r.json();
    assert.equal(resultado.colaborador.activo, false);

    const despues = await listar(base, cookie);
    const saliente = despues.find((c) => c.idInstitucional === NAINARI_1);
    assert.equal(saliente.activo, false);
    assert.equal(saliente.totalAspirantes, 0, 'su cartera quedó vacía');
    assert.deepEqual(saliente.carreras, []);
    assert.deepEqual(saliente.periodoBaja, { indefinido: false, desde: '2026-11-26', hasta: '2027-01-15' });
    const recibidos = despues.filter((c) => c.activo).reduce((t, c) => t + c.totalAspirantes, 0);
    assert.ok(recibidos >= resultado.reasignacion.totalAspirantes);

    assert.equal(eventos.length, 1);
    assert.equal(eventos[0].colaboradorId, NAINARI_1);
    assert.equal(eventos[0].receptores.length, resultado.reasignacion.receptores.length);

    const otra = await post(base, `/api/v1/colaboradores/${NAINARI_1}/baja`, cookie, { tipo: 'indefinido' });
    assert.equal(otra.status, 409);
    assert.equal((await otra.json()).codigo, 'YA_INACTIVO');
  });
});

test('baja indefinida guarda periodo sin fecha de fin', async () => {
  await conServidor({}, async ({ base }) => {
    const cookie = await login(base, ADMIN);
    assert.equal((await post(base, `/api/v1/colaboradores/${NAINARI_2}/baja`, cookie, { tipo: 'indefinido' })).status, 200);
    const c = (await listar(base, cookie)).find((x) => x.idInstitucional === NAINARI_2);
    assert.equal(c.periodoBaja.indefinido, true);
    assert.equal(c.periodoBaja.hasta, null);
  });
});

test('sin otro colaborador activo en el campus no se permite la baja y no cambia nada', async () => {
  await conServidor({}, async ({ base }) => {
    const cookie = await login(base, ADMIN);
    const antes = await listar(base, cookie);
    for (const ruta of ['baja/vista-previa', 'baja']) {
      const r = await post(base, `/api/v1/colaboradores/${NAVOJOA}/${ruta}`, cookie, { tipo: 'indefinido' });
      assert.equal(r.status, 409);
      const cuerpo = await r.json();
      assert.equal(cuerpo.codigo, 'SIN_COLABORADOR_RELEVO');
      assert.match(cuerpo.mensaje, /Campus Navojoa/);
    }
    assert.deepEqual(await listar(base, cookie), antes);
  });
});

test('validaciones de duración y de identidad', async () => {
  await conServidor({}, async ({ base }) => {
    const cookie = await login(base, ADMIN);
    const ruta = `/api/v1/colaboradores/${NAINARI_1}/baja`;
    const caso = async (cuerpo, codigo) => {
      const r = await post(base, ruta, cookie, cuerpo);
      assert.equal(r.status, 400, JSON.stringify(cuerpo));
      assert.equal((await r.json()).codigo, codigo);
    };
    await caso({}, 'TIPO_BAJA_INVALIDO');
    await caso({ tipo: 'periodo' }, 'FECHAS_BAJA_INVALIDAS');
    await caso({ tipo: 'periodo', inicio: '2026-13-01', fin: '2027-01-01' }, 'FECHAS_BAJA_INVALIDAS');
    await caso({ tipo: 'periodo', inicio: '2027-01-02', fin: '2027-01-01' }, 'PERIODO_BAJA_INVALIDO');
    await caso({ tipo: 'periodo', inicio: '2020-01-01', fin: '2020-02-01' }, 'PERIODO_BAJA_VENCIDO');
    assert.equal((await post(base, '/api/v1/colaboradores/00000999999/baja', cookie, { tipo: 'indefinido' })).status, 404);
    assert.equal((await post(base, '/api/v1/colaboradores/abc/baja', cookie, { tipo: 'indefinido' })).status, 400);
    assert.equal((await listar(base, cookie)).every((c) => c.activo), true, 'ninguna baja inválida cambió datos');
  });
});

test('solo el administrador puede dar de baja', async () => {
  await conServidor({}, async ({ base }) => {
    assert.equal((await post(base, `/api/v1/colaboradores/${NAINARI_2}/baja`, '', { tipo: 'indefinido' })).status, 401);
    const cookie = await login(base, COLABORADOR);
    assert.equal((await post(base, `/api/v1/colaboradores/${NAINARI_2}/baja`, cookie, { tipo: 'indefinido' })).status, 403);
    assert.equal((await post(base, `/api/v1/colaboradores/${NAINARI_2}/baja/vista-previa`, cookie)).status, 403);
  });
});

test('si falla el guardado, se revierte usuarios y se compensa la cartera', async () => {
  const { ConfirmarBajaCasoUso } = await import('../src/modulos/colaboradores/aplicacion/confirmar-baja.caso-uso.js');
  const { RepositorioColaboradoresMemoria } = await import('../src/modulos/colaboradores/infraestructura/repositorio-colaboradores-memoria.js');
  const campus = 'Campus X';
  const repositorio = new RepositorioColaboradoresMemoria({ colaboradores: [
    { idInstitucional: '00000000001', campus, carreras: ['A'] },
    { idInstitucional: '00000000002', campus, carreras: ['B'] },
  ] });
  let compensada = 0;
  const cartera = {
    carteraPorCarrera: async () => [{ campus, carrera: 'A', aspirantes: 4 }],
    contarPorColaborador: async () => ({ '00000000001': 4, '00000000002': 1 }),
    reasignarCartera: async () => ({ aspirantesIds: ['a1'], transferencias: [{ aspiranteId: 'a1', colaboradorAnterior: '00000000001', colaboradorDestino: '00000000002' }], deshacer: async () => { compensada += 1; } }),
  };
  repositorio.registrarTransferencias = async () => { throw new Error('bitácora caída'); };
  const caso = new ConfirmarBajaCasoUso({ repositorioColaboradores: repositorio, cartera, proveedorAutenticacion: { obtenerPorIdInstitucional: async () => null }, bus: { publicar: async () => { throw new Error('no debe publicarse'); } }, registrarError: () => {} });
  await assert.rejects(caso.ejecutar({ idInstitucional: '00000000001', tipo: 'indefinido' }, { administradorId: '00000100001' }), /bitácora caída/);
  assert.equal(compensada, 1, 'se deshizo la reasignación de la cartera');
  const c = await repositorio.obtenerPorId('00000000001');
  assert.equal(c.estado, 'activo');
  assert.deepEqual(c.carreras, ['A']);
  assert.deepEqual((await repositorio.obtenerPorId('00000000002')).carreras, ['B']);
});
