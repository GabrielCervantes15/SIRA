import test from "node:test";
import assert from "node:assert/strict";

import {
  DIAS_SEMANA,
  crearConfiguracionInicial,
  validarConfiguracion,
} from "../prototipos/configuracion-mensajes/validaciones.js";

test("[EQ-103] la configuración inicial conserva los valores aprobados por el PO", () => {
  const inicial = crearConfiguracionInicial();

  assert.equal(inicial.zonaHoraria, "America/Hermosillo");
  assert.deepEqual(inicial.tiempoMaximoEsperaRespuesta, { valor: 1, unidad: "dias" });
  assert.deepEqual(inicial.tiempoEsperaContactoPrevio, { valor: 2, unidad: "dias" });

  for (const dia of ["lunes", "martes", "miercoles", "jueves", "viernes"]) {
    assert.deepEqual(inicial.jornada[dia], {
      habilitado: true,
      horaInicio: "08:00",
      horaFin: "18:00",
    });
  }

  for (const dia of ["sabado", "domingo"]) {
    assert.deepEqual(inicial.jornada[dia], {
      habilitado: false,
      horaInicio: null,
      horaFin: null,
    });
  }

  assert.equal(Object.keys(inicial.jornada).length, 7);
  assert.equal(DIAS_SEMANA.length, 7);
});

test("[EQ-103] acepta valores enteros de 1 hora a 30 días", () => {
  const configuracion = crearConfiguracionInicial();

  configuracion.tiempoMaximoEsperaRespuesta = { valor: 1, unidad: "horas" };
  configuracion.tiempoEsperaContactoPrevio = { valor: 30, unidad: "dias" };

  assert.equal(validarConfiguracion(configuracion).valido, true);
});

test("[EQ-103] rechaza decimales, cero, valores mayores a 30 días y unidades no permitidas", () => {
  const casos = [
    { valor: 1.5, unidad: "horas" },
    { valor: 0, unidad: "horas" },
    { valor: 31, unidad: "dias" },
    { valor: 2, unidad: "semanas" },
  ];

  for (const valor of casos) {
    const configuracion = crearConfiguracionInicial();
    configuracion.tiempoMaximoEsperaRespuesta = valor;

    const resultado = validarConfiguracion(configuracion);
    assert.equal(resultado.valido, false);
    assert.ok(resultado.errores.tiempoMaximoEsperaRespuesta);
  }
});

test("[EQ-103] permite horarios independientes por día", () => {
  const configuracion = crearConfiguracionInicial();
  configuracion.jornada.martes = {
    habilitado: true,
    horaInicio: "09:00",
    horaFin: "17:00",
  };

  assert.equal(validarConfiguracion(configuracion).valido, true);
});

test("[EQ-103] rechaza cuando el inicio es igual o posterior al fin", () => {
  for (const [horaInicio, horaFin] of [
    ["08:00", "08:00"],
    ["18:00", "08:00"],
  ]) {
    const configuracion = crearConfiguracionInicial();
    configuracion.jornada.lunes = {
      habilitado: true,
      horaInicio,
      horaFin,
    };

    const resultado = validarConfiguracion(configuracion);
    assert.equal(resultado.valido, false);
    assert.match(resultado.errores["jornada.lunes"], /inicio debe ser anterior/);
  }
});

test("[EQ-103] los días deshabilitados no requieren horas", () => {
  const configuracion = crearConfiguracionInicial();
  configuracion.jornada.sabado = {
    habilitado: false,
    horaInicio: null,
    horaFin: null,
  };

  assert.equal(validarConfiguracion(configuracion).valido, true);
});

test("[EQ-103] devuelve errores separados para cada campo inválido", () => {
  const configuracion = crearConfiguracionInicial();
  configuracion.tiempoMaximoEsperaRespuesta = { valor: 0, unidad: "dias" };
  configuracion.tiempoEsperaContactoPrevio = { valor: 48, unidad: "horas" };
  configuracion.jornada.miercoles = {
    habilitado: true,
    horaInicio: "19:00",
    horaFin: "08:00",
  };

  const resultado = validarConfiguracion(configuracion);

  assert.equal(resultado.valido, false);
  assert.ok(resultado.errores.tiempoMaximoEsperaRespuesta);
  assert.equal(resultado.errores.tiempoEsperaContactoPrevio, undefined);
  assert.ok(resultado.errores["jornada.miercoles"]);
});
