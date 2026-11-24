/**
 * EQ-38 · HU2-13: pruebas de integración con los datos semilla.
 *
 * Levanta el servidor real (crearServidor sin inyecciones, igual que `npm start`)
 * y compara cada respuesta de la API contra lo que dice datos-semilla/aspirantes.json,
 * calculado aparte en la prueba. Si alguien cambia la semilla, la prueba se ajusta sola.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearServidor } from '../src/servidor.js';

const semilla = JSON.parse(readFileSync(new URL('../datos-semilla/aspirantes.json', import.meta.url), 'utf8'));
const SEBASTIAN = { identificador: '00000252115', password: 'Password123!', alias: 'colab-001' };
const GABRIEL = { identificador: '00000233231', password: 'Password123!', alias: 'colab-002' };

const carteraDe = (alias) => semilla.aspirantes.filter((a) => a.colaboradorId === alias);
const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function conSesion(usuario, ejecutar) {
  const servidor = crearServidor();
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const login = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificador: usuario.identificador, password: usuario.password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const get = async (ruta) => {
      const r = await fetch(`${base}${ruta}`, { headers: { Cookie: cookie } });
      return { status: r.status, body: await r.json() };
    };
    await ejecutar(get);
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
}

test('[EQ-38] la semilla tiene datos suficientes para las pruebas', () => {
  assert.ok(carteraDe('colab-001').length >= 20);
  assert.ok(new Set(carteraDe('colab-001').map((a) => a.semaforo)).size >= 3, 'hay los tres colores');
  assert.ok(carteraDe('colab-001').some((a) => a.estadoSolicitud === 'ACEPTADA'));
  assert.ok(semilla.historial.length > 0 && semilla.conversaciones.length > 0);
});

test('[EQ-38] la lista devuelve exactamente la cartera semilla del colaborador', async () => {
  await conSesion(SEBASTIAN, async (get) => {
    const esperados = carteraDe(SEBASTIAN.alias).map((a) => a.id).sort();
    const { status, body } = await get('/api/monitoreo/aspirantes?limit=100');
    assert.equal(status, 200);
    assert.equal(body.total, esperados.length);
    assert.deepEqual(body.aspirantes.map((a) => a.id).sort(), esperados);
    const ajenos = semilla.aspirantes.filter((a) => a.colaboradorId !== SEBASTIAN.alias).map((a) => a.id);
    assert.ok(body.aspirantes.every((a) => !ajenos.includes(a.id)), 'no aparece nadie de otra cartera');
  });
});

test('[EQ-38] cada colaborador semilla ve solo lo suyo', async () => {
  await conSesion(GABRIEL, async (get) => {
    const { body } = await get('/api/v1/monitoreo/aspirantes?limit=100');
    assert.equal(body.total, carteraDe(GABRIEL.alias).length);
  });
});

test('[EQ-38] cada filtro coincide con el conteo calculado desde la semilla', async () => {
  await conSesion(SEBASTIAN, async (get) => {
    const cartera = carteraDe(SEBASTIAN.alias);
    const casos = [
      ['semaforo=ROJO', (a) => a.semaforo === 'ROJO'],
      ['semaforo=verde', (a) => a.semaforo === 'VERDE'],
      ['estado_solicitud=EN_REVISION', (a) => a.estadoSolicitud === 'EN_REVISION'],
      ['mostrar_aceptados=false', (a) => a.estadoSolicitud !== 'ACEPTADA'],
      [`carrera=${encodeURIComponent('Licenciatura en Administración')}`, (a) => a.carreraSolicitada === 'Licenciatura en Administración'],
      ['periodo=2027-1', (a) => a.periodo === '2027-1'],
      ['semaforo=ROJO&mostrar_aceptados=false', (a) => a.semaforo === 'ROJO' && a.estadoSolicitud !== 'ACEPTADA'],
    ];
    for (const [query, filtro] of casos) {
      const { body } = await get(`/api/monitoreo/aspirantes?limit=100&${query}`);
      assert.equal(body.total, cartera.filter(filtro).length, query);
    }
  });
});

test('[EQ-38] la búsqueda por nombre coincide con la semilla (sin acentos)', async () => {
  await conSesion(SEBASTIAN, async (get) => {
    const cartera = carteraDe(SEBASTIAN.alias);
    const termino = sinAcentos(cartera[0].nombreCompleto.split(' ')[0]);
    const { body } = await get(`/api/monitoreo/aspirantes?limit=100&nombre=${encodeURIComponent(termino.toUpperCase())}`);
    const esperados = cartera.filter((a) => sinAcentos(a.nombreCompleto).includes(termino) || sinAcentos(a.folioSolicitud).includes(termino));
    assert.ok(esperados.length > 0);
    assert.deepEqual(body.aspirantes.map((a) => a.id).sort(), esperados.map((a) => a.id).sort());
  });
});

test('[EQ-38] paginar toda la cartera por semáforo no repite ni pierde aspirantes y respeta la severidad', async () => {
  await conSesion(SEBASTIAN, async (get) => {
    const total = carteraDe(SEBASTIAN.alias).length;
    const vistos = [];
    for (let offset = 0; offset < total; offset += 13) {
      const { body } = await get(`/api/monitoreo/aspirantes?limit=13&offset=${offset}&ordenar_por=semaforo&orden_direccion=DESC`);
      vistos.push(...body.aspirantes);
    }
    assert.equal(vistos.length, total);
    assert.equal(new Set(vistos.map((a) => a.id)).size, total);
    const severidad = { ROJO: 3, NARANJA: 2, AMARILLO: 1, VERDE: 0 };
    const niveles = vistos.map((a) => severidad[a.semaforo]);
    assert.deepEqual(niveles, [...niveles].sort((x, y) => y - x), 'rojos primero, verdes al final');
  });
});

test('[EQ-38] los filtros ofrecen las carreras asignadas y los catálogos de la semilla', async () => {
  await conSesion(SEBASTIAN, async (get) => {
    const { status, body } = await get('/api/monitoreo/filtros');
    assert.equal(status, 200);
    assert.deepEqual(body.carreras, ['Ingeniería en Software', 'Licenciatura en Administración']);
    for (const prepa of new Set(semilla.aspirantes.map((a) => a.preparatoriaProcedencia).filter(Boolean))) {
      assert.ok(body.preparatorias.includes(prepa), prepa);
    }
  });
});

test('[EQ-38] detalle, historial y chat de cada aspirante de la cartera coinciden con la semilla', async () => {
  await conSesion(SEBASTIAN, async (get) => {
    for (const a of carteraDe(SEBASTIAN.alias)) {
      const detalle = await get(`/api/monitoreo/aspirantes/${a.id}`);
      assert.equal(detalle.status, 200, a.id);
      assert.equal(detalle.body.aspirante.nombreCompleto, a.nombreCompleto);
      assert.equal(detalle.body.aspirante.estadoSolicitud, a.estadoSolicitud);

      const historial = await get(`/api/monitoreo/aspirantes/${a.id}/actividades`);
      assert.equal(historial.body.total, semilla.historial.filter((h) => h.aspiranteId === a.id).length, `historial ${a.id}`);

      const chat = await get(`/api/monitoreo/aspirantes/${a.id}/conversacion`);
      assert.equal(chat.body.mensajes.length, semilla.conversaciones.filter((m) => m.aspiranteId === a.id).length, `chat ${a.id}`);
    }
  });
});
