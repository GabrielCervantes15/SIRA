/**
 * Funciones puras del frontend:
 *   EQ-36 (expediente en la URL), EQ-64 (paso 3) y EQ-71 (listado).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aspiranteDesdeUrl, urlConAspirante } from '../frontend/js/expediente-url.js';
import {
  puedeIrARevision, puedeConfirmar, describirCambioCarga, etiquetaCampus, paginar,
} from '../frontend/colaboradores/validaciones.js';

test('[EQ-36] lee el aspirante de la URL y descarta valores raros', () => {
  assert.equal(aspiranteDesdeUrl('http://localhost:3000/app?aspirante=asp-001'), 'asp-001');
  assert.equal(aspiranteDesdeUrl('/app?x=1&aspirante=FOL-2026.9_1'), 'FOL-2026.9_1');
  assert.equal(aspiranteDesdeUrl('/app'), null);
  assert.equal(aspiranteDesdeUrl('/app?aspirante='), null);
  assert.equal(aspiranteDesdeUrl('/app?aspirante=%3Cscript%3E'), null);
  assert.equal(aspiranteDesdeUrl(`/app?aspirante=${'a'.repeat(51)}`), null);
});

test('[EQ-36] pone y quita el aspirante sin tocar otros parámetros ni el hash', () => {
  assert.equal(urlConAspirante('http://localhost:3000/app?vista=chat#tabla', 'asp-007'), '/app?vista=chat&aspirante=asp-007#tabla');
  assert.equal(urlConAspirante('/app?aspirante=asp-007&vista=chat', 'asp-009'), '/app?aspirante=asp-009&vista=chat');
  assert.equal(urlConAspirante('/app?aspirante=asp-007', null), '/app');
});

test('[EQ-64] solo se pasa a la revisión con distribución manual y carreras válidas', () => {
  const disponibles = ['Software', 'Industrial'];
  assert.equal(puedeIrARevision({ carreras: ['Software'], disponibles }), true);
  assert.equal(puedeIrARevision({ carreras: ['Software'], disponibles, manual: false }), false);
  assert.equal(puedeIrARevision({ carreras: [], disponibles }), false);
  assert.equal(puedeIrARevision({ carreras: ['Otra'], disponibles }), false);
});

test('[EQ-64] solo se confirma exactamente lo que se revisó', () => {
  const vistaPrevia = { colaborador: { idInstitucional: '00000300001' }, campus: 'Campus Navojoa', carreras: [{ carrera: 'B' }, { carrera: 'A' }] };
  const base = { vistaPrevia, idInstitucional: '00000300001', campus: 'Campus Navojoa', carreras: ['A', 'B'] };
  assert.equal(puedeConfirmar(base), true);
  assert.equal(puedeConfirmar({ ...base, carreras: ['A', 'B', 'B'] }), true, 'duplicados no cuentan');
  assert.equal(puedeConfirmar({ ...base, carreras: ['A'] }), false, 'quitó una carrera después de revisar');
  assert.equal(puedeConfirmar({ ...base, campus: 'Campus Guaymas' }), false);
  assert.equal(puedeConfirmar({ ...base, idInstitucional: '00000300002' }), false);
  assert.equal(puedeConfirmar({ ...base, vistaPrevia: null }), false);
});

test('[EQ-64] describe el cambio de carga', () => {
  assert.equal(describirCambioCarga({ antes: 0, despues: 18 }), '+18');
  assert.equal(describirCambioCarga({ antes: 40, despues: 37 }), '−3');
  assert.equal(describirCambioCarga({ antes: 5, despues: 5 }), 'sin cambio');
});

test('[EQ-71] etiqueta corta del campus y paginación acotada', () => {
  assert.equal(etiquetaCampus('Campus Obregón Náinari'), 'Obregón Náinari');
  assert.equal(etiquetaCampus('Navojoa'), 'Navojoa');
  assert.equal(etiquetaCampus(null), '');

  const lista = Array.from({ length: 20 }, (_, i) => i);
  assert.deepEqual(paginar(lista, 0, 9).visibles, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(paginar(lista, 2, 9), { visibles: [18, 19], pagina: 2, paginas: 3, inicio: 18 });
  assert.equal(paginar(lista, 99, 9).pagina, 2, 'una página fuera de rango se ajusta a la última');
  assert.equal(paginar(lista, -1, 9).pagina, 0);
  assert.deepEqual(paginar([], 0, 9), { visibles: [], pagina: 0, paginas: 1, inicio: 0 });
});

test('[EQ-71] iniciales del encabezado compartido', async () => {
  const { inicialesUsuario } = await import('../frontend/js/usuario.js');
  assert.equal(inicialesUsuario('Sebastián Bórquez Huerta'), 'SB');
  assert.equal(inicialesUsuario('Mtra. Alma Leticia Chávez Quintero'), 'AL', 'ignora el título');
  assert.equal(inicialesUsuario(''), '?');
});

// ---------- HU6-18 · HU7: baja de colaborador ----------
import {
  describirPeriodoBaja, errorDuracionBaja, puedeDarDeBaja, formatearFecha,
} from '../frontend/colaboradores/validaciones.js';

test('[HU6-18] describe el periodo de baja para la tarjeta', () => {
  assert.equal(describirPeriodoBaja(null), 'Indefinido');
  assert.equal(describirPeriodoBaja({ indefinido: true }), 'Indefinido');
  assert.equal(describirPeriodoBaja({ indefinido: false, desde: '2026-11-26', hasta: '2027-01-15' }), '26/11/2026 – 15/01/2027');
  assert.equal(formatearFecha('basura'), '');
});

test('[HU6-18] valida la duración de la baja', () => {
  const hoy = '2026-11-26';
  assert.equal(errorDuracionBaja({ tipo: 'indefinido' }, hoy), null);
  assert.match(errorDuracionBaja({ tipo: 'periodo', inicio: '2026-12-01' }, hoy), /inicio y la de fin/);
  assert.match(errorDuracionBaja({ tipo: 'periodo', inicio: '2026-12-05', fin: '2026-12-01' }, hoy), /anterior/);
  assert.match(errorDuracionBaja({ tipo: 'periodo', inicio: '2026-01-01', fin: '2026-02-01' }, hoy), /ya terminó/);
  assert.equal(errorDuracionBaja({ tipo: 'periodo', inicio: '2026-11-26', fin: '2027-01-15' }, hoy), null);
});

test('[HU6-18] solo se da de baja con vista previa cargada y duración válida', () => {
  const vistaPrevia = { colaborador: { idInstitucional: '00000252115' } };
  const base = { vistaPrevia, duracion: { tipo: 'indefinido' }, hoy: '2026-11-26' };
  assert.equal(puedeDarDeBaja(base), true);
  assert.equal(puedeDarDeBaja({ ...base, vistaPrevia: null }), false, 'baja bloqueada (p. ej. sin relevo)');
  assert.equal(puedeDarDeBaja({ ...base, enviando: true }), false);
  assert.equal(puedeDarDeBaja({ ...base, duracion: { tipo: 'periodo', inicio: '', fin: '' } }), false);
});
