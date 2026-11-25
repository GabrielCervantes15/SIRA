/**
 * EQ-100 · HU8-8: pruebas unitarias y de integración del catálogo de mensajes.
 *   - Dominio (EQ-95): variables, vista previa, validación y semilla aprobada en EQ-93.
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
} from '../src/modulos/mensajes-ia/index.js';
import { crearServidor } from '../src/servidor.js';

const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');
const SEMILLA = JSON.parse(leer('datos-semilla/catalogo-mensajes.json')).mensajes;
const porId = Object.fromEntries(SEMILLA.map((m) => [m.id, m]));
const rechaza = (status, codigo) => (e) => e.status === status && e.codigo === codigo;

// ---------------------------------------------------------------- Dominio (EQ-95)

test('[EQ-95] variablesDeTexto encuentra cada variable una sola vez, con o sin espacios', () => {
  assert.deepEqual(variablesDeTexto('Hola {{nombre}}, {{ carrera }} y otra vez {{nombre}}'), ['nombre', 'carrera']);
  assert.deepEqual(variablesDeTexto('Sin variables'), []);
  assert.deepEqual(variablesDeTexto(null), []);
});

test('[EQ-95] renderizarPlantilla sustituye todo y falla si falta un valor (nunca sale «{{nombre}}»)', () => {
  assert.equal(renderizarPlantilla('Hola, {{nombre}}. {{carrera}}.', { nombre: ' Ana ', carrera: 'Software' }), 'Hola, Ana. Software.');
  assert.throws(() => renderizarPlantilla('Hola, {{nombre}}', { nombre: '  ' }), rechaza(400, 'VARIABLE_FALTANTE'));
  assert.throws(() => renderizarPlantilla('Hola, {{nombre}}', {}), rechaza(400, 'VARIABLE_FALTANTE'));
  assert.equal(renderizarPlantilla('Texto fijo', {}), 'Texto fijo');
});

test('[EQ-95] valoresVistaPrevia usa ejemplos, limpia lo que manda el usuario y limita a 80 caracteres', () => {
  assert.deepEqual(valoresVistaPrevia(), VALORES_EJEMPLO);
  assert.deepEqual(valoresVistaPrevia({ nombre: '  Lupita\n', carrera: '' }), { nombre: 'Lupita', carrera: VALORES_EJEMPLO.carrera });
  assert.equal(valoresVistaPrevia({ nombre: 'a'.repeat(80) }).nombre.length, 80);
  assert.throws(() => valoresVistaPrevia({ nombre: 'a'.repeat(81) }), rechaza(400, 'VALOR_DEMASIADO_LARGO'));
  assert.equal(valoresVistaPrevia({ otra: 'x' }).otra, undefined, 'ignora variables desconocidas');
});

test('[EQ-95] validarMensaje detecta mensajes mal formados', () => {
  const base = { ...porId.saludo_inicial };
  assert.deepEqual(validarMensaje(base), []);
  const casos = [
    [{ variables: ['nombre'] }, /variables declaradas/],
    [{ texto: 'Hola {{apodo}}', variables: ['apodo'] }, /variable desconocida/],
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

test('[EQ-95] la semilla es válida y es exactamente el catálogo aprobado en EQ-93', () => {
  assert.deepEqual(validarCatalogo(SEMILLA), []);
  assert.deepEqual(SEMILLA.filter((m) => m.categoria === 'ENVIO').map((m) => m.id),
    ['saludo_inicial', 'contacto_iniciado_colaborador', 'recordatorio_documentacion', 'reactivacion_hu1']);
  assert.deepEqual(SEMILLA.filter((m) => m.categoria === 'RESPUESTA').map((m) => m.id),
    ['faq_documentos', 'faq_examen', 'faq_validacion', 'aviso_fuera_horario']);

  // Los textos deben ser literalmente los del documento aprobado por el PO.
  const decision = leer('docs/decisiones/HU8-catalogo-mensajes.md');
  for (const m of SEMILLA) {
    for (const parrafo of m.texto.split('\n\n')) {
      assert.ok(decision.includes(parrafo), `${m.id}: el texto no coincide con EQ-93`);
    }
    if (m.pregunta) assert.ok(decision.includes(m.pregunta), `${m.id}: pregunta no aprobada`);
  }
  assert.equal(porId.reactivacion_hu1.plantillaMeta.referencia, 'EQ-79');
  assert.equal(porId.contacto_iniciado_colaborador.disparador, 'MANUAL', 'el colaborador decide si lo envía');
  assert.equal(porId.aviso_fuera_horario.categoria, 'RESPUESTA');
});

test('[EQ-95] la semilla SQL tiene los mismos mensajes y textos que la semilla JSON', () => {
  const sql = leer('datos-semilla/05_catalogo_mensajes_semilla.sql');
  const insertados = [...sql.matchAll(/INSERT INTO mensajes\.catalogo_mensaje[^;]*?VALUES \('([a-z0-9_]+)'/g)].map((m) => m[1]);
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

test('[EQ-96] lista ENVIO por defecto, en orden, con la forma que usa la pantalla de EQ-98/99', async () => {
  const { listarMensajes } = crearModuloCatalogoMensajes();
  const r = await listarMensajes.ejecutar({});
  assert.equal(r.categoria, 'ENVIO');
  assert.deepEqual(r.categorias, { ENVIO: 4, RESPUESTA: 4 });
  assert.equal(r.totalGeneral, 8);
  assert.equal(r.totalCategoria, 4);
  assert.deepEqual(r.datos.map((m) => m.id), ['saludo_inicial', 'contacto_iniciado_colaborador', 'recordatorio_documentacion', 'reactivacion_hu1']);
  for (const m of r.datos) {
    assert.ok(Array.isArray(m.llaves) && m.llaves.length > 0, 'llaves');
    assert.equal(typeof m.mensaje, 'string', 'mensaje');
    assert.equal('reglas' in m, false, 'las reglas solo van en el detalle');
  }
});

test('[EQ-96] RESPUESTA incluye las tres FAQ con su pregunta y el aviso fuera de horario', async () => {
  const { listarMensajes } = crearModuloCatalogoMensajes();
  const r = await listarMensajes.ejecutar({ categoria: 'respuesta' });
  assert.equal(r.categoria, 'RESPUESTA');
  assert.deepEqual(r.datos.filter((m) => m.grupo === 'faq_admision').map((m) => m.pregunta),
    ['¿Qué documentos necesito?', '¿Tengo que presentar examen de admisión?', '¿Cuánto tarda la validación?']);
  assert.equal(r.datos.at(-1).id, 'aviso_fuera_horario');
});

test('[EQ-96] filtros por semáforo (sin acentos) y búsqueda en nombre, pregunta y texto', async () => {
  const { listarMensajes } = crearModuloCatalogoMensajes();
  const rojo = await listarMensajes.ejecutar({ categoria: 'ENVIO', semaforo: 'ROJO' });
  assert.deepEqual(rojo.datos.map((m) => m.id), ['contacto_iniciado_colaborador', 'reactivacion_hu1']);
  assert.equal((await listarMensajes.ejecutar({ semaforo: 'verde' })).totalCategoria, 0, 'ningún mensaje de envío es para verdes');
  assert.deepEqual((await listarMensajes.ejecutar({ categoria: 'RESPUESTA', busqueda: 'EXAMEN' })).datos.map((m) => m.id), ['faq_examen']);
  assert.deepEqual((await listarMensajes.ejecutar({ busqueda: 'constancia' })).datos.map((m) => m.id), ['recordatorio_documentacion']);
  assert.deepEqual((await listarMensajes.ejecutar({ categoria: 'RESPUESTA', busqueda: 'validacion' })).datos.map((m) => m.id), ['faq_validacion']);
});

test('[EQ-96] paginación acotada y categoría inválida', async () => {
  const { listarMensajes } = crearModuloCatalogoMensajes();
  const p2 = await listarMensajes.ejecutar({ tamano: 3, pagina: 2 });
  assert.deepEqual([p2.pagina, p2.tamano, p2.totalPaginas, p2.datos.length], [2, 3, 2, 1]);
  const raros = await listarMensajes.ejecutar({ tamano: '999', pagina: '-4' });
  assert.deepEqual([raros.pagina, raros.tamano], [1, 50]);
  const texto = await listarMensajes.ejecutar({ tamano: 'abc', pagina: 'xyz' });
  assert.deepEqual([texto.pagina, texto.tamano], [1, 10]);
  assert.equal((await listarMensajes.ejecutar({ pagina: 9 })).datos.length, 0, 'página fuera de rango: lista vacía');
  await assert.rejects(listarMensajes.ejecutar({ categoria: 'BORRAR' }), rechaza(400, 'CATEGORIA_INVALIDA'));
});

// ---------------------------------------------------------------- Detalle (EQ-97)

test('[EQ-97] detalle con reglas, variables descritas, plantilla de Meta y vista previa', async () => {
  const { obtenerDetalleMensaje } = crearModuloCatalogoMensajes();
  const { mensaje } = await obtenerDetalleMensaje.ejecutar({ id: 'reactivacion_hu1' });
  assert.equal(mensaje.soloLectura, true);
  assert.deepEqual(mensaje.variables, [
    { nombre: 'nombre', descripcion: 'Nombre del aspirante' },
    { nombre: 'carrera', descripcion: 'Carrera solicitada por el aspirante' },
  ]);
  assert.deepEqual(mensaje.reglas, porId.reactivacion_hu1.reglas);
  assert.deepEqual(mensaje.plantillaMeta, { referencia: 'EQ-79', estado: 'PENDIENTE' });
  assert.equal(mensaje.vistaPrevia.texto,
    'Hola, Ana. Tu proceso de ingreso a Ingeniería en Software todavía puede continuar. ¿Necesitas ayuda para completar tus siguientes pasos?\n\nResponde a este mensaje y con gusto te orientaremos.');
  assert.doesNotMatch(mensaje.vistaPrevia.texto, /\{\{/);
});

test('[EQ-97] la vista previa acepta nombre y carrera; las FAQ no tienen variables', async () => {
  const { obtenerDetalleMensaje } = crearModuloCatalogoMensajes();
  const { mensaje } = await obtenerDetalleMensaje.ejecutar({ id: 'saludo_inicial', valores: { nombre: 'Lupita', carrera: 'Licenciatura en Psicología' } });
  assert.equal(mensaje.vistaPrevia.texto, '¡Hola, Lupita! Bienvenido(a). Estamos aquí para ayudarte con tu proceso de ingreso a Licenciatura en Psicología. ¿En qué podemos apoyarte?');
  const faq = (await obtenerDetalleMensaje.ejecutar({ id: 'faq_examen', valores: { nombre: 'Lupita' } })).mensaje;
  assert.deepEqual(faq.variables, []);
  assert.deepEqual(faq.vistaPrevia.valores, {});
  assert.equal(faq.vistaPrevia.texto, faq.mensaje);
  assert.equal(faq.plantillaMeta, null);
});

test('[EQ-97] 400 con id raro, 404 si no existe y 400 si el valor es muy largo', async () => {
  const { obtenerDetalleMensaje } = crearModuloCatalogoMensajes();
  await assert.rejects(obtenerDetalleMensaje.ejecutar({ id: '../etc' }), rechaza(400, 'ID_INVALIDO'));
  await assert.rejects(obtenerDetalleMensaje.ejecutar({ id: 'no_existe' }), rechaza(404, 'NO_ENCONTRADO'));
  await assert.rejects(obtenerDetalleMensaje.ejecutar({ id: 'saludo_inicial', valores: { nombre: 'x'.repeat(81) } }), rechaza(400, 'VALOR_DEMASIADO_LARGO'));
});

test('[EQ-97] el detalle nunca modifica el catálogo', async () => {
  const modulo = crearModuloCatalogoMensajes();
  const antes = JSON.stringify(await modulo.repositorio.listar());
  const { mensaje } = await modulo.obtenerDetalleMensaje.ejecutar({ id: 'saludo_inicial', valores: { nombre: 'Lupita' } });
  mensaje.reglas.push('alterada');
  mensaje.llaves[0].valor = 'alterada';
  assert.equal(JSON.stringify(await modulo.repositorio.listar()), antes);
});

// ---------------------------------------------------------------- Adaptadores

test('[EQ-100] el repositorio en memoria rechaza una semilla inválida al arrancar', () => {
  assert.throws(() => new RepositorioCatalogoMemoria({ mensajes: [{ ...porId.saludo_inicial, variables: [] }] }), /Catálogo de mensajes inválido/);
});

test('[EQ-100] el repositorio PostgreSQL cumple el puerto y mapea las filas', async () => {
  const consultas = [];
  const fila = {
    id: 'reactivacion_hu1', categoria: 'ENVIO', nombre: 'Reactivación', orden: '4', grupo: null, pregunta: null,
    disparador: 'LOTE_HU1', canal: 'WHATSAPP', requierePlantillaMeta: true, plantillaMetaReferencia: 'EQ-79', plantillaMetaEstado: 'PENDIENTE',
    texto: 'Hola, {{nombre}}', variables: ['nombre'], llaves: '[{"tipo":"Semáforo","valor":"Rojo"}]', reglas: ['r1'],
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
  await repo.obtenerPorId('reactivacion_hu1');
  assert.deepEqual(consultas.at(-1).params, ['reactivacion_hu1']);
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
    assert.equal((await fetch(`${base}/api/v1/mensajes-ia/saludo_inicial`)).status, 401);
    for (const [id, pw] of [['00000252115', 'Password123!'], ['00000100001', 'AdminPassword2026!']]) {
      const cookie = await login(base, id, pw);
      const lista = await fetch(`${base}/api/v1/mensajes-ia?categoria=RESPUESTA`, { headers: { Cookie: cookie } });
      assert.equal(lista.status, 200, id);
      assert.equal((await lista.json()).totalCategoria, 4);
      const detalle = await fetch(`${base}/api/v1/mensajes-ia/faq_documentos`, { headers: { Cookie: cookie } });
      assert.equal(detalle.status, 200, id);
      assert.equal((await detalle.json()).mensaje.pregunta, '¿Qué documentos necesito?');
    }
  });
});

test('[EQ-100] HTTP: solo lectura (405 en escrituras) y errores con { codigo, mensaje }', async () => {
  await conServidor(async (base) => {
    const cookie = await login(base, '00000100001', 'AdminPassword2026!');
    for (const [metodo, ruta] of [['POST', '/api/v1/mensajes-ia'], ['PUT', '/api/v1/mensajes-ia/saludo_inicial'], ['DELETE', '/api/v1/mensajes-ia/saludo_inicial'], ['PATCH', '/api/v1/mensajes-ia/saludo_inicial']]) {
      const r = await fetch(`${base}${ruta}`, { method: metodo, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(r.status, 405, `${metodo} ${ruta}`);
      assert.equal(r.headers.get('allow'), 'GET');
      assert.equal((await r.json()).codigo, 'SOLO_LECTURA');
    }
    const get = async (ruta) => { const r = await fetch(`${base}${ruta}`, { headers: { Cookie: cookie } }); return [r.status, (await r.json()).codigo]; };
    assert.deepEqual(await get('/api/v1/mensajes-ia/no_existe'), [404, 'NO_ENCONTRADO']);
    assert.deepEqual(await get('/api/v1/mensajes-ia/%E0%A4%A'), [400, 'ID_INVALIDO']);
    assert.deepEqual(await get('/api/v1/mensajes-ia?categoria=OTRA'), [400, 'CATEGORIA_INVALIDA']);
    assert.deepEqual(await get(`/api/v1/mensajes-ia/saludo_inicial?nombre=${'x'.repeat(81)}`), [400, 'VALOR_DEMASIADO_LARGO']);
  });
});
