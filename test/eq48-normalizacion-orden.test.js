/**
 * EQ-48 · HU3-9: pruebas unitarias de normalización y orden.
 *   - Normalización de texto (acentos, mayúsculas, espacios, valores vacíos).
 *   - Búsqueda insensible a acentos y mayúsculas.
 *   - Orden de la lista: semáforo por severidad, fechas, texto sin acentos, nulos al final
 *     y desempate estable (la paginación no repite ni pierde aspirantes).
 *   - Orden del expediente: historial (reciente → antiguo) y chat (antiguo → reciente).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTexto, RepositorioMonitoreoMemoria } from '../src/modulos/monitoreo/infraestructura/repositorio-monitoreo-memoria.js';
import { ObtenerConversacionCasoUso } from '../src/modulos/monitoreo/aplicacion/obtener-conversacion.caso-uso.js';
import { ObtenerHistorialAspiranteCasoUso } from '../src/modulos/monitoreo/aplicacion/obtener-historial-aspirante.caso-uso.js';
import { textoActividad } from '../src/modulos/monitoreo/textos.js';
import { normalizarBusqueda } from '../src/modulos/colaboradores/aplicacion/listar-colaboradores.caso-uso.js';

const COLABORADOR = '00000252115'; // alias colab-001

function asp(id, extra = {}) {
  return {
    id, folioSolicitud: `F-${id}`, nombreCompleto: `Aspirante ${id}`, carreraSolicitada: 'Ingeniería en Software',
    preparatoriaProcedencia: 'CBTIS 37', periodo: '2027-1', estadoSolicitud: 'RECIBIDA', semaforo: 'VERDE',
    fechaSolicitud: '2026-10-01T00:00:00Z', colaboradorId: 'colab-001', ...extra,
  };
}

const listar = (repo, extra = {}) => repo.listarAspirantes({ colaboradorId: COLABORADOR, limit: 100, offset: 0, ...extra });
const ids = (r) => r.aspirantes.map((a) => a.id);

// ---------------------------------------------------------------- Normalización

test('[EQ-48] normalizarTexto quita acentos y diéresis, baja a minúsculas y recorta espacios', () => {
  assert.equal(normalizarTexto('  JOSÉ Pérez  '), 'jose perez');
  assert.equal(normalizarTexto('Güémez'), 'guemez');
  assert.equal(normalizarTexto('Ingeniería en Software'), 'ingenieria en software');
  assert.equal(normalizarTexto('PEÑA'), 'pena', 'igual que unaccent() de PostgreSQL');
});

test('[EQ-48] normalizarTexto tolera valores vacíos y no texto', () => {
  assert.equal(normalizarTexto(null), '');
  assert.equal(normalizarTexto(undefined), '');
  assert.equal(normalizarTexto(''), '');
  assert.equal(normalizarTexto(2027), '2027');
});

test('[EQ-48] la búsqueda de colaboradores normaliza igual que la de aspirantes', () => {
  for (const texto of ['Álvarez', '  MARÍA  ', 'Ñuñez', null]) {
    assert.equal(normalizarBusqueda(texto), normalizarTexto(texto), String(texto));
  }
});

test('[EQ-48] la búsqueda por nombre o folio ignora acentos y mayúsculas', async () => {
  const repo = new RepositorioMonitoreoMemoria({
    aspirantes: [
      asp('a1', { nombreCompleto: 'José Pérez Núñez' }),
      asp('a2', { nombreCompleto: 'Jose Ramírez' }),
      asp('a3', { nombreCompleto: 'María López', folioSolicitud: 'FOL-2026-0042' }),
    ],
  });
  assert.deepEqual(ids(await listar(repo, { nombre: 'JOSE' })).sort(), ['a1', 'a2']);
  assert.deepEqual(ids(await listar(repo, { nombre: 'perez nu' })), ['a1']);
  assert.deepEqual(ids(await listar(repo, { nombre: 'fol-2026-0042' })), ['a3']);
  assert.deepEqual(ids(await listar(repo, { nombre: 'zzz' })), []);
});

test('[EQ-48] los filtros de semáforo y estado no dependen de mayúsculas ni guiones bajos', async () => {
  const repo = new RepositorioMonitoreoMemoria({
    aspirantes: [asp('a1', { semaforo: 'ROJO', estadoSolicitud: 'EN_REVISION' }), asp('a2')],
  });
  assert.deepEqual(ids(await listar(repo, { semaforo: 'rojo' })), ['a1']);
  assert.deepEqual(ids(await listar(repo, { estadoSolicitud: 'en_revision' })), ['a1']);
  assert.deepEqual(ids(await listar(repo, { estadoSolicitud: 'enrevision' })), ['a1']);
});

// ---------------------------------------------------------------- Orden de la lista

const SEMAFOROS = [asp('v', { semaforo: 'VERDE' }), asp('r', { semaforo: 'ROJO' }), asp('n', { semaforo: 'NARANJA' }), asp('a', { semaforo: 'AMARILLO' })];

test('[EQ-48] ordenar por semáforo usa la severidad, no el abecedario', async () => {
  const repo = new RepositorioMonitoreoMemoria({ aspirantes: SEMAFOROS });
  assert.deepEqual(ids(await listar(repo, { ordenarPor: 'semaforo', ordenDireccion: 'DESC' })), ['r', 'n', 'a', 'v']);
  assert.deepEqual(ids(await listar(repo, { ordenarPor: 'semaforo', ordenDireccion: 'ASC' })), ['v', 'a', 'n', 'r']);
});

test('[EQ-48] ordenar por nombre ignora acentos (Álvaro va antes que Beto)', async () => {
  const repo = new RepositorioMonitoreoMemoria({
    aspirantes: [asp('b', { nombreCompleto: 'Beto' }), asp('a', { nombreCompleto: 'Álvaro' }), asp('c', { nombreCompleto: 'carla' })],
  });
  assert.deepEqual(ids(await listar(repo, { ordenarPor: 'nombre', ordenDireccion: 'ASC' })), ['a', 'b', 'c']);
  assert.deepEqual(ids(await listar(repo, { ordenarPor: 'nombre', ordenDireccion: 'DESC' })), ['c', 'b', 'a']);
});

test('[EQ-48] las fechas se ordenan por instante, aunque tengan zona horaria distinta', async () => {
  const repo = new RepositorioMonitoreoMemoria({
    aspirantes: [
      asp('tarde', { fechaSolicitud: '2026-10-01T20:00:00-07:00' }), // 2026-10-02T03:00Z
      asp('temprano', { fechaSolicitud: '2026-10-02T01:00:00Z' }),
    ],
  });
  assert.deepEqual(ids(await listar(repo, { ordenarPor: 'fecha_solicitud', ordenDireccion: 'ASC' })), ['temprano', 'tarde']);
});

test('[EQ-48] los valores vacíos van al final en ambas direcciones', async () => {
  const repo = new RepositorioMonitoreoMemoria({
    aspirantes: [asp('sin', { preparatoriaProcedencia: null }), asp('b', { preparatoriaProcedencia: 'COBACH' }), asp('a', { preparatoriaProcedencia: 'CBTIS' })],
  });
  assert.deepEqual(ids(await listar(repo, { ordenarPor: 'preparatoria', ordenDireccion: 'ASC' })), ['a', 'b', 'sin']);
  assert.deepEqual(ids(await listar(repo, { ordenarPor: 'preparatoria', ordenDireccion: 'DESC' })), ['b', 'a', 'sin']);
});

test('[EQ-48] con empates el orden es estable: paginar no repite ni pierde aspirantes', async () => {
  // 25 aspirantes con el mismo semáforo y la misma fecha: todo es empate.
  const aspirantes = Array.from({ length: 25 }, (_, i) => asp(`x${String(25 - i).padStart(2, '0')}`, { semaforo: 'ROJO' }));
  const repo = new RepositorioMonitoreoMemoria({ aspirantes });
  const vistos = [];
  for (let offset = 0; offset < 25; offset += 10) {
    const pagina = await repo.listarAspirantes({ colaboradorId: COLABORADOR, ordenarPor: 'semaforo', ordenDireccion: 'DESC', limit: 10, offset });
    vistos.push(...ids(pagina));
  }
  assert.equal(vistos.length, 25);
  assert.equal(new Set(vistos).size, 25);
  assert.deepEqual(vistos, [...vistos].sort(), 'el desempate es por id');
});

test('[EQ-48] una columna desconocida cae en fecha de solicitud (no rompe la consulta)', async () => {
  const repo = new RepositorioMonitoreoMemoria({
    aspirantes: [asp('viejo', { fechaSolicitud: '2026-09-01T00:00:00Z' }), asp('nuevo', { fechaSolicitud: '2026-10-01T00:00:00Z' })],
  });
  assert.deepEqual(ids(await listar(repo, { ordenarPor: 'columna_inventada', ordenDireccion: 'DESC' })), ['nuevo', 'viejo']);
});

// ---------------------------------------------------------------- Orden del expediente

function repoExpediente() {
  return new RepositorioMonitoreoMemoria({
    aspirantes: [asp('a1')],
    conversaciones: [
      { id: 'm3', aspiranteId: 'a1', contenido: 'tercero', fechaEnvio: '2026-10-03T00:00:00Z' },
      { id: 'm1b', aspiranteId: 'a1', contenido: 'mismo instante (b)', fechaEnvio: '2026-10-01T00:00:00Z' },
      { id: 'm1a', aspiranteId: 'a1', contenido: 'mismo instante (a)', fechaEnvio: '2026-10-01T00:00:00Z' },
      { id: 'm2', aspiranteId: 'a1', contenido: 'segundo', fechaEnvio: '2026-10-02T00:00:00Z' },
    ],
    historial: [
      { id: 'h1', aspiranteId: 'a1', tipoEvento: 'CAMBIO_ESTADO', titulo: 'uno', fechaEvento: '2026-10-01T00:00:00Z' },
      { id: 'h3', aspiranteId: 'a1', tipoEvento: 'CAMBIO_ESTADO', titulo: 'tres', fechaEvento: '2026-10-03T00:00:00Z' },
      { id: 'h2b', aspiranteId: 'a1', tipoEvento: 'CAMBIO_ESTADO', titulo: 'dos b', fechaEvento: '2026-10-02T00:00:00Z' },
      { id: 'h2a', aspiranteId: 'a1', tipoEvento: 'CAMBIO_ESTADO', titulo: 'dos a', fechaEvento: '2026-10-02T00:00:00Z' },
    ],
  });
}

test('[EQ-48] el chat va del más antiguo al más reciente y desempata por id ascendente', async () => {
  const casoUso = new ObtenerConversacionCasoUso({ repositorioMonitoreo: repoExpediente() });
  const { mensajes } = await casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: 'a1' });
  assert.deepEqual(mensajes.map((m) => m.id), ['m1a', 'm1b', 'm2', 'm3']);
});

test('[EQ-48] el historial va del más reciente al más antiguo y desempata por id descendente', async () => {
  const casoUso = new ObtenerHistorialAspiranteCasoUso({ repositorioMonitoreo: repoExpediente() });
  const { actividades } = await casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: 'a1' });
  assert.deepEqual(actividades.map((a) => a.id), ['h3', 'h2b', 'h2a', 'h1']);
  assert.ok(actividades.every((a) => a.fecha.endsWith('.000Z')), 'fechas normalizadas a ISO UTC');
});

test('[EQ-48] el motivo de rechazo se normaliza: sin punto final duplicado ni espacios', () => {
  assert.equal(
    textoActividad({ tipo: 'RECHAZO', objeto: 'constancia', motivo: 'el promedio no es legible.  ' }),
    'La constancia de calificaciones fue rechazada por Registro Escolar debido a que el promedio no es legible.',
  );
  assert.equal(
    textoActividad({ tipo: 'RECHAZO', objeto: 'solicitud', motivo: '   ' }),
    'La solicitud fue rechazada por Registro Escolar.',
  );
});
