
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  crearServicioBorradores
} from '../src/modulos/colaboradores/borradores.js';

test('[EQ-56] guarda y recupera un borrador con campus', () => {
  const servicio = crearServicioBorradores();

  const borrador = servicio.guardarBorrador({
    idInstitucional: '00000123456',
    campus: 'Campus Obregón Náinari'
  });

  assert.equal(borrador.estado, 'BORRADOR');
  assert.equal(borrador.campus, 'Campus Obregón Náinari');

  assert.deepEqual(
    servicio.obtenerBorrador('00000123456'),
    borrador
  );
});

test('[EQ-56] rechaza guardar sin campus', () => {
  const servicio = crearServicioBorradores();

  assert.throws(
    () => servicio.guardarBorrador({
      idInstitucional: '00000123456',
      campus: ''
    }),
    /El campus es obligatorio/
  );

  assert.equal(
    servicio.obtenerBorrador('00000123456'),
    null
  );
});

test('[EQ-56] rechaza campus con solo espacios', () => {
  const servicio = crearServicioBorradores();

  assert.throws(
    () => servicio.guardarBorrador({
      idInstitucional: '00000123456',
      campus: '   '
    }),
    /El campus es obligatorio/
  );
});

test('[EQ-56] rechaza guardar sin ID institucional', () => {
  const servicio = crearServicioBorradores();

  assert.throws(
    () => servicio.guardarBorrador({
      campus: 'Campus Navojoa'
    }),
    /El ID institucional es obligatorio/
  );
});

test('[EQ-56] un borrador no modifica otro registro', () => {
  const servicio = crearServicioBorradores();

  servicio.guardarBorrador({
    idInstitucional: '001',
    campus: 'Campus Navojoa'
  });

  servicio.guardarBorrador({
    idInstitucional: '002',
    campus: 'Campus Guaymas'
  });

  assert.equal(
    servicio.obtenerBorrador('001').campus,
    'Campus Navojoa'
  );

  assert.equal(
    servicio.obtenerBorrador('002').campus,
    'Campus Guaymas'
  );
});
