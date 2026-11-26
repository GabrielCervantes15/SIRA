/**
 * Suite de Pruebas Unitarias: Validaciones de Dominio/Frontend y Componentes del Formulario de HU 9
 * Tarea Jira: EQ-111 · [HU9-10] (Sprint 2)
 *
 * Cubre exhaustivamente:
 * - Bloque A: Validaciones de dominio (`src/modulos/mensajes/`) y frontend (`frontend/js/validaciones-configuracion-mensajes.js`)
 *   con análisis de valores frontera (unidades, límites 1h..720h / 30d, enteros, jornada por día, horaInicio < horaFin,
 *   evaluación de horario permitido y siguiente apertura en `America/Hermosillo`).
 * - Bloque B: Comportamiento de los componentes interactivos del panel lateral (`frontend/js/configuracion-mensajes.js`)
 *   mediante un doble de prueba liviano del DOM sin dependencias externas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ZONA_HORARIA_INSTITUCIONAL,
  DIAS_SEMANA as DIAS_DOMINIO,
  crearConfiguracionInicial as crearConfiguracionInicialDominio,
  calcularEquivalenciaHoras,
  validarConfiguracionMensajes,
  convertirHoraAMinutos,
  evaluarHorarioPermitido,
  calcularSiguienteAperturaDesdeConfig,
} from "../src/modulos/mensajes/index.js";
import {
  DIAS_SEMANA as DIAS_FRONTEND,
  ZONA_HORARIA as ZONA_FRONTEND,
  LIMITE_MINIMO_HORAS,
  LIMITE_MAXIMO_HORAS,
  crearConfiguracionInicial as crearConfiguracionInicialFrontend,
  validarConfiguracion as validarConfiguracionFrontend,
} from "../frontend/js/validaciones-configuracion-mensajes.js";
import { inicializarConfiguracionMensajes } from "../frontend/js/configuracion-mensajes.js";

// ============================================================================
// BLOQUE A: Validaciones de Dominio y Frontend (Valores Frontera y Reglas PO)
// ============================================================================

test("[EQ-111 / HU9-10] A.1 Unidades permitidas: acepta 'horas' y 'dias' y rechaza cualquier otra unidad en dominio y frontend", () => {
  for (const unidadValida of ["horas", "dias"]) {
    const cfgDominio = crearConfiguracionInicialDominio();
    cfgDominio.tiempoMaximoEsperaRespuesta = { valor: 5, unidad: unidadValida };
    cfgDominio.tiempoEsperaContactoPrevio = { valor: 10, unidad: unidadValida };

    const resDom = validarConfiguracionMensajes(cfgDominio);
    assert.equal(resDom.valido, true, `Dominio debe aceptar unidad '${unidadValida}'`);
    assert.deepEqual(resDom.errores, {});

    const cfgFront = crearConfiguracionInicialFrontend();
    cfgFront.tiempoMaximoEsperaRespuesta = { valor: 5, unidad: unidadValida };
    cfgFront.tiempoEsperaContactoPrevio = { valor: 10, unidad: unidadValida };

    const resFront = validarConfiguracionFrontend(cfgFront);
    assert.equal(resFront.valido, true, `Frontend debe aceptar unidad '${unidadValida}'`);
    assert.deepEqual(resFront.errores, {});
  }

  const unidadesInvalidas = [
    "minutos",
    "segundos",
    "semanas",
    "meses",
    "HORAS",
    "DIAS",
    "Horas",
    "días",
    "",
    null,
    undefined,
    123,
  ];

  for (const unidadInvalida of unidadesInvalidas) {
    const cfgDominio = crearConfiguracionInicialDominio();
    cfgDominio.tiempoMaximoEsperaRespuesta = { valor: 10, unidad: unidadInvalida };
    cfgDominio.tiempoEsperaContactoPrevio = { valor: 10, unidad: unidadInvalida };

    const resDom = validarConfiguracionMensajes(cfgDominio);
    assert.equal(resDom.valido, false);
    assert.ok(resDom.errores.tiempoMaximoEsperaRespuesta);
    assert.ok(resDom.errores.tiempoEsperaContactoPrevio);

    const cfgFront = crearConfiguracionInicialFrontend();
    cfgFront.tiempoMaximoEsperaRespuesta = { valor: 10, unidad: unidadInvalida };
    cfgFront.tiempoEsperaContactoPrevio = { valor: 10, unidad: unidadInvalida };

    const resFront = validarConfiguracionFrontend(cfgFront);
    assert.equal(resFront.valido, false);
    assert.ok(resFront.errores.tiempoMaximoEsperaRespuesta);
    assert.ok(resFront.errores.tiempoEsperaContactoPrevio);
  }
});

test("[EQ-111 / HU9-10] A.2 Límites y tipo numérico: valores frontera válidos (1h, 720h, 1d, 30d) e inválidos (0, negativos, decimales, 721h, 31d, tipos no enteros)", () => {
  assert.equal(LIMITE_MINIMO_HORAS, 1);
  assert.equal(LIMITE_MAXIMO_HORAS, 720);

  const fronterasValidas = [
    { valor: 1, unidad: "horas", horasEsperadas: 1 },
    { valor: 24, unidad: "horas", horasEsperadas: 24 },
    { valor: 720, unidad: "horas", horasEsperadas: 720 },
    { valor: 1, unidad: "dias", horasEsperadas: 24 },
    { valor: 15, unidad: "dias", horasEsperadas: 360 },
    { valor: 30, unidad: "dias", horasEsperadas: 720 },
  ];

  for (const caso of fronterasValidas) {
    const cfgDom = crearConfiguracionInicialDominio();
    cfgDom.tiempoMaximoEsperaRespuesta = { valor: caso.valor, unidad: caso.unidad };
    cfgDom.tiempoEsperaContactoPrevio = { valor: caso.valor, unidad: caso.unidad };

    const resDom = validarConfiguracionMensajes(cfgDom);
    assert.equal(resDom.valido, true);
    assert.equal(
      resDom.configuracionNormalizada.tiempoMaximoEsperaRespuesta.equivalenciaHoras,
      caso.horasEsperadas
    );
    assert.equal(
      calcularEquivalenciaHoras({ valor: caso.valor, unidad: caso.unidad }),
      caso.horasEsperadas
    );

    const resFront = validarConfiguracionFrontend(cfgDom);
    assert.equal(resFront.valido, true);
  }

  const fronterasInvalidas = [
    { valor: 0, unidad: "horas" },
    { valor: 0, unidad: "dias" },
    { valor: -1, unidad: "horas" },
    { valor: -24, unidad: "dias" },
    { valor: 0.5, unidad: "horas" },
    { valor: 1.5, unidad: "dias" },
    { valor: 29.99, unidad: "dias" },
    { valor: 721, unidad: "horas" },
    { valor: 31, unidad: "dias" },
    { valor: "24", unidad: "horas" },
    { valor: NaN, unidad: "horas" },
    { valor: Infinity, unidad: "horas" },
    { valor: null, unidad: "horas" },
    null,
    "24 horas",
    [],
  ];

  for (const parametroInvalido of fronterasInvalidas) {
    // Error aislado en tiempoMaximoEsperaRespuesta mientras tiempoEsperaContactoPrevio es válido
    const cfgRespInvalida = crearConfiguracionInicialDominio();
    cfgRespInvalida.tiempoMaximoEsperaRespuesta = parametroInvalido;
    cfgRespInvalida.tiempoEsperaContactoPrevio = { valor: 48, unidad: "horas" };

    const resDom1 = validarConfiguracionMensajes(cfgRespInvalida);
    assert.equal(resDom1.valido, false);
    assert.ok(resDom1.errores.tiempoMaximoEsperaRespuesta);
    assert.equal(resDom1.errores.tiempoEsperaContactoPrevio, undefined);

    const resFront1 = validarConfiguracionFrontend(cfgRespInvalida);
    assert.equal(resFront1.valido, false);
    assert.ok(resFront1.errores.tiempoMaximoEsperaRespuesta);
    assert.equal(resFront1.errores.tiempoEsperaContactoPrevio, undefined);

    // Error aislado en tiempoEsperaContactoPrevio mientras tiempoMaximoEsperaRespuesta es válido
    const cfgContactoInvalido = crearConfiguracionInicialDominio();
    cfgContactoInvalido.tiempoMaximoEsperaRespuesta = { valor: 24, unidad: "horas" };
    cfgContactoInvalido.tiempoEsperaContactoPrevio = parametroInvalido;

    const resDom2 = validarConfiguracionMensajes(cfgContactoInvalido);
    assert.equal(resDom2.valido, false);
    assert.equal(resDom2.errores.tiempoMaximoEsperaRespuesta, undefined);
    assert.ok(resDom2.errores.tiempoEsperaContactoPrevio);

    const resFront2 = validarConfiguracionFrontend(cfgContactoInvalido);
    assert.equal(resFront2.valido, false);
    assert.equal(resFront2.errores.tiempoMaximoEsperaRespuesta, undefined);
    assert.ok(resFront2.errores.tiempoEsperaContactoPrevio);
  }
});

test("[EQ-111 / HU9-10] A.3 Jornada laboral, formato HH:MM, inicio < fin, prohibición de segunda ventana y zona horaria", () => {
  assert.equal(ZONA_HORARIA_INSTITUCIONAL, "America/Hermosillo");
  assert.equal(ZONA_FRONTEND, "America/Hermosillo");
  assert.equal(DIAS_DOMINIO.length, 7);
  assert.equal(DIAS_FRONTEND.length, 7);
  assert.equal(convertirHoraAMinutos("00:00"), 0);
  assert.equal(convertirHoraAMinutos("08:30"), 510);
  assert.equal(convertirHoraAMinutos("23:59"), 1439);

  // 1. Horarios independientes válidos por día, incluyendo fronteras 00:00..23:59 y 1 minuto de diferencia
  const cfgValida = crearConfiguracionInicialDominio();
  cfgValida.jornada.lunes = { habilitado: true, horaInicio: "00:00", horaFin: "23:59" };
  cfgValida.jornada.martes = { habilitado: true, horaInicio: "08:00", horaFin: "08:01" };
  cfgValida.jornada.viernes = { habilitado: true, horaInicio: "09:15", horaFin: "14:45" };
  cfgValida.jornada.sabado = { habilitado: true, horaInicio: "09:00", horaFin: "13:00" };
  cfgValida.jornada.domingo = { habilitado: false, horaInicio: "08:00", horaFin: "10:00" };

  const resValidaDom = validarConfiguracionMensajes(cfgValida);
  assert.equal(resValidaDom.valido, true);
  // Día deshabilitado se normaliza a horaInicio: null, horaFin: null
  assert.deepEqual(resValidaDom.configuracionNormalizada.jornada.domingo, {
    habilitado: false,
    horaInicio: null,
    horaFin: null,
  });
  assert.equal(validarConfiguracionFrontend(cfgValida).valido, true);

  // 2. Rechaza inicio === fin e inicio > fin
  for (const [inicio, fin] of [
    ["08:00", "08:00"],
    ["12:00", "12:00"],
    ["18:00", "08:00"],
    ["12:01", "12:00"],
    ["23:59", "00:00"],
  ]) {
    const cfg = crearConfiguracionInicialDominio();
    cfg.jornada.jueves = { habilitado: true, horaInicio: inicio, horaFin: fin };

    const rDom = validarConfiguracionMensajes(cfg);
    assert.equal(rDom.valido, false);
    assert.ok(rDom.errores["jornada.jueves"]);

    const rFront = validarConfiguracionFrontend(cfg);
    assert.equal(rFront.valido, false);
    assert.ok(rFront.errores["jornada.jueves"]);
  }

  // 3. Rechaza formatos HH:MM inválidos en días habilitados
  for (const horaInvalida of ["8:00", "08:0", "24:00", "12:60", "-01:00", "ab:cd", "", null, undefined, 800]) {
    const cfgIni = crearConfiguracionInicialDominio();
    cfgIni.jornada.lunes = { habilitado: true, horaInicio: horaInvalida, horaFin: "18:00" };
    assert.equal(validarConfiguracionMensajes(cfgIni).valido, false);
    assert.ok(validarConfiguracionMensajes(cfgIni).errores["jornada.lunes"]);
    assert.equal(validarConfiguracionFrontend(cfgIni).valido, false);

    const cfgFin = crearConfiguracionInicialDominio();
    cfgFin.jornada.viernes = { habilitado: true, horaInicio: "08:00", horaFin: horaInvalida };
    assert.equal(validarConfiguracionMensajes(cfgFin).valido, false);
    assert.ok(validarConfiguracionMensajes(cfgFin).errores["jornada.viernes"]);
    assert.equal(validarConfiguracionFrontend(cfgFin).valido, false);
  }

  // 4. Rechaza habilitado no booleano, días faltantes o días desconocidos
  const cfgHabilitadoInvalido = crearConfiguracionInicialDominio();
  cfgHabilitadoInvalido.jornada.sabado = { habilitado: "false", horaInicio: null, horaFin: null };
  assert.equal(validarConfiguracionMensajes(cfgHabilitadoInvalido).valido, false);
  assert.ok(validarConfiguracionMensajes(cfgHabilitadoInvalido).errores["jornada.sabado"]);
  assert.equal(validarConfiguracionFrontend(cfgHabilitadoInvalido).valido, false);

  const cfgDiaFaltante = crearConfiguracionInicialDominio();
  delete cfgDiaFaltante.jornada.domingo;
  const resFaltante = validarConfiguracionMensajes(cfgDiaFaltante);
  assert.equal(resFaltante.valido, false);
  assert.ok(resFaltante.errores.jornada);
  assert.ok(resFaltante.errores["jornada.domingo"]);

  const cfgDiaExtra = crearConfiguracionInicialDominio();
  cfgDiaExtra.jornada.festivo = { habilitado: false, horaInicio: null, horaFin: null };
  assert.equal(validarConfiguracionMensajes(cfgDiaExtra).valido, false);
  assert.ok(validarConfiguracionMensajes(cfgDiaExtra).errores.jornada);

  // 5. Rechaza segunda ventana horaria (a nivel raíz y por día) y zona horaria distinta de America/Hermosillo
  const cfgSegundaVentanaDia = crearConfiguracionInicialDominio();
  cfgSegundaVentanaDia.jornada.lunes.ventanaEnvio = { inicio: "09:00", fin: "12:00" };
  const resVentanaDia = validarConfiguracionMensajes(cfgSegundaVentanaDia);
  assert.equal(resVentanaDia.valido, false);
  assert.ok(resVentanaDia.errores.horarioPermitido);
  assert.ok(resVentanaDia.errores["jornada.lunes"]);

  const cfgZonaInvalida = crearConfiguracionInicialDominio();
  cfgZonaInvalida.zonaHoraria = "America/Mexico_City";
  const resZona = validarConfiguracionMensajes(cfgZonaInvalida);
  assert.equal(resZona.valido, false);
  assert.ok(resZona.errores.zonaHoraria);

  // 6. Rechaza entrada nula o arreglo
  assert.equal(validarConfiguracionMensajes(null).valido, false);
  assert.equal(validarConfiguracionMensajes([]).valido, false);
  assert.equal(validarConfiguracionFrontend(null).valido, false);
  assert.equal(validarConfiguracionFrontend([]).valido, false);
});

test("[EQ-111 / HU9-10] A.4 Evaluación de horario en America/Hermosillo: fronteras exactas (07:59:59, 08:00:00, 17:59:59, 18:00:00) y jornada sin días habilitados", () => {
  const cfg = crearConfiguracionInicialDominio();

  // Lunes 16 Nov 2026 en America/Hermosillo (UTC-07:00):
  // 07:59:59 Hermosillo = 14:59:59Z -> false
  assert.equal(evaluarHorarioPermitido("2026-11-16T14:59:59.000Z", cfg), false);
  // 08:00:00 Hermosillo = 15:00:00Z -> true (inicio inclusivo)
  assert.equal(evaluarHorarioPermitido("2026-11-16T15:00:00.000Z", cfg), true);
  // 17:59:59 Hermosillo = Martes 17 Nov 00:59:59Z -> true (último segundo antes del cierre)
  assert.equal(evaluarHorarioPermitido("2026-11-17T00:59:59.000Z", cfg), true);
  // 18:00:00 Hermosillo = Martes 17 Nov 01:00:00Z -> false (fin exclusivo)
  assert.equal(evaluarHorarioPermitido("2026-11-17T01:00:00.000Z", cfg), false);

  // Si todos los días están deshabilitados, calcularSiguienteAperturaDesdeConfig devuelve null
  const cfgSinDias = crearConfiguracionInicialDominio();
  for (const dia of DIAS_DOMINIO) {
    cfgSinDias.jornada[dia] = { habilitado: false, horaInicio: null, horaFin: null };
  }
  assert.equal(
    calcularSiguienteAperturaDesdeConfig("2026-11-16T15:00:00.000Z", cfgSinDias),
    null
  );
});

// ============================================================================
// BLOQUE B: Pruebas Unitarias de los Componentes del Formulario (DOM Simulado)
// ============================================================================

function crearElementoSimulado({ id = "", tagName = "DIV", clases = [], dataset = {}, atributos = {} } = {}) {
  const conjuntoClases = new Set(clases);
  const mapaAtributos = new Map(Object.entries(atributos));
  const oyentes = new Map();

  const el = {
    id,
    tagName,
    hidden: Boolean(atributos.hidden),
    disabled: false,
    value: atributos.value ?? "",
    min: atributos.min ?? "",
    max: atributos.max ?? "",
    step: atributos.step ?? "",
    textContent: "",
    dataset: { ...dataset },
    get className() {
      return [...conjuntoClases].join(" ");
    },
    set className(valor) {
      conjuntoClases.clear();
      for (const c of String(valor || "").split(/\s+/).filter(Boolean)) {
        conjuntoClases.add(c);
      }
    },
    classList: {
      add(...nombres) {
        for (const n of nombres) if (n) conjuntoClases.add(n);
      },
      remove(...nombres) {
        for (const n of nombres) conjuntoClases.delete(n);
      },
      contains(nombre) {
        return conjuntoClases.has(nombre);
      },
      toggle(nombre, forzar) {
        const activar = forzar === undefined ? !conjuntoClases.has(nombre) : Boolean(forzar);
        if (activar) conjuntoClases.add(nombre);
        else conjuntoClases.delete(nombre);
        return activar;
      },
    },
    setAttribute(nombre, valor) {
      mapaAtributos.set(nombre, String(valor));
    },
    getAttribute(nombre) {
      return mapaAtributos.has(nombre) ? mapaAtributos.get(nombre) : null;
    },
    removeAttribute(nombre) {
      mapaAtributos.delete(nombre);
    },
    hasAttribute(nombre) {
      return mapaAtributos.has(nombre);
    },
    focus() {
      if (globalThis.document) {
        globalThis.document.activeElement = el;
      }
    },
    addEventListener(tipo, manejador) {
      if (!oyentes.has(tipo)) oyentes.set(tipo, []);
      oyentes.get(tipo).push(manejador);
    },
    dispatchEvent(evento) {
      const lista = oyentes.get(evento.type) || [];
      let resultado = null;
      for (const fn of lista) {
        resultado = fn(evento);
      }
      return resultado;
    },
    click() {
      return el.dispatchEvent({ type: "click", preventDefault() {} });
    },
  };

  return el;
}

function montarDomConfiguracionMensajes() {
  const elementosPorId = new Map();
  const registrar = (el) => {
    if (el.id) elementosPorId.set(el.id, el);
    return el;
  };

  const navMensajes = registrar(crearElementoSimulado({ id: "nav-mensajes", tagName: "A" }));
  const botonAbrir = registrar(
    crearElementoSimulado({
      id: "abrir-configuracion",
      tagName: "BUTTON",
      atributos: { hidden: true, "aria-expanded": "false" },
    })
  );
  const panel = registrar(
    crearElementoSimulado({
      id: "panel-configuracion",
      tagName: "ASIDE",
      atributos: { hidden: true },
    })
  );
  const botonCerrar = registrar(
    crearElementoSimulado({ id: "cerrar-configuracion", tagName: "BUTTON" })
  );
  const formulario = registrar(
    crearElementoSimulado({ id: "form-configuracion", tagName: "FORM" })
  );
  const botonGuardar = registrar(
    crearElementoSimulado({
      id: "guardar-configuracion",
      tagName: "BUTTON",
      atributos: { type: "submit" },
    })
  );
  botonGuardar.textContent = "Guardar";

  const horaInicio = registrar(
    crearElementoSimulado({
      id: "cfg-horario-inicio",
      tagName: "INPUT",
      atributos: { value: "08:00" },
    })
  );
  const horaFin = registrar(
    crearElementoSimulado({
      id: "cfg-horario-fin",
      tagName: "INPUT",
      atributos: { value: "18:00" },
    })
  );
  const respuestaValor = registrar(
    crearElementoSimulado({
      id: "cfg-respuesta-valor",
      tagName: "INPUT",
      atributos: { value: "1", min: "1", max: "30" },
    })
  );
  const respuestaUnidad = registrar(
    crearElementoSimulado({
      id: "cfg-respuesta-unidad",
      tagName: "SELECT",
      atributos: { value: "dias" },
    })
  );
  const contactoValor = registrar(
    crearElementoSimulado({
      id: "cfg-contacto-valor",
      tagName: "INPUT",
      atributos: { value: "2", min: "1", max: "30" },
    })
  );
  const contactoUnidad = registrar(
    crearElementoSimulado({
      id: "cfg-contacto-unidad",
      tagName: "SELECT",
      atributos: { value: "dias" },
    })
  );

  const errorJornada = registrar(crearElementoSimulado({ id: "error-jornada", tagName: "P" }));
  const errorRespuesta = registrar(crearElementoSimulado({ id: "error-respuesta", tagName: "P" }));
  const errorContacto = registrar(crearElementoSimulado({ id: "error-contacto", tagName: "P" }));
  const mensaje = registrar(
    crearElementoSimulado({
      id: "mensaje-configuracion",
      tagName: "P",
      clases: ["mensaje-configuracion"],
    })
  );

  const stepperRespMenos = crearElementoSimulado({
    tagName: "BUTTON",
    clases: ["boton-stepper"],
    dataset: { target: "cfg-respuesta-valor", step: "-1" },
  });
  const stepperRespMas = crearElementoSimulado({
    tagName: "BUTTON",
    clases: ["boton-stepper"],
    dataset: { target: "cfg-respuesta-valor", step: "1" },
  });
  const stepperContactoMenos = crearElementoSimulado({
    tagName: "BUTTON",
    clases: ["boton-stepper"],
    dataset: { target: "cfg-contacto-valor", step: "-1" },
  });
  const stepperContactoMas = crearElementoSimulado({
    tagName: "BUTTON",
    clases: ["boton-stepper"],
    dataset: { target: "cfg-contacto-valor", step: "1" },
  });

  const botonesStepper = [
    stepperRespMenos,
    stepperRespMas,
    stepperContactoMenos,
    stepperContactoMas,
  ];

  const controlesFormulario = [
    horaInicio,
    horaFin,
    respuestaValor,
    respuestaUnidad,
    contactoValor,
    contactoUnidad,
    botonGuardar,
    ...botonesStepper,
  ];

  formulario.querySelectorAll = () => controlesFormulario;

  const oyentesDocumento = new Map();
  const documentoSimulado = {
    activeElement: null,
    getElementById(id) {
      return elementosPorId.get(id) || null;
    },
    querySelectorAll(selector) {
      if (selector === ".boton-stepper") return botonesStepper;
      return [];
    },
    addEventListener(tipo, fn) {
      if (!oyentesDocumento.has(tipo)) oyentesDocumento.set(tipo, []);
      oyentesDocumento.get(tipo).push(fn);
    },
    dispatchEvent(evento) {
      const lista = oyentesDocumento.get(evento.type) || [];
      for (const fn of lista) fn(evento);
    },
  };

  globalThis.document = documentoSimulado;

  return {
    documentoSimulado,
    navMensajes,
    botonAbrir,
    panel,
    botonCerrar,
    formulario,
    botonGuardar,
    horaInicio,
    horaFin,
    respuestaValor,
    respuestaUnidad,
    contactoValor,
    contactoUnidad,
    errorJornada,
    errorRespuesta,
    errorContacto,
    mensaje,
    stepperRespMenos,
    stepperRespMas,
    stepperContactoMenos,
    stepperContactoMas,
  };
}

test("[EQ-111 / HU9-10] B.1 Control visual por rol: colaborador no ve el botón ni abre el panel; administrador ve el botón y el panel inicia oculto", () => {
  const domColab = montarDomConfiguracionMensajes();
  let llamadasObtener = 0;
  const apiSimulada = {
    configuracionEnvio: {
      obtener: async () => {
        llamadasObtener += 1;
        return crearConfiguracionInicialDominio();
      },
      guardar: async (c) => c,
    },
  };

  inicializarConfiguracionMensajes({ api: apiSimulada, esAdministrador: false });
  assert.equal(domColab.botonAbrir.hidden, true);
  assert.equal(domColab.panel.hidden, true);
  domColab.botonAbrir.click();
  assert.equal(domColab.panel.hidden, true);
  assert.equal(llamadasObtener, 0);

  const domAdmin = montarDomConfiguracionMensajes();
  inicializarConfiguracionMensajes({ api: apiSimulada, esAdministrador: true });
  assert.equal(domAdmin.botonAbrir.hidden, false);
  assert.equal(domAdmin.panel.hidden, true);
});

test("[EQ-111 / HU9-10] B.2 Apertura, carga de valores desde la API y cierre por botón '×' y tecla Escape", async () => {
  const dom = montarDomConfiguracionMensajes();
  let llamadasObtener = 0;
  const configServidor = {
    ...crearConfiguracionInicialDominio(),
    tiempoMaximoEsperaRespuesta: { valor: 24, unidad: "horas" },
    tiempoEsperaContactoPrevio: { valor: 2, unidad: "dias" },
    jornada: {
      ...crearConfiguracionInicialDominio().jornada,
      lunes: { habilitado: true, horaInicio: "09:00", horaFin: "17:30" },
    },
  };

  const apiSimulada = {
    configuracionEnvio: {
      obtener: async () => {
        llamadasObtener += 1;
        return configServidor;
      },
      guardar: async (c) => c,
    },
  };

  inicializarConfiguracionMensajes({ api: apiSimulada, esAdministrador: true });

  // Abrir panel y esperar carga asíncrona
  dom.botonAbrir.click();
  await new Promise((r) => setImmediate(r));

  assert.equal(llamadasObtener, 1);
  assert.equal(dom.panel.hidden, false);
  assert.equal(dom.botonAbrir.getAttribute("aria-expanded"), "true");
  assert.equal(String(dom.respuestaValor.value), "24");
  assert.equal(dom.respuestaUnidad.value, "horas");
  assert.equal(dom.respuestaValor.max, "720");
  assert.equal(String(dom.contactoValor.value), "2");
  assert.equal(dom.contactoUnidad.value, "dias");
  assert.equal(dom.contactoValor.max, "30");
  assert.equal(dom.horaInicio.value, "09:00");
  assert.equal(dom.horaFin.value, "17:30");

  // Cerrar con botón '×'
  dom.botonCerrar.click();
  assert.equal(dom.panel.hidden, true);
  assert.equal(dom.botonAbrir.getAttribute("aria-expanded"), "false");
  assert.equal(dom.documentoSimulado.activeElement, dom.botonAbrir);

  // Reabrir y cerrar con tecla Escape
  dom.botonAbrir.click();
  await new Promise((r) => setImmediate(r));
  assert.equal(dom.panel.hidden, false);

  dom.documentoSimulado.dispatchEvent({ type: "keydown", key: "Escape" });
  assert.equal(dom.panel.hidden, true);
  assert.equal(dom.botonAbrir.getAttribute("aria-expanded"), "false");
});

test("[EQ-111 / HU9-10] B.3 y B.4 Cambio de unidades actualiza límites min/max, y botones stepper (+ / −) respetan topes y limpian errores", async () => {
  const dom = montarDomConfiguracionMensajes();
  const apiSimulada = {
    configuracionEnvio: {
      obtener: async () => crearConfiguracionInicialFrontend(),
      guardar: async (c) => c,
    },
  };

  inicializarConfiguracionMensajes({ api: apiSimulada, esAdministrador: true });
  dom.botonAbrir.click();
  await new Promise((r) => setImmediate(r));

  // Inicialmente en días (min=1, max=30, valor=1)
  assert.equal(dom.respuestaUnidad.value, "dias");
  assert.equal(dom.respuestaValor.min, "1");
  assert.equal(dom.respuestaValor.max, "30");

  // Intentar decrementar por debajo de 1 con stepper (−) -> se mantiene en 1
  dom.stepperRespMenos.click();
  assert.equal(dom.respuestaValor.value, "1");

  // Incrementar con stepper (+) -> pasa a 2
  dom.stepperRespMas.click();
  assert.equal(dom.respuestaValor.value, "2");

  // En el límite superior (30 días), el stepper (+) no rebasa 30
  dom.respuestaValor.value = "30";
  dom.stepperRespMas.click();
  assert.equal(dom.respuestaValor.value, "30");

  // Simular un error previo en respuesta y cambiar unidad a 'horas' -> max cambia a 720 y limpia error
  dom.errorRespuesta.textContent = "Error previo";
  dom.respuestaValor.setAttribute("aria-invalid", "true");
  dom.respuestaUnidad.value = "horas";
  dom.respuestaUnidad.dispatchEvent({ type: "change" });

  assert.equal(dom.respuestaValor.max, "720");
  assert.equal(dom.errorRespuesta.textContent, "");
  assert.equal(dom.respuestaValor.getAttribute("aria-invalid"), null);

  // En horas, el stepper (+) permite subir por encima de 30 (ej. 30 -> 31) y topa en 720
  dom.stepperRespMas.click();
  assert.equal(dom.respuestaValor.value, "31");
  dom.respuestaValor.value = "720";
  dom.stepperRespMas.click();
  assert.equal(dom.respuestaValor.value, "720");

  // Cambio de unidad en contacto previo a 'horas' -> max=720
  dom.contactoUnidad.value = "horas";
  dom.contactoUnidad.dispatchEvent({ type: "change" });
  assert.equal(dom.contactoValor.max, "720");
});

test("[EQ-111 / HU9-10] B.5 Validación local antes de enviar: bloquea submit inválido sin llamar a la API y marca errores y aria-invalid", async () => {
  const dom = montarDomConfiguracionMensajes();
  let llamadasGuardar = 0;
  const apiSimulada = {
    configuracionEnvio: {
      obtener: async () => crearConfiguracionInicialFrontend(),
      guardar: async (c) => {
        llamadasGuardar += 1;
        return c;
      },
    },
  };

  inicializarConfiguracionMensajes({ api: apiSimulada, esAdministrador: true });
  dom.botonAbrir.click();
  await new Promise((r) => setImmediate(r));

  // Capturar datos inválidos: horario invertido (18:00 a 08:00), 0 días y 31 días
  dom.horaInicio.value = "18:00";
  dom.horaFin.value = "08:00";
  dom.respuestaValor.value = "0";
  dom.respuestaUnidad.value = "dias";
  dom.contactoValor.value = "31";
  dom.contactoUnidad.value = "dias";

  await dom.formulario.dispatchEvent({ type: "submit", preventDefault() {} });

  assert.equal(llamadasGuardar, 0, "No debe llamar a api.configuracionEnvio.guardar cuando hay errores locales");
  assert.ok(dom.errorJornada.textContent.length > 0);
  assert.ok(dom.errorRespuesta.textContent.length > 0);
  assert.ok(dom.errorContacto.textContent.length > 0);
  assert.equal(dom.horaInicio.getAttribute("aria-invalid"), "true");
  assert.equal(dom.horaFin.getAttribute("aria-invalid"), "true");
  assert.equal(dom.respuestaValor.getAttribute("aria-invalid"), "true");
  assert.equal(dom.contactoValor.getAttribute("aria-invalid"), "true");
  assert.equal(dom.mensaje.textContent, "Revisa los campos marcados antes de guardar.");
  assert.equal(dom.mensaje.classList.contains("error"), true);

  // Al editar el horario se limpia el error de jornada
  dom.horaInicio.value = "08:00";
  dom.horaInicio.dispatchEvent({ type: "input" });
  assert.equal(dom.errorJornada.textContent, "");
  assert.equal(dom.horaInicio.getAttribute("aria-invalid"), null);
});

test("[EQ-111 / HU9-10] B.6 Guardado exitoso (200) y manejo de errores del servidor (400 por campo, 403 revocación de permisos y 500 error de red)", async () => {
  const dom = montarDomConfiguracionMensajes();
  let payloadEnviado = null;
  let modoRespuesta = "exito";

  const apiSimulada = {
    configuracionEnvio: {
      obtener: async () => crearConfiguracionInicialFrontend(),
      guardar: async (payload) => {
        payloadEnviado = payload;
        if (modoRespuesta === "error400") {
          const err = new Error("Datos inválidos");
          err.estado = 400;
          err.codigo = "CONFIGURACION_INVALIDA";
          err.errores = {
            tiempoMaximoEsperaRespuesta: "Valor fuera de rango en el servidor.",
            "jornada.lunes": "En lunes, horario inválido en el servidor.",
          };
          throw err;
        }
        if (modoRespuesta === "error500") {
          const err = new Error("Fallo de red");
          err.estado = 500;
          throw err;
        }
        if (modoRespuesta === "error403") {
          const err = new Error("Sin permiso");
          err.estado = 403;
          err.codigo = "SIN_PERMISO";
          throw err;
        }
        return payload;
      },
    },
  };

  inicializarConfiguracionMensajes({ api: apiSimulada, esAdministrador: true });
  dom.botonAbrir.click();
  await new Promise((r) => setImmediate(r));

  // 1. Guardado exitoso (200)
  dom.horaInicio.value = "08:30";
  dom.horaFin.value = "17:30";
  dom.respuestaValor.value = "12";
  dom.respuestaUnidad.value = "horas";
  dom.contactoValor.value = "3";
  dom.contactoUnidad.value = "dias";

  await dom.formulario.dispatchEvent({ type: "submit", preventDefault() {} });

  assert.ok(payloadEnviado);
  assert.equal(payloadEnviado.zonaHoraria, "America/Hermosillo");
  assert.deepEqual(payloadEnviado.tiempoMaximoEsperaRespuesta, { valor: 12, unidad: "horas" });
  assert.deepEqual(payloadEnviado.tiempoEsperaContactoPrevio, { valor: 3, unidad: "dias" });
  assert.deepEqual(payloadEnviado.jornada.lunes, {
    habilitado: true,
    horaInicio: "08:30",
    horaFin: "17:30",
  });
  assert.deepEqual(payloadEnviado.jornada.sabado, {
    habilitado: false,
    horaInicio: null,
    horaFin: null,
  });
  assert.equal(dom.mensaje.textContent, "Configuración guardada correctamente.");
  assert.equal(dom.mensaje.classList.contains("exito"), true);
  assert.equal(dom.botonGuardar.textContent, "Guardar");
  assert.equal(dom.botonGuardar.disabled, false);

  // 2. Error 400 CONFIGURACION_INVALIDA del servidor
  modoRespuesta = "error400";
  await dom.formulario.dispatchEvent({ type: "submit", preventDefault() {} });
  assert.equal(dom.errorRespuesta.textContent, "Valor fuera de rango en el servidor.");
  assert.equal(dom.errorJornada.textContent, "Horario inválido en el servidor.");
  assert.equal(dom.respuestaValor.getAttribute("aria-invalid"), "true");
  assert.equal(dom.horaInicio.getAttribute("aria-invalid"), "true");
  assert.equal(dom.botonGuardar.disabled, false);

  // 3. Error 500 / red: conserva valores capturados y permite reintentar
  modoRespuesta = "error500";
  dom.horaInicio.value = "09:00";
  await dom.formulario.dispatchEvent({ type: "submit", preventDefault() {} });
  assert.match(dom.mensaje.textContent, /Tus cambios siguen disponibles para reintentar/);
  assert.equal(dom.horaInicio.value, "09:00");
  assert.equal(dom.botonGuardar.disabled, false);

  // 4. Error 403 SIN_PERMISO: oculta botón de configuración y cierra el panel
  modoRespuesta = "error403";
  await dom.formulario.dispatchEvent({ type: "submit", preventDefault() {} });
  assert.equal(dom.botonAbrir.hidden, true);
  assert.equal(dom.panel.hidden, true);
});
