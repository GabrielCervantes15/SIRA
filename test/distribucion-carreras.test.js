
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  calcularRepartoInicial,
  compararPropuestaDistribucion
} from '../src/modulos/distribucion-carreras/calculadora.js';

test('[EQ-58] reproduce el ejemplo de reparto de EQ-52', () => {
  const colaboradores = [
    {
      id: 'ana',
      activo: true,
      fechaRegistro: '2026-01-01'
    },
    {
      id: 'luis',
      activo: true,
      fechaRegistro: '2026-01-02'
    },
    {
      id: 'pedro',
      activo: true,
      fechaRegistro: '2026-01-03'
    }
  ];

  const carreras = [
    { id: 'A', aspirantes: 150 },
    { id: 'B', aspirantes: 130 },
    { id: 'C', aspirantes: 100 },
    { id: 'D', aspirantes: 60 },
    { id: 'E', aspirantes: 45 },
    { id: 'F', aspirantes: 30 },
    { id: 'G', aspirantes: 28 }
  ];

  const resultado = calcularRepartoInicial({
    colaboradores,
    carreras
  });

  assert.equal(resultado.totalAspirantes, 543);

  assert.deepEqual(resultado.cargas, [
    { colaboradorId: 'ana', carga: 180 },
    { colaboradorId: 'luis', carga: 175 },
    { colaboradorId: 'pedro', carga: 188 }
  ]);

  assert.deepEqual(
    resultado.asignaciones.map(
      (asignacion) => asignacion.colaboradorId
    ),
    [
      'ana',
      'luis',
      'pedro',
      'pedro',
      'luis',
      'ana',
      'pedro'
    ]
  );
});

test('[EQ-58] compara cargas antes y despues sin modificar datos', () => {
  const colaboradores = [
    { id: 'ana', activo: true, fechaRegistro: '2026-01-01' },
    { id: 'luis', activo: true, fechaRegistro: '2026-01-02' },
    { id: 'pedro', activo: true, fechaRegistro: '2026-01-03' }
  ];

  const carreras = [
    { id: 'A', aspirantes: 150, colaboradorIdActual: 'ana' },
    { id: 'B', aspirantes: 130, colaboradorIdActual: 'ana' },
    { id: 'C', aspirantes: 100, colaboradorIdActual: 'luis' },
    { id: 'D', aspirantes: 60, colaboradorIdActual: 'pedro' },
    { id: 'E', aspirantes: 45, colaboradorIdActual: 'luis' },
    { id: 'F', aspirantes: 30, colaboradorIdActual: 'pedro' },
    { id: 'G', aspirantes: 28, colaboradorIdActual: 'pedro' }
  ];

  const datosOriginales = structuredClone({
    colaboradores,
    carreras
  });

  const resultado = compararPropuestaDistribucion({
    colaboradores,
    carreras
  });

  assert.deepEqual(resultado.cargasAntes, [
    { colaboradorId: 'ana', carga: 280 },
    { colaboradorId: 'luis', carga: 145 },
    { colaboradorId: 'pedro', carga: 118 }
  ]);

  assert.deepEqual(resultado.cargasDespues, [
    { colaboradorId: 'ana', carga: 180 },
    { colaboradorId: 'luis', carga: 175 },
    { colaboradorId: 'pedro', carga: 188 }
  ]);

  assert.equal(resultado.totalAspirantes, 543);
  assert.equal(resultado.cambios.length, 3);

  // Comprobar que no se modificaron los datos recibidos.
  assert.deepEqual(
    { colaboradores, carreras },
    datosOriginales
  );
});

test('[EQ-58] excluye inactivos y muestra su carga final en cero', () => {
  const colaboradores = [
    { id: 'ana', activo: true, fechaRegistro: '2026-01-01' },
    { id: 'luis', activo: true, fechaRegistro: '2026-01-02' },
    { id: 'pedro', activo: false, fechaRegistro: '2025-01-01' }
  ];

  const carreras = [
    { id: 'A', aspirantes: 80, colaboradorIdActual: 'pedro' },
    { id: 'B', aspirantes: 50, colaboradorIdActual: 'ana' },
    { id: 'C', aspirantes: 30, colaboradorIdActual: 'pedro' }
  ];

  const resultado = compararPropuestaDistribucion({
    colaboradores,
    carreras
  });

  assert.deepEqual(resultado.cargasAntes, [
    { colaboradorId: 'ana', carga: 50 },
    { colaboradorId: 'luis', carga: 0 },
    { colaboradorId: 'pedro', carga: 110 }
  ]);

  assert.deepEqual(resultado.cargasDespues, [
    { colaboradorId: 'ana', carga: 80 },
    { colaboradorId: 'luis', carga: 80 },
    { colaboradorId: 'pedro', carga: 0 }
  ]);

  assert.equal(
    resultado.asignacionesPropuestas.some(
      (asignacion) => asignacion.colaboradorId === 'pedro'
    ),
    false
  );
});

test('[EQ-58] desempata por fecha de registro', () => {
  const resultado = calcularRepartoInicial({
    colaboradores: [
      { id: 'nuevo', activo: true, fechaRegistro: '2026-06-01' },
      { id: 'antiguo', activo: true, fechaRegistro: '2026-01-01' }
    ],
    carreras: [
      { id: 'A', aspirantes: 10 },
      { id: 'B', aspirantes: 10 }
    ]
  });

  assert.deepEqual(
    resultado.asignaciones.map((a) => a.colaboradorId),
    ['antiguo', 'nuevo']
  );
});

test('[EQ-58] un unico activo recibe todas las carreras', () => {
  const resultado = calcularRepartoInicial({
    colaboradores: [
      { id: 'inactivo', activo: false, fechaRegistro: '2026-01-01' },
      { id: 'unico', activo: true, fechaRegistro: '2026-02-01' }
    ],
    carreras: [
      { id: 'A', aspirantes: 25 },
      { id: 'B', aspirantes: 35 }
    ]
  });

  assert.equal(resultado.totalAspirantes, 60);
  assert.deepEqual(resultado.cargas, [
    { colaboradorId: 'unico', carga: 60 }
  ]);
});

test('[EQ-58] rechaza reparto cuando no existen activos', () => {
  assert.throws(
    () => calcularRepartoInicial({
      colaboradores: [
        { id: 'inactivo', activo: false, fechaRegistro: '2026-01-01' }
      ],
      carreras: [
        { id: 'A', aspirantes: 20 }
      ]
    }),
    /No hay colaboradores activos/
  );
});
