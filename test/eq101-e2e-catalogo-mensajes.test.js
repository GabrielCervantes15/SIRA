/**
 * EQ-101 · HU8-9: prueba E2E del catálogo de mensajes.
 *
 * Recorre con el servidor real las mismas llamadas que hace la pantalla de Mensajes
 * (frontend/js/app.js → api.mensajesIA.listar con tamano=9), para los dos roles,
 * y revisa el detalle de cada mensaje. La aceptación con el PO es manual.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearServidor } from '../src/servidor.js';

const CATALOGO = JSON.parse(readFileSync(new URL('../datos-semilla/mensajes-ia.json', import.meta.url), 'utf8')).mensajes;
const idsDe = (categoria, filtro = () => true) => CATALOGO.filter((m) => m.categoria === categoria && filtro(m)).map((m) => m.id);
const conSemaforo = (valor) => (m) => m.llaves.some((l) => l.tipo === 'Semáforo' && l.valor === valor);

async function conServidor(ejecutar) {
  const servidor = crearServidor();
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try { await ejecutar(base); } finally { await new Promise((resolve) => servidor.close(resolve)); }
}

function cliente(base) {
  let cookie = '';
  return async function pedir(ruta, { method = 'GET', body } = {}) {
    const r = await fetch(`${base}${ruta}`, {
      method, redirect: 'manual',
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const nueva = r.headers.get('set-cookie');
    if (nueva) cookie = nueva.split(';')[0];
    const json = (r.headers.get('content-type') ?? '').includes('json');
    return { status: r.status, body: json ? await r.json() : await r.text() };
  };
}

const ROLES = [
  ['colaborador', '00000252115', 'Password123!'],
  ['administrador', '00000100001', 'AdminPassword2026!'],
];

for (const [rol, identificador, password] of ROLES) {
  test(`[EQ-101] E2E (${rol}): Mensajes → Envío → Respuesta → filtro → detalle de cada mensaje`, async () => {
    await conServidor(async (base) => {
      const pedir = cliente(base);
      assert.equal((await pedir('/api/v1/auth/login', { method: 'POST', body: { identificador, password } })).status, 200);

      // 1. La app tiene la vista de Mensajes.
      const app = await pedir('/app');
      assert.equal(app.status, 200);
      assert.match(app.body, /id="vista-mensajes-ia"/);

      // 2. Pestaña Envío (lo primero que pide la pantalla).
      const envio = await pedir('/api/v1/mensajes-ia?categoria=ENVIO&pagina=1&tamano=9');
      assert.equal(envio.status, 200);
      assert.equal(envio.body.totalGeneral, CATALOGO.length, '«Total de mensajes» de la pantalla');
      assert.deepEqual(envio.body.datos.map((m) => m.id), idsDe('ENVIO').slice(0, 9));

      // 3. Pestaña Respuesta.
      const respuesta = await pedir('/api/v1/mensajes-ia?categoria=RESPUESTA&pagina=1&tamano=9');
      assert.equal(respuesta.body.totalCategoria, idsDe('RESPUESTA').length);
      assert.ok(respuesta.body.datos.every((m) => m.llaves.length > 0));

      // 4. Filtro de semáforo de la pantalla (valores «Rojo», «Naranja», «Verde»).
      const rojo = await pedir('/api/v1/mensajes-ia?categoria=ENVIO&semaforo=Rojo&pagina=1&tamano=9');
      assert.deepEqual(rojo.body.datos.map((m) => m.id), idsDe('ENVIO', conSemaforo('Rojo')).slice(0, 9));
      const verde = await pedir('/api/v1/mensajes-ia?categoria=ENVIO&semaforo=Verde&pagina=1&tamano=9');
      assert.equal(verde.body.totalCategoria, idsDe('ENVIO', conSemaforo('Verde')).length);

      // 4b. Segunda página de Envío (flecha →).
      const pagina2 = await pedir('/api/v1/mensajes-ia?categoria=ENVIO&pagina=2&tamano=9');
      assert.deepEqual(pagina2.body.datos.map((m) => m.id), idsDe('ENVIO').slice(9, 18));

      // 5. Detalle de cada mensaje: reglas, vista previa sin variables pendientes, solo lectura.
      for (const m of [...envio.body.datos, ...respuesta.body.datos]) {
        const d = await pedir(`/api/v1/mensajes-ia/${m.id}?aspirante=Lupita`);
        assert.equal(d.status, 200, m.id);
        const detalle = d.body.mensaje;
        assert.equal(detalle.soloLectura, true);
        assert.ok(detalle.reglas.length > 0, `${m.id}: reglas`);
        assert.doesNotMatch(detalle.vistaPrevia.texto, /\{/, `${m.id}: vista previa completa`);
        if (detalle.variables.some((v) => v.nombre === 'aspirante')) assert.match(detalle.vistaPrevia.texto, /Lupita/);
      }

      // 6. Nadie puede modificar el catálogo, ni el administrador.
      const intento = await pedir('/api/v1/mensajes-ia/env-001', { method: 'PUT', body: { texto: 'cambiado' } });
      assert.equal(intento.status, 405);
      assert.equal((await pedir('/api/v1/mensajes-ia/env-001')).body.mensaje.mensaje, CATALOGO.find((m) => m.id === 'env-001').mensaje);

      // 7. Al cerrar sesión ya no se puede consultar.
      await pedir('/api/v1/auth/logout', { method: 'POST' });
      assert.equal((await pedir('/api/v1/mensajes-ia')).status, 401);
    });
  });
}
