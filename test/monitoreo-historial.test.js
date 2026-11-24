import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RepositorioMonitoreoMemoria } from '../src/modulos/monitoreo/infraestructura/repositorio-monitoreo-memoria.js';
import { RepositorioMonitoreoPostgres } from '../src/modulos/monitoreo/infraestructura/repositorio-monitoreo-postgres.js';
import { ObtenerHistorialAspiranteCasoUso } from '../src/modulos/monitoreo/aplicacion/obtener-historial-aspirante.caso-uso.js';
import { METODOS_REPOSITORIO_MONITOREO } from '../src/modulos/monitoreo/dominio/repositorio-monitoreo.js';
import { crearServidor } from '../src/servidor.js';

const COLABORADOR = '00000252115'; // alias colab-001

function crearCasoUso() {
  const repositorio = new RepositorioMonitoreoMemoria({
    aspirantes: [
      { id: 'a1', nombreCompleto: 'Ana Prueba', colaboradorId: 'colab-001' },
      { id: 'a2', nombreCompleto: 'Carla Ajena', colaboradorId: 'colab-002' },
    ],
    historial: [
      { id: 'e1', aspiranteId: 'a1', tipoEvento: 'CAMBIO_ESTADO', titulo: 'Solicitud en revisión', fechaEvento: '2026-10-16T10:00:00Z' },
      { id: 'e2', aspiranteId: 'a1', tipoEvento: 'MENSAJE_ENVIADO', titulo: 'Bienvenida', detalle: 'Pasos para subir constancia', fechaEvento: '2026-10-18T12:00:00Z' },
      { id: 'e3', aspiranteId: 'a1', tipoEvento: 'CONSTANCIA_ENTREGADA', titulo: 'Constancia recibida', fechaEvento: '2026-10-20T23:30:00Z' },
      { id: 'e4', aspiranteId: 'a1', tipoEvento: 'NOTA_SEGUIMIENTO', titulo: 'Misma fecha que e2', fechaEvento: '2026-10-18T12:00:00Z' },
      { id: 'x1', aspiranteId: 'a2', tipoEvento: 'CAMBIO_ESTADO', titulo: 'De otra cartera', fechaEvento: '2026-10-17T10:00:00Z' },
    ],
  });
  return { repositorio, casoUso: new ObtenerHistorialAspiranteCasoUso({ repositorioMonitoreo: repositorio }) };
}

test('[EQ-43] devuelve { actividades, total } del más reciente al más antiguo, desempatando por id', async () => {
  const { casoUso } = crearCasoUso();
  const { actividades, total } = await casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: 'a1' });
  assert.equal(total, 4);
  assert.deepEqual(actividades.map((a) => a.id), ['e3', 'e4', 'e2', 'e1']);
  assert.deepEqual(Object.keys(actividades[0]).sort(), ['fecha', 'id', 'texto', 'tipo']);
  assert.equal(actividades.find((a) => a.id === 'e2').texto, 'Bienvenida — Pasos para subir constancia');
});

test('[EQ-43] el rango desde/hasta es inclusivo y "hasta" con solo fecha cubre todo el día', async () => {
  const { casoUso } = crearCasoUso();
  const exacto = await casoUso.ejecutar({
    colaboradorId: COLABORADOR, aspiranteId: 'a1',
    desde: '2026-10-18T12:00:00Z', hasta: '2026-10-18T12:00:00Z',
  });
  assert.deepEqual(exacto.actividades.map((a) => a.id), ['e4', 'e2']);

  const soloFecha = await casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: 'a1', desde: '2026-10-20', hasta: '2026-10-20' });
  assert.deepEqual(soloFecha.actividades.map((a) => a.id), ['e3']);
});

test('[EQ-43] rango inválido o invertido: 400 PARAMETRO_INVALIDO', async () => {
  const { casoUso } = crearCasoUso();
  for (const rango of [{ desde: 'no-es-fecha' }, { hasta: '2026-13-45T99:00' }, { desde: '2026-10-20', hasta: '2026-10-01' }]) {
    await assert.rejects(
      casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: 'a1', ...rango }),
      (error) => error.status === 400 && error.codigo === 'PARAMETRO_INVALIDO',
    );
  }
});

