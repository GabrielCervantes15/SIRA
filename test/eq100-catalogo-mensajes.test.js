/**
 * EQ-100 · HU8-8: pruebas unitarias y de integración del catálogo de mensajes.
 *   - Dominio (EQ-95): variables, vista previa, validación y semilla (datos-semilla/mensajes-ia.json).
 *   - Casos de uso (EQ-96 / EQ-97): lista por categoría, filtros, paginación y detalle.
 *   - Adaptadores: memoria y PostgreSQL (con db falso), y semilla SQL = semilla JSON.
 *   - Integración HTTP: sesión, ambos roles, solo lectura y códigos de error.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  crearModuloCatalogoMensajes, RepositorioCatalogoMemoria, RepositorioCatalogoPostgres, METODOS_REPOSITORIO_CATALOGO,
  variablesDeTexto, renderizarPlantilla, valoresVistaPrevia, validarMensaje, validarCatalogo, VALORES_EJEMPLO,
  desdeSemilla, catalogoDesdeSemilla,
} from '../src/modulos/mensajes-ia/index.js';
import { crearServidor } from '../src/servidor.js';

const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');
const CRUDA = JSON.parse(leer('datos-semilla/mensajes-ia.json')).mensajes;
const SEMILLA = catalogoDesdeSemilla(CRUDA);
const porId = Object.fromEntries(SEMILLA.map((m) => [m.id, m]));
const ids = (categoria, filtro = () => true) => CRUDA.filter((m) => m.categoria === categoria && filtro(m)).map((m) => m.id);
const tieneLlave = (tipo, valor) => (m) => m.llaves.some((l) => l.tipo === tipo && (valor === undefined || l.valor === valor));
const rechaza = (status, codigo) => (e) => e.status === status && e.codigo === codigo;

// ---------------------------------------------------------------- Dominio (EQ-95)

test('[EQ-95] variablesDeTexto encuentra cada variable una sola vez, con llaves simples o dobles', () => {
  assert.deepEqual(variablesDeTexto('Hola {aspirante}, han pasado {valor}{magnitud}; adiós {{ aspirante }}'), ['aspirante', 'valor', 'magnitud']);
  assert.deepEqual(variablesDeTexto('Sin variables'), []);
  assert.deepEqual(variablesDeTexto(null), []);
});

test('[EQ-95] renderizarPlantilla sustituye todo y falla si falta un valor (nunca sale «{aspirante}»)', () => {
  assert.equal(renderizarPlantilla('¡Hola {aspirante}!', { aspirante: ' Ana ' }), '¡Hola Ana!');
  assert.equal(renderizarPlantilla('Han pasado {valor}{magnitud} desde', { valor: '3', magnitud: 'días' }), 'Han pasado 3 días desde', 'la unidad lleva espacio');
  assert.throws(() => renderizarPlantilla('Hola, {aspirante}', { aspirante: '  ' }), rechaza(400, 'VARIABLE_FALTANTE'));
  assert.throws(() => renderizarPlantilla('Hola, {aspirante}', {}), rechaza(400, 'VARIABLE_FALTANTE'));
  assert.equal(renderizarPlantilla('Texto fijo', {}), 'Texto fijo');
});

test('[EQ-95] valoresVistaPrevia usa ejemplos, limpia lo que manda el usuario y limita a 80 caracteres', () => {
  assert.deepEqual(valoresVistaPrevia(), VALORES_EJEMPLO);
  assert.deepEqual(valoresVistaPrevia({ aspirante: '  Lupita\n', valor: '' }), { ...VALORES_EJEMPLO, aspirante: 'Lupita' });
  assert.equal(valoresVistaPrevia({ aspirante: 'a'.repeat(80) }).aspirante.length, 80);
  assert.throws(() => valoresVistaPrevia({ aspirante: 'a'.repeat(81) }), rechaza(400, 'VALOR_DEMASIADO_LARGO'));
  assert.equal(valoresVistaPrevia({ otra: 'x' }).otra, undefined, 'ignora variables desconocidas');
});

test('[EQ-95] validarMensaje detecta mensajes mal formados', () => {
  const base = { ...porId['env-001'] };
  assert.deepEqual(validarMensaje(base), []);
  const casos = [
    [{ variables: [] }, /variables declaradas/],
    [{ texto: 'Hola {apodo}', variables: ['apodo'] }, /variable desconocida/],
    [{ texto: 'Atendemos de 9:00 a 18:00', variables: [] }, /horario/],
    [{ categoria: 'OTRA' }, /categoría inválida/],
    [{ reglas: [] }, /regla de negocio/],
    [{ pregunta: '¿Algo?' }, /solo las FAQ/],
    [{ requierePlantillaMeta: true, plantillaMeta: null }, /plantilla de Meta/],
    [{ id: 'Con Espacios' }, /id inválido/],
  ];
  for (const [cambio, esperado] of casos) {
    assert.match(validarMensaje({ ...base, ...cambio }).join(' | '), esperado, JSON.stringify(cambio));
  }
  assert.match(validarCatalogo([base, base]).join(' | '), /id repetido/);
});

test('[EQ-95] la semilla de mensajes-ia.json es válida y el adaptador no altera textos ni llaves', () => {
  assert.deepEqual(validarCatalogo(SEMILLA), []);
  assert.equal(SEMILLA.length, CRUDA.length);
  for (const m of SEMILLA) {
    const original = CRUDA.find((x) => x.id === m.id);
    assert.equal(m.texto, original.mensaje, `${m.id}: el texto no se altera`);
    assert.deepEqual(m.llaves, original.llaves, `${m.id}: las llaves no se alteran`);
    assert.ok(m.nombre && m.reglas.length === m.llaves.length, `${m.id}: nombre y una regla por llave`);
  }
  assert.equal(porId['res-001'].pregunta, CRUDA.find((x) => x.id === 'res-001').llaves[0].valor);
  assert.equal(porId['res-001'].disparador, 'RESPUESTA');
  assert.equal(porId['env-004'].variables.join(), 'aspirante,valor,magnitud');
  assert.deepEqual(SEMILLA.filter((m) => m.categoria === 'ENVIO').map((m) => m.orden), ids('ENVIO').map((_, i) => i + 1));
});

test('[EQ-95] desdeSemilla respeta los campos que el mensaje ya trae', () => {
  const propio = desdeSemilla({ id: 'env-xyz', categoria: 'ENVIO', llaves: [{ tipo: 'Semáforo', valor: 'Rojo' }], mensaje: 'Hola {aspirante}', nombre: 'Propio', reglas: ['Regla propia'] }, 7);
  assert.equal(propio.nombre, 'Propio');
  assert.deepEqual(propio.reglas, ['Regla propia']);
  assert.equal(propio.orden, 7);
  const derivado = desdeSemilla({ id: 'env-abc', categoria: 'ENVIO', llaves: [{ tipo: 'Semáforo', valor: 'Rojo' }], mensaje: 'x' }, 1);
  assert.deepEqual(derivado.reglas, ['Aplica cuando semáforo es «Rojo».']);
  assert.equal(derivado.nombre, 'Rojo');
});

test('[EQ-95] la semilla SQL tiene los mismos mensajes y textos que mensajes-ia.json', () => {
  const sql = leer('datos-semilla/05_catalogo_mensajes_semilla.sql');
  assert.match(sql, /mensajes-ia\.json/, 'la semilla SQL sale de mensajes-ia.json');
  const insertados = [...sql.matchAll(/INSERT INTO mensajes\.catalogo_mensaje[^;]*?VALUES \('([a-z0-9_-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(insertados, SEMILLA.map((m) => m.id));
  for (const m of SEMILLA) {
    assert.ok(sql.includes(m.texto.replaceAll("'", "''")), `${m.id}: texto distinto en SQL`);
    assert.equal((sql.match(new RegExp(`catalogo_regla \\(mensaje_id, orden, descripcion\\) VALUES \\('${m.id}'`, 'g')) ?? []).length, m.reglas.length, `${m.id}: reglas`);
  }
  const migracion = leer('docker/postgres/migrations/05_catalogo_mensajes.sql');
  assert.match(migracion, /CREATE TABLE IF NOT EXISTS mensajes\.catalogo_mensaje/);
  assert.doesNotMatch(migracion, /CREATE TABLE mensajes\./, 'idempotente: siempre IF NOT EXISTS');
});

// ---------------------------------------------------------------- Lista (EQ-96)

test('[EQ-96] lista ENVIO por defecto, en orden, con la forma que usa la pantalla de Mensajes', async () => {
  const { listarMensajes } = crearModuloCatalogoMensajes();
  const r = await listarMensajes.ejecutar({ tamano: 50 });
  assert.equal(r.categoria, 'ENVIO');
  assert.deepEqual(r.categorias, { ENVIO: ids('ENVIO').length, RESPUESTA: ids('RESPUESTA').length });
  assert.equal(r.totalGeneral, CRUDA.length);
  assert.deepEqual(r.datos.map((m) => m.id), ids('ENVIO'));
  for (const m of r.datos) {
    const original = CRUDA.find((x) => x.id === m.id);
    assert.deepEqual(m.llaves, original.llaves);
    assert.equal(m.mensaje, original.mensaje);
    assert.equal('reglas' in m, false, 'las reglas solo van en el detalle');
  }
});

test('[EQ-96] RESPUESTA incluye las FAQ con su pregunta', async () => {
  const { listarMensajes } = crearModuloCatalogoMensajes();
  const r = await listarMensajes.ejecutar({ categoria: 'respuesta', tamano: 50 });
  assert.equal(r.categoria, 'RESPUESTA');
  assert.deepEqual(r.datos.map((m) => m.id), ids('RESPUESTA'));
  assert.deepEqual(r.datos.filter((m) => m.pregunta).map((m) => m.id), ids('RESPUESTA', tieneLlave('FAQ')));
});

test('[EQ-96] filtros por semáforo (sin acentos ni mayúsculas) y búsqueda', async () => {
  const { listarMensajes } = crearModuloCatalogoMensajes();
  const rojo = await listarMensajes.ejecutar({ categoria: 'ENVIO', semaforo: 'ROJO', tamano: 50 });
  assert.ok(rojo.datos.length > 0);
  assert.deepEqual(rojo.datos.map((m) => m.id), ids('ENVIO', tieneLlave('Semáforo', 'Rojo')));
  const naranja = await listarMensajes.ejecutar({ semaforo: 'naranja', tamano: 50 });
  assert.deepEqual(naranja.datos.map((m) => m.id), ids('ENVIO', tieneLlave('Semáforo', 'Naranja')));
  const busqueda = await listarMensajes.ejecutar({ categoria: 'RESPUESTA', busqueda: 'CERTIFICADO', tamano: 50 });
  const esperados = SEMILLA.filter((m) => m.categoria === 'RESPUESTA' && /certificado/i.test([m.nombre, m.pregunta, m.texto].join(' '))).map((m) => m.id);
  assert.ok(esperados.length > 0);
  assert.deepEqual(busqueda.datos.map((m) => m.id), esperados);
});

test('[EQ-96] paginación acotada y categoría inválida', async () => {
  const { listarMensajes } = crearModuloCatalogoMensajes();
  const total = ids('ENVIO').length;
  const p3 = await listarMensajes.ejecutar({ tamano: 4, pagina: 3 });
  assert.deepEqual([p3.pagina, p3.tamano, p3.totalPaginas, p3.datos.length], [3, 4, Math.ceil(total / 4), Math.max(0, Math.min(4, total - 8))]);
  const raros = await listarMensajes.ejecutar({ tamano: '999', pagina: '-4' });
  assert.deepEqual([raros.pagina, raros.tamano], [1, 50]);
  const texto = await listarMensajes.ejecutar({ tamano: 'abc', pagina: 'xyz' });
  assert.deepEqual([texto.pagina, texto.tamano], [1, 10]);
  assert.equal((await listarMensajes.ejecutar({ pagina: 99 })).datos.length, 0, 'página fuera de rango: lista vacía');
  await assert.rejects(listarMensajes.ejecutar({ categoria: 'BORRAR' }), rechaza(400, 'CATEGORIA_INVALIDA'));
});

// ---------------------------------------------------------------- Detalle (EQ-97)

test('[EQ-97] detalle con reglas, variables descritas y vista previa', async () => {
  const { obtenerDetalleMensaje } = crearModuloCatalogoMensajes();
  const { mensaje } = await obtenerDetalleMensaje.ejecutar({ id: 'env-004' });
  assert.equal(mensaje.soloLectura, true);
  assert.deepEqual(mensaje.variables, [
    { nombre: 'aspirante', descripcion: 'Nombre del aspirante' },
    { nombre: 'valor', descripcion: 'Cantidad de tiempo sin actividad' },
    { nombre: 'magnitud', descripcion: 'Unidad de ese tiempo (días, semanas…)' },
  ]);
  assert.deepEqual(mensaje.reglas, porId['env-004'].reglas);
  assert.equal(mensaje.plantillaMeta, null);
  assert.match(mensaje.vistaPrevia.texto, /^¡Hola Ana! Han pasado 3 días desde/);
  assert.doesNotMatch(mensaje.vistaPrevia.texto, /\{/);
});

test('[EQ-97] la vista previa acepta valores propios; las FAQ no tienen variables', async () => {
  const { obtenerDetalleMensaje } = crearModuloCatalogoMensajes();
  const { mensaje } = await obtenerDetalleMensaje.ejecutar({ id: 'env-004', valores: { aspirante: 'Lupita', valor: '2', magnitud: 'semanas' } });
  assert.match(mensaje.vistaPrevia.texto, /^¡Hola Lupita! Han pasado 2 semanas desde/);
  const faq = (await obtenerDetalleMensaje.ejecutar({ id: 'res-001', valores: { aspirante: 'Lupita' } })).mensaje;
  assert.deepEqual(faq.variables, []);
  assert.deepEqual(faq.vistaPrevia.valores, {});
  assert.equal(faq.vistaPrevia.texto, faq.mensaje);
});

test('[EQ-97] 400 con id raro, 404 si no existe y 400 si el valor es muy largo', async () => {
  const { obtenerDetalleMensaje } = crearModuloCatalogoMensajes();
  await assert.rejects(obtenerDetalleMensaje.ejecutar({ id: '../etc' }), rechaza(400, 'ID_INVALIDO'));
  await assert.rejects(obtenerDetalleMensaje.ejecutar({ id: 'no-existe' }), rechaza(404, 'NO_ENCONTRADO'));
  await assert.rejects(obtenerDetalleMensaje.ejecutar({ id: 'env-001', valores: { aspirante: 'x'.repeat(81) } }), rechaza(400, 'VALOR_DEMASIADO_LARGO'));
});

test('[EQ-97] el detalle nunca modifica el catálogo', async () => {
  const modulo = crearModuloCatalogoMensajes();
  const antes = JSON.stringify(await modulo.repositorio.listar());
  const { mensaje } = await modulo.obtenerDetalleMensaje.ejecutar({ id: 'env-001', valores: { aspirante: 'Lupita' } });
  mensaje.reglas.push('alterada');
  mensaje.llaves[0].valor = 'alterada';
  assert.equal(JSON.stringify(await modulo.repositorio.listar()), antes);
});

// ---------------------------------------------------------------- Adaptadores

test('[EQ-100] el repositorio en memoria rechaza una semilla inválida al arrancar', () => {
  assert.throws(() => new RepositorioCatalogoMemoria({ mensajes: [{ id: 'X mal', categoria: 'ENVIO', llaves: [], mensaje: '' }] }), /Catálogo de mensajes inválido/);
});

test('[EQ-100] el repositorio PostgreSQL cumple el puerto y mapea las filas', async () => {
  const consultas = [];
  const fila = {
    id: 'env-001', categoria: 'ENVIO', nombre: 'Rojo', orden: '4', grupo: null, pregunta: null,
    disparador: 'AUTOMATICO', canal: 'WHATSAPP', requierePlantillaMeta: true, plantillaMetaReferencia: 'EQ-79', plantillaMetaEstado: 'PENDIENTE',
    texto: 'Hola, {aspirante}', variables: ['aspirante'], llaves: '[{"tipo":"Semáforo","valor":"Rojo"}]', reglas: ['r1'],
  };
  const db = { query: async (sql, params) => { consultas.push({ sql, params }); return sql.includes('GROUP BY') ? { rows: [{ categoria: 'ENVIO', total: '4' }] } : { rows: [fila] }; } };
  const repo = new RepositorioCatalogoPostgres({ db });
  for (const metodo of METODOS_REPOSITORIO_CATALOGO) assert.equal(typeof repo[metodo], 'function', metodo);

  const [m] = await repo.listar({ categoria: 'ENVIO' });
  assert.deepEqual(m.plantillaMeta, { referencia: 'EQ-79', estado: 'PENDIENTE' });
  assert.deepEqual(m.llaves, [{ tipo: 'Semáforo', valor: 'Rojo' }]);
  assert.equal(m.orden, 4);
  assert.deepEqual(consultas[0].params, ['ENVIO']);
  assert.match(consultas[0].sql, /FROM mensajes\.catalogo_mensaje m/);
  assert.deepEqual(await repo.contarPorCategoria(), { ENVIO: 4, RESPUESTA: 0 });
  await repo.obtenerPorId('env-001');
  assert.deepEqual(consultas.at(-1).params, ['env-001']);
});

// ---------------------------------------------------------------- Integración HTTP

async function conServidor(ejecutar) {
  const servidor = crearServidor();
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try { await ejecutar(base); } finally { await new Promise((resolve) => servidor.close(resolve)); }
}

async function login(base, identificador, password) {
  const r = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador, password }),
  });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}

test('[EQ-100] HTTP: sin sesión 401; administrador y colaborador consultan lista y detalle', async () => {
  await conServidor(async (base) => {
    assert.equal((await fetch(`${base}/api/v1/mensajes-ia`)).status, 401);
    assert.equal((await fetch(`${base}/api/v1/mensajes-ia/env-001`)).status, 401);
    for (const [id, pw] of [['00000252115', 'Password123!'], ['00000100001', 'AdminPassword2026!']]) {
      const cookie = await login(base, id, pw);
      const lista = await fetch(`${base}/api/v1/mensajes-ia?categoria=RESPUESTA&tamano=50`, { headers: { Cookie: cookie } });
      assert.equal(lista.status, 200, id);
      assert.equal((await lista.json()).totalCategoria, ids('RESPUESTA').length);
      const detalle = await fetch(`${base}/api/v1/mensajes-ia/res-001`, { headers: { Cookie: cookie } });
      assert.equal(detalle.status, 200, id);
      assert.equal((await detalle.json()).mensaje.pregunta, porId['res-001'].pregunta);
    }
  });
});

test('[EQ-100] HTTP: solo lectura (405 en escrituras) y errores con { codigo, mensaje }', async () => {
  await conServidor(async (base) => {
    const cookie = await login(base, '00000100001', 'AdminPassword2026!');
    for (const [metodo, ruta] of [['POST', '/api/v1/mensajes-ia'], ['PUT', '/api/v1/mensajes-ia/env-001'], ['DELETE', '/api/v1/mensajes-ia/env-001'], ['PATCH', '/api/v1/mensajes-ia/env-001']]) {
      const r = await fetch(`${base}${ruta}`, { method: metodo, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(r.status, 405, `${metodo} ${ruta}`);
      assert.equal(r.headers.get('allow'), 'GET');
      assert.equal((await r.json()).codigo, 'SOLO_LECTURA');
    }
    const get = async (ruta) => { const r = await fetch(`${base}${ruta}`, { headers: { Cookie: cookie } }); return [r.status, (await r.json()).codigo]; };
    assert.deepEqual(await get('/api/v1/mensajes-ia/no-existe'), [404, 'NO_ENCONTRADO']);
    assert.deepEqual(await get('/api/v1/mensajes-ia/%E0%A4%A'), [400, 'ID_INVALIDO']);
    assert.deepEqual(await get('/api/v1/mensajes-ia?categoria=OTRA'), [400, 'CATEGORIA_INVALIDA']);
    assert.deepEqual(await get(`/api/v1/mensajes-ia/env-001?aspirante=${'x'.repeat(81)}`), [400, 'VALOR_DEMASIADO_LARGO']);
  });
});
