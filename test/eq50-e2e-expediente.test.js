/**
 * EQ-50 · HU3-11: prueba E2E del recorrido lista → expediente → historial → chat.
 *
 * Usa el servidor real con la semilla y las mismas rutas que llama el frontend
 * (frontend/js/api.js), en el orden en que el colaborador las recorre.
 */
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

function cliente(base) {
  let cookie = '';
  const pedir = async (ruta, { method = 'GET', body } = {}) => {
    const r = await fetch(`${base}${ruta}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'manual',
    });
    const nueva = r.headers.get('set-cookie');
    if (nueva) cookie = nueva.split(';')[0];
    const tipo = r.headers.get('content-type') ?? '';
    return { status: r.status, body: tipo.includes('json') ? await r.json() : await r.text() };
  };
  return { pedir };
}

test('[EQ-50] E2E: login → lista → expediente → historial → chat → enviar mensaje → logout', async () => {
  await conServidor(async (base) => {
    const { pedir } = cliente(base);

    // 1. Inicia sesión y abre la app.
    assert.equal((await pedir('/api/v1/auth/login', { method: 'POST', body: { identificador: '00000252115', password: 'Password123!' } })).status, 200);
    const app = await pedir('/app');
    assert.equal(app.status, 200);
    assert.match(app.body, /id="panel"/);
    assert.equal((await pedir('/app/js/expediente-url.js')).status, 200, 'EQ-36: el módulo de URL se sirve');

    // 2. Lista: primera página ordenada por semáforo (lo que pide la tabla al cargar).
    const lista = await pedir('/api/monitoreo/aspirantes?limit=13&offset=0&ordenar_por=semaforo&orden_direccion=DESC&mostrar_aceptados=false');
    assert.equal(lista.status, 200);
    assert.equal(lista.body.aspirantes.length, 13);
    const elegido = lista.body.aspirantes[0];
    assert.equal(elegido.semaforo, 'ROJO', 'el primero es el que más atención necesita');

    // 3. Expediente: el detalle coincide con la fila seleccionada.
    const detalle = await pedir(`/api/monitoreo/aspirantes/${encodeURIComponent(elegido.id)}`);
    assert.equal(detalle.status, 200);
    for (const campo of ['nombreCompleto', 'carreraSolicitada', 'estadoSolicitud', 'semaforo', 'correo', 'telefono']) {
      assert.equal(detalle.body.aspirante[campo], elegido[campo], campo);
    }
    assert.equal('colaboradorId' in detalle.body.aspirante, false);

    // 4. Historial (pestaña Actividades), con y sin rango.
    const historial = await pedir(`/api/monitoreo/aspirantes/${elegido.id}/actividades`);
    assert.equal(historial.status, 200);
    const fechas = historial.body.actividades.map((a) => Date.parse(a.fecha));
    assert.deepEqual(fechas, [...fechas].sort((x, y) => y - x));
    const futuro = await pedir(`/api/monitoreo/aspirantes/${elegido.id}/actividades?desde=2099-01-01`);
    assert.equal(futuro.body.total, 0);

    // 5. Chat: orden cronológico.
    const chat = await pedir(`/api/monitoreo/aspirantes/${elegido.id}/conversacion`);
    assert.equal(chat.status, 200);
    const antes = chat.body.mensajes.length;

    // 6. Envía un mensaje: aparece al final del chat y al principio del historial.
    const envio = await pedir(`/api/monitoreo/aspirantes/${elegido.id}/conversacion`, { method: 'POST', body: { contenido: 'Hola, ¿ya subiste tu constancia?' } });
    assert.equal(envio.status, 201);
    const chatDespues = await pedir(`/api/monitoreo/aspirantes/${elegido.id}/conversacion`);
    assert.equal(chatDespues.body.mensajes.length, antes + 1);
    assert.equal(chatDespues.body.mensajes.at(-1).contenido, 'Hola, ¿ya subiste tu constancia?');
    const historialDespues = await pedir(`/api/monitoreo/aspirantes/${elegido.id}/actividades`);
    assert.equal(historialDespues.body.total, historial.body.total + 1);
    assert.equal(historialDespues.body.actividades[0].tipo, 'MENSAJE_ENVIADO');

    // 7. La lista refleja la nueva actividad del aspirante.
    const listaDespues = await pedir('/api/monitoreo/aspirantes?limit=100');
    const fila = listaDespues.body.aspirantes.find((a) => a.id === elegido.id);
    assert.equal(fila.fechaUltimaActividad, envio.body.mensaje.fecha);

    // 8. Cierra sesión: ya no puede ver el expediente.
    assert.equal((await pedir('/api/v1/auth/logout', { method: 'POST' })).status, 200);
    for (const ruta of [`/api/monitoreo/aspirantes/${elegido.id}`, `/api/monitoreo/aspirantes/${elegido.id}/actividades`, `/api/monitoreo/aspirantes/${elegido.id}/conversacion`]) {
      assert.equal((await pedir(ruta)).status, 401, ruta);
    }
  });
});

test('[EQ-50] E2E: otro colaborador no puede abrir ni escribir en un expediente ajeno', async () => {
  await conServidor(async (base) => {
    const sebastian = cliente(base);
    await sebastian.pedir('/api/v1/auth/login', { method: 'POST', body: { identificador: '00000252115', password: 'Password123!' } });
    const ajeno = (await sebastian.pedir('/api/monitoreo/aspirantes?limit=1')).body.aspirantes[0].id;

    const gabriel = cliente(base);
    await gabriel.pedir('/api/v1/auth/login', { method: 'POST', body: { identificador: '00000233231', password: 'Password123!' } });
    for (const ruta of [`/api/monitoreo/aspirantes/${ajeno}`, `/api/monitoreo/aspirantes/${ajeno}/actividades`, `/api/monitoreo/aspirantes/${ajeno}/conversacion`]) {
      const r = await gabriel.pedir(ruta);
      assert.equal(r.status, 403, ruta);
      assert.equal(r.body.codigo, 'SIN_PERMISO');
    }
    const envio = await gabriel.pedir(`/api/monitoreo/aspirantes/${ajeno}/conversacion`, { method: 'POST', body: { contenido: 'intruso' } });
    assert.equal(envio.status, 403);
    const chat = await sebastian.pedir(`/api/monitoreo/aspirantes/${ajeno}/conversacion`);
    assert.equal(chat.body.mensajes.some((m) => m.contenido === 'intruso'), false);
  });
});

test('[EQ-50] E2E: expediente inexistente y mensaje vacío dan errores claros', async () => {
  await conServidor(async (base) => {
    const { pedir } = cliente(base);
    await pedir('/api/v1/auth/login', { method: 'POST', body: { identificador: '00000252115', password: 'Password123!' } });
    for (const ruta of ['/api/monitoreo/aspirantes/no-existe', '/api/monitoreo/aspirantes/no-existe/actividades', '/api/monitoreo/aspirantes/no-existe/conversacion']) {
      assert.equal((await pedir(ruta)).status, 404, ruta);
    }
    const vacio = await pedir('/api/monitoreo/aspirantes/asp-001/conversacion', { method: 'POST', body: { contenido: '   ' } });
    assert.equal(vacio.status, 400);
    assert.equal(vacio.body.codigo, 'MENSAJE_VACIO');
  });
});
