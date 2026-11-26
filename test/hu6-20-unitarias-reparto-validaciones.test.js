/**
 * [HU6-20] Pruebas unitarias: algoritmo de reparto y validaciones.
 *
 * Reparto de alta (calcularRepartoInicial): 1 colaborador, varios, carreras desbalanceadas,
 *   carreras compartidas (mismo tamaño / misma carrera en varios campus) e inactivos.
 * Reparto de baja (calcularReasignacionBaja): mismos escenarios, más el caso 6B de
 *   único colaborador del campus.
 * Validaciones: campus, carrera, id, id duplicado y único colaborador del campus.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularRepartoInicial } from '../src/modulos/distribucion-carreras/calculadora.js';
import { calcularReasignacionBaja } from '../src/modulos/distribucion-carreras/reasignacion-baja.js';
import { validarIdInstitucional, validarSolicitudRegistro } from '../src/modulos/colaboradores/dominio/validaciones-registro.js';
import { validarDuracionBaja } from '../src/modulos/colaboradores/dominio/validaciones-baja.js';
import { construirPlanBaja } from '../src/modulos/colaboradores/aplicacion/plan-baja.js';
import { RepositorioColaboradoresMemoria } from '../src/modulos/colaboradores/infraestructura/repositorio-colaboradores-memoria.js';

// ---------- Utilidades ----------
const colAlta = (id, extra = {}) => ({ id, activo: true, fechaRegistro: '2026-01-01T00:00:00Z', ...extra });
const car = (id, aspirantes) => ({ id, aspirantes });
const destinos = (r) => Object.fromEntries(r.asignaciones.map((a) => [a.carreraId, a.colaboradorId]));
const cargas = (r) => Object.fromEntries(r.cargas.map((c) => [c.colaboradorId, c.carga]));

const OBR = 'Campus Obregón';
const NAV = 'Campus Navojoa';
const colBaja = (id, campus, extra = {}) => ({ idInstitucional: id, campus, estado: 'activo', carreras: [], fechaRegistro: '2026-01-01T00:00:00Z', ...extra });
const uBaja = (campus, carrera, aspirantes) => ({ campus, carrera, aspirantes });

const catalogo = {
  contieneCampus: (c) => [OBR, NAV].includes(c),
  contieneCarrera: (campus, carrera) => ({ [OBR]: ['Software', 'Industrial'], [NAV]: ['Software'] })[campus]?.includes(carrera) ?? false,
};
const rechazaCon = (status, codigo) => (e) => e.status === status && e.codigo === codigo;

// ============ Reparto de alta ============

test('[HU6-20] reparto: un solo colaborador recibe todas las carreras', () => {
  const r = calcularRepartoInicial({ colaboradores: [colAlta('A')], carreras: [car('X', 10), car('Y', 3)] });
  assert.deepEqual(destinos(r), { X: 'A', Y: 'A' });
  assert.deepEqual(cargas(r), { A: 13 });
});

test('[HU6-20] reparto: varios colaboradores equilibran la carga', () => {
  const r = calcularRepartoInicial({
    colaboradores: [colAlta('A'), colAlta('B'), colAlta('C')],
    carreras: [car('X', 9), car('Y', 8), car('Z', 7), car('W', 2)],
  });
  assert.equal(r.totalAspirantes, 26);
  const valores = Object.values(cargas(r));
  assert.ok(Math.max(...valores) - Math.min(...valores) <= 2, `diferencia pequeña: ${valores}`);
  assert.equal(r.asignaciones.length, 4, 'ninguna carrera queda sin dueño');
});

test('[HU6-20] reparto: carrera desbalanceada (una enorme) no se parte y las demás compensan', () => {
  const r = calcularRepartoInicial({
    colaboradores: [colAlta('A'), colAlta('B')],
    carreras: [car('Grande', 100), car('P1', 10), car('P2', 10), car('P3', 10)],
  });
  const d = destinos(r);
  assert.equal(d.Grande, 'A', 'la grande se asigna primero');
  assert.deepEqual([d.P1, d.P2, d.P3], ['B', 'B', 'B'], 'las pequeñas van a quien tiene menos');
  assert.deepEqual(cargas(r), { A: 100, B: 30 });
});

test('[HU6-20] reparto: carreras compartidas (mismo tamaño) se reparten por turnos y de forma determinista', () => {
  const entrada = { colaboradores: [colAlta('A'), colAlta('B')], carreras: [car('X', 5), car('Y', 5), car('Z', 5), car('W', 5)] };
  const r = calcularRepartoInicial(entrada);
  assert.deepEqual(cargas(r), { A: 10, B: 10 });
  assert.deepEqual(calcularRepartoInicial(entrada), r, 'mismo resultado en cada corrida');
});

test('[HU6-20] reparto: inactivos no participan y no reciben carga', () => {
  const r = calcularRepartoInicial({
    colaboradores: [colAlta('A'), colAlta('I', { activo: false })],
    carreras: [car('X', 4), car('Y', 4)],
  });
  assert.deepEqual(destinos(r), { X: 'A', Y: 'A' });
  assert.equal(cargas(r).I, undefined);
});

// ============ Reparto de baja ============

test('[HU6-20] baja: un solo colaborador de relevo recibe toda la cartera', () => {
  const r = calcularReasignacionBaja({
    saliente: colBaja('S', OBR),
    colaboradores: [colBaja('S', OBR), colBaja('A', OBR)],
    cartera: [uBaja(OBR, 'Software', 6), uBaja(OBR, 'Industrial', 4)],
    cargas: { A: 10 },
  });
  assert.deepEqual(r.asignaciones.map((a) => a.colaboradorId), ['A', 'A']);
  assert.deepEqual(r.receptores.map((x) => [x.antes, x.despues]), [[10, 20]]);
});

test('[HU6-20] baja: varios colaboradores, la carga final queda pareja', () => {
  const r = calcularReasignacionBaja({
    saliente: colBaja('S', OBR),
    colaboradores: [colBaja('S', OBR), colBaja('A', OBR), colBaja('B', OBR), colBaja('C', OBR)],
    cartera: [uBaja(OBR, 'X', 30), uBaja(OBR, 'Y', 28), uBaja(OBR, 'Z', 25)],
    cargas: { A: 50, B: 50, C: 50 },
  });
  const finales = r.receptores.map((x) => x.despues);
  assert.equal(finales.length, 3, 'cada uno recibe una carrera');
  assert.ok(Math.max(...finales) - Math.min(...finales) <= 5);
});

test('[HU6-20] baja: carrera desbalanceada va a quien tiene menos carga actual', () => {
  const r = calcularReasignacionBaja({
    saliente: colBaja('S', OBR),
    colaboradores: [colBaja('S', OBR), colBaja('A', OBR), colBaja('B', OBR)],
    cartera: [uBaja(OBR, 'Grande', 100), uBaja(OBR, 'Chica', 5)],
    cargas: { A: 80, B: 10 },
  });
  const d = Object.fromEntries(r.asignaciones.map((a) => [a.carrera, a.colaboradorId]));
  assert.equal(d.Grande, 'B', 'B tiene menos carga');
  assert.equal(d.Chica, 'A', 'tras la grande, B ya tiene 110 y A 80');
});

test('[HU6-20] baja: la misma carrera en dos campus son unidades distintas y cada una va a su campus', () => {
  const r = calcularReasignacionBaja({
    saliente: colBaja('S', OBR),
    colaboradores: [colBaja('S', OBR), colBaja('A', OBR), colBaja('N', NAV)],
    cartera: [uBaja(OBR, 'Software', 7), uBaja(NAV, 'Software', 3)],
  });
  assert.equal(r.totalCarreras, 2);
  const porCampus = Object.fromEntries(r.asignaciones.map((a) => [a.campus, a.colaboradorId]));
  assert.deepEqual(porCampus, { [OBR]: 'A', [NAV]: 'N' });
});

test('[HU6-20] baja: carrera compartida, empate de carga lo gana quien ya la atiende', () => {
  const r = calcularReasignacionBaja({
    saliente: colBaja('S', OBR),
    colaboradores: [colBaja('S', OBR), colBaja('A', OBR), colBaja('B', OBR, { carreras: ['Software'] })],
    cartera: [uBaja(OBR, 'Software', 5)],
    cargas: { A: 20, B: 20 },
  });
  assert.equal(r.asignaciones[0].colaboradorId, 'B');
});

test('[HU6-20] baja: inactivos no reciben nada aunque tengan menos carga', () => {
  const r = calcularReasignacionBaja({
    saliente: colBaja('S', OBR),
    colaboradores: [colBaja('S', OBR), colBaja('I', OBR, { estado: 'inactivo' }), colBaja('A', OBR)],
    cartera: [uBaja(OBR, 'Software', 5)],
    cargas: { I: 0, A: 500 },
  });
  assert.deepEqual(r.asignaciones.map((a) => a.colaboradorId), ['A']);
});

// ============ Validaciones ============

test('[HU6-20] validación: id institucional', () => {
  assert.equal(validarIdInstitucional(' 00000252115 '), '00000252115');
  for (const malo of ['', null, undefined, 'abc', '1234', '12345678901234567890123']) {
    assert.throws(() => validarIdInstitucional(malo), rechazaCon(400, 'ID_INVALIDO'), String(malo));
  }
});

test('[HU6-20] validación: campus obligatorio y existente', () => {
  const base = { idInstitucional: '00000252115', carreras: ['Software'] };
  assert.throws(() => validarSolicitudRegistro({ ...base, campus: '' }, catalogo), rechazaCon(400, 'CAMPUS_OBLIGATORIO'));
  assert.throws(() => validarSolicitudRegistro({ ...base, campus: '   ' }, catalogo), rechazaCon(400, 'CAMPUS_OBLIGATORIO'));
  assert.throws(() => validarSolicitudRegistro({ ...base }, catalogo), rechazaCon(400, 'CAMPUS_OBLIGATORIO'));
  assert.throws(() => validarSolicitudRegistro({ ...base, campus: 'Campus Fantasma' }, catalogo), rechazaCon(400, 'CAMPUS_INVALIDO'));
});

test('[HU6-20] validación: al menos una carrera, y que sea del campus', () => {
  const base = { idInstitucional: '00000252115', campus: NAV };
  assert.throws(() => validarSolicitudRegistro({ ...base, carreras: [] }, catalogo), rechazaCon(400, 'CARRERAS_OBLIGATORIAS'));
  assert.throws(() => validarSolicitudRegistro({ ...base, carreras: ['', '  '] }, catalogo), rechazaCon(400, 'CARRERAS_OBLIGATORIAS'));
  assert.throws(() => validarSolicitudRegistro({ ...base, carreras: 'Software' }, catalogo), rechazaCon(400, 'CARRERAS_OBLIGATORIAS'));
  assert.throws(() => validarSolicitudRegistro({ ...base, carreras: ['Industrial'] }, catalogo), rechazaCon(400, 'CARRERA_INVALIDA'), 'Industrial no existe en Navojoa');
  assert.throws(() => validarSolicitudRegistro({ ...base, carreras: ['Software', 'Industrial'] }, catalogo), rechazaCon(400, 'CARRERA_INVALIDA'), 'basta una inválida');
});

test('[HU6-20] validación: solicitud válida limpia espacios y quita carreras duplicadas', () => {
  const r = validarSolicitudRegistro({ idInstitucional: '00000252115', campus: ` ${OBR} `, carreras: ['Software', ' Software ', 'Industrial'] }, catalogo);
  assert.deepEqual(r, { idInstitucional: '00000252115', campus: OBR, carreras: ['Software', 'Industrial'] });
});

test('[HU6-20] validación: id duplicado (activo o inactivo) no se puede registrar de nuevo', async () => {
  const repo = new RepositorioColaboradoresMemoria({ colaboradores: [
    { idInstitucional: '00000000001', campus: OBR, carreras: ['Software'] },
    { idInstitucional: '00000000002', campus: OBR, carreras: ['Software'], estado: 'inactivo' },
  ] });
  for (const id of ['00000000001', '00000000002']) {
    assert.equal(await repo.existe(id), true, id);
    await assert.rejects(repo.guardar({ idInstitucional: id, campus: OBR, carreras: ['Software'] }), rechazaCon(409, 'YA_REGISTRADO'));
  }
  assert.equal(await repo.existe('00000000003'), false);
});

// ---- 6B: inactivación ----

function plan(colaboradores, filas) {
  const repositorio = new RepositorioColaboradoresMemoria({ colaboradores });
  const cartera = {
    carteraPorCarrera: async () => filas,
    contarPorColaborador: async () => ({}),
  };
  return (id) => construirPlanBaja({ repositorio, cartera, idInstitucional: id });
}

test('[HU6-20] 6B: único colaborador del campus no se puede dar de baja', async () => {
  const baja = plan(
    [{ idInstitucional: '00000000001', campus: OBR, carreras: ['Software'] }, { idInstitucional: '00000000002', campus: NAV, carreras: ['Software'] }],
    [{ campus: OBR, carrera: 'Software', aspirantes: 3 }]
  );
  await assert.rejects(baja('00000000001'), (e) => e.status === 409 && e.codigo === 'SIN_COLABORADOR_RELEVO' && e.message.includes(OBR));
});

test('[HU6-20] 6B: otro colaborador INACTIVO en el campus tampoco cuenta como relevo', async () => {
  const baja = plan(
    [{ idInstitucional: '00000000001', campus: OBR, carreras: [] }, { idInstitucional: '00000000002', campus: OBR, carreras: [], estado: 'inactivo' }],
    [{ campus: OBR, carrera: 'Software', aspirantes: 3 }]
  );
  await assert.rejects(baja('00000000001'), rechazaCon(409, 'SIN_COLABORADOR_RELEVO'));
});

test('[HU6-20] 6B: con un compañero activo en el campus la baja sí procede', async () => {
  const baja = plan(
    [{ idInstitucional: '00000000001', campus: OBR, carreras: ['Software'] }, { idInstitucional: '00000000002', campus: OBR, carreras: [] }],
    [{ campus: OBR, carrera: 'Software', aspirantes: 3 }]
  );
  const { resultado } = await baja('00000000001');
  assert.deepEqual(resultado.asignaciones.map((a) => a.colaboradorId), ['00000000002']);
});

test('[HU6-20] 6B: no se da de baja a quien ya está inactivo ni a quien no existe', async () => {
  const baja = plan([{ idInstitucional: '00000000001', campus: OBR, estado: 'inactivo' }, { idInstitucional: '00000000002', campus: OBR }], []);
  await assert.rejects(baja('00000000001'), rechazaCon(409, 'YA_INACTIVO'));
  await assert.rejects(baja('00000000099'), rechazaCon(404, 'COLABORADOR_NO_ENCONTRADO'));
});

test('[HU6-20] 6B: validación de duración de la baja', () => {
  const hoy = '2026-11-26';
  assert.deepEqual(validarDuracionBaja({ tipo: 'indefinido' }, hoy), { indefinida: true, desde: hoy, hasta: null });
  assert.deepEqual(validarDuracionBaja({ tipo: 'periodo', inicio: '2026-11-26', fin: '2026-11-26' }, hoy), { indefinida: false, desde: '2026-11-26', hasta: '2026-11-26' }, 'un solo día es válido');
  assert.throws(() => validarDuracionBaja({}, hoy), rechazaCon(400, 'TIPO_BAJA_INVALIDO'));
  assert.throws(() => validarDuracionBaja({ tipo: 'periodo', inicio: '2026-02-30', fin: '2027-01-01' }, hoy), rechazaCon(400, 'FECHAS_BAJA_INVALIDAS'), '30 de febrero no existe');
  assert.throws(() => validarDuracionBaja({ tipo: 'periodo', inicio: '2027-02-01', fin: '2027-01-01' }, hoy), rechazaCon(400, 'PERIODO_BAJA_INVALIDO'));
  assert.throws(() => validarDuracionBaja({ tipo: 'periodo', inicio: '2020-01-01', fin: '2020-02-01' }, hoy), rechazaCon(400, 'PERIODO_BAJA_VENCIDO'));
});
