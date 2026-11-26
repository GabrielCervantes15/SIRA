/** HU6-18 / HU7: algoritmo de reasignación por baja (función pura). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularReasignacionBaja } from '../src/modulos/distribucion-carreras/reasignacion-baja.js';

const col = (id, campus, extra = {}) => ({ idInstitucional: id, campus, estado: 'activo', carreras: [], fechaRegistro: '2026-01-01T00:00:00Z', ...extra });
const OBR = 'Campus Obregón';

test('reparte por menor carga proyectada, carreras completas, de mayor a menor', () => {
  const r = calcularReasignacionBaja({
    saliente: col('S', OBR),
    colaboradores: [col('S', OBR), col('A', OBR), col('B', OBR)],
    cartera: [
      { campus: OBR, carrera: 'Software', aspirantes: 78 },
      { campus: OBR, carrera: 'Industrial', aspirantes: 44 },
      { campus: OBR, carrera: 'Contaduría', aspirantes: 40 },
    ],
    cargas: { A: 100, B: 100 },
  });
  // Software→A (empate: id menor); Industrial→B; Contaduría→B (140 < 178)… B queda 184, A 178.
  assert.deepEqual(r.asignaciones.map((a) => [a.carrera, a.colaboradorId]),
    [['Software', 'A'], ['Industrial', 'B'], ['Contaduría', 'B']]);
  assert.equal(r.totalAspirantes, 162);
  assert.deepEqual(r.zonasSinRelevo, []);
  const b = r.receptores.find((x) => x.colaboradorId === 'B');
  assert.equal(b.nuevosAspirantes, 84);
  assert.equal(b.despues, 184);
});

test('nunca asigna a otro campus, a inactivos ni al que se va', () => {
  const r = calcularReasignacionBaja({
    saliente: col('S', OBR),
    colaboradores: [col('S', OBR), col('I', OBR, { estado: 'inactivo' }), col('N', 'Campus Navojoa'), col('A', OBR)],
    cartera: [{ campus: OBR, carrera: 'Software', aspirantes: 10 }],
    cargas: { A: 999, N: 0, I: 0 },
  });
  assert.deepEqual(r.asignaciones.map((a) => a.colaboradorId), ['A']);
});

test('sin relevo en el campus: reporta la zona y no asigna esa unidad', () => {
  const r = calcularReasignacionBaja({
    saliente: col('S', OBR),
    colaboradores: [col('S', OBR), col('N', 'Campus Navojoa')],
    cartera: [{ campus: OBR, carrera: 'Software', aspirantes: 10 }],
  });
  assert.deepEqual(r.zonasSinRelevo, [OBR]);
  assert.equal(r.asignaciones.length, 0);
});

test('un expediente de otro campus regresa a un colaborador de ese campus', () => {
  const r = calcularReasignacionBaja({
    saliente: col('S', OBR),
    colaboradores: [col('S', OBR), col('A', OBR), col('N', 'Campus Navojoa')],
    cartera: [
      { campus: OBR, carrera: 'Software', aspirantes: 5 },
      { campus: 'Campus Navojoa', carrera: 'Software', aspirantes: 3 },
    ],
  });
  const por = Object.fromEntries(r.asignaciones.map((a) => [a.campus, a.colaboradorId]));
  assert.deepEqual(por, { [OBR]: 'A', 'Campus Navojoa': 'N' });
});

test('carreras sin aspirantes también se entregan; desempates: atiende la carrera, antigüedad, id', () => {
  const r = calcularReasignacionBaja({
    saliente: col('S', OBR, { carreras: ['Vacía'] }),
    colaboradores: [col('S', OBR), col('A', OBR, { fechaRegistro: '2026-05-01T00:00:00Z' }), col('B', OBR, { carreras: ['Vacía'], fechaRegistro: '2026-06-01T00:00:00Z' })],
    cartera: [],
  });
  assert.deepEqual(r.asignaciones, [{ campus: OBR, carrera: 'Vacía', aspirantes: 0, colaboradorId: 'B' }]);
});

test('es determinista y no modifica la entrada', () => {
  const entrada = {
    saliente: col('S', OBR),
    colaboradores: [col('S', OBR), col('A', OBR), col('B', OBR)],
    cartera: [{ campus: OBR, carrera: 'X', aspirantes: 3 }, { campus: OBR, carrera: 'Y', aspirantes: 3 }],
  };
  const copia = structuredClone(entrada);
  assert.deepEqual(calcularReasignacionBaja(entrada), calcularReasignacionBaja(entrada));
  assert.deepEqual(entrada, copia);
});

test('valida entradas', () => {
  assert.throws(() => calcularReasignacionBaja({}), TypeError);
  assert.throws(() => calcularReasignacionBaja({ saliente: col('S', OBR), colaboradores: [], cartera: [{ campus: OBR, carrera: 'X', aspirantes: -1 }] }), RangeError);
});