test('[EQ-43] 401 sin colaborador, 404 inexistente y 403 de otra cartera', async () => {
  const { casoUso } = crearCasoUso();
  await assert.rejects(casoUso.ejecutar({ aspiranteId: 'a1' }), (e) => e.status === 401);
  await assert.rejects(casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: 'zzz' }), (e) => e.status === 404);
  await assert.rejects(casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: 'a2' }), (e) => e.status === 403);
});

test('[EQ-43] registrarActividad agrega el evento y aparece primero en el historial', async () => {
  const { repositorio, casoUso } = crearCasoUso();
  await repositorio.registrarActividad({
    aspiranteId: 'a1', tipoEvento: 'MENSAJE_ENVIADO', titulo: 'Mensaje enviado por colaborador',
    detalle: 'Hola', autorTipo: 'COLABORADOR', autorId: COLABORADOR, fechaEvento: '2026-11-01T08:00:00Z',
  });
  const { actividades, total } = await casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: 'a1' });
  assert.equal(total, 5);
  assert.equal(actividades[0].tipo, 'MENSAJE_ENVIADO');
  await assert.rejects(repositorio.registrarActividad({ aspiranteId: 'a1' }), /requiere/);
});

test('[EQ-43] ambos adaptadores cumplen el puerto y Postgres consulta historial_eventos con rango parametrizado', async () => {
  const consultas = [];
  const db = { query: async (sql, params) => { consultas.push({ sql, params }); return { rows: [] }; } };
  const postgres = new RepositorioMonitoreoPostgres({ db });
  const memoria = new RepositorioMonitoreoMemoria();
  for (const metodo of METODOS_REPOSITORIO_MONITOREO) {
    assert.equal(typeof memoria[metodo], 'function', `memoria: falta ${metodo}`);
  }
  assert.equal(typeof postgres.obtenerHistorialAspirante, 'function');
  assert.equal(typeof postgres.registrarActividad, 'function');

  await postgres.obtenerHistorialAspirante(' asp-001 ', { desde: '2026-10-01T00:00:00.000Z', hasta: null });
  assert.match(consultas[0].sql, /FROM aspirantes\.historial_eventos/);
  assert.match(consultas[0].sql, /ORDER BY fecha_evento DESC/);
  assert.deepEqual(consultas[0].params, ['asp-001', '2026-10-01T00:00:00.000Z', null]);
});

// ---------------------------------------------------------------- HTTP

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

test('[EQ-43] HTTP: 200 ordenado, 400, 401, 403 y 404', async () => {
  await conServidor(async (base) => {
    const cookie = await iniciarSesion(base);
    const ruta = (id, qs = '') => `${base}/api/monitoreo/aspirantes/${id}/actividades${qs}`;

    const ok = await fetch(ruta('asp-001'), { headers: { Cookie: cookie } });
    assert.equal(ok.status, 200);
    const cuerpo = await ok.json();
    assert.ok(cuerpo.total > 0);
    assert.equal(cuerpo.total, cuerpo.actividades.length);
    const fechas = cuerpo.actividades.map((a) => Date.parse(a.fecha));
    assert.deepEqual(fechas, [...fechas].sort((a, b) => b - a));

    const v1 = await fetch(`${base}/api/v1/monitoreo/aspirantes/asp-001/actividades`, { headers: { Cookie: cookie } });
    assert.equal(v1.status, 200);

    assert.equal((await fetch(ruta('asp-001', '?desde=2026-12-01&hasta=2026-01-01'), { headers: { Cookie: cookie } })).status, 400);
    assert.equal((await fetch(ruta('asp-001'))).status, 401);
    assert.equal((await fetch(ruta('asp-003'), { headers: { Cookie: cookie } })).status, 403);
    assert.equal((await fetch(ruta('zzz'), { headers: { Cookie: cookie } })).status, 404);
  });
});

test('[EQ-43] HTTP: un mensaje enviado por el colaborador aparece en el historial', async () => {
  await conServidor(async (base) => {
    const cookie = await iniciarSesion(base);
    const envio = await fetch(`${base}/api/monitoreo/aspirantes/asp-001/conversacion`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contenido: 'Recordatorio EQ-43' }),
    });
    assert.equal(envio.status, 201);

    const res = await fetch(`${base}/api/monitoreo/aspirantes/asp-001/actividades`, { headers: { Cookie: cookie } });
    const { actividades } = await res.json();
    assert.equal(actividades[0].tipo, 'MENSAJE_ENVIADO');
    assert.match(actividades[0].texto, /Recordatorio EQ-43/);
  });
});
