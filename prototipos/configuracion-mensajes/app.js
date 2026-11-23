import {
  DIAS_SEMANA,
  crearConfiguracionInicial,
  validarConfiguracion,
} from "./validaciones.js";

const $ = (id) => document.getElementById(id);

const panel = $("panel-configuracion");
const botonAbrir = $("abrir-configuracion");
const botonCerrar = $("cerrar-configuracion");
const formulario = $("form-configuracion");
const listaJornada = $("lista-jornada");
const mensaje = $("mensaje-configuracion");

let configuracionActual = crearConfiguracionInicial();

function crearElemento(etiqueta, clase, texto) {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function crearFilaDia(dia, horario) {
  const fila = crearElemento("div", "fila-dia");
  fila.dataset.dia = dia.clave;

  const nombre = crearElemento("label", "nombre-dia", dia.nombre);
  nombre.htmlFor = `jornada-${dia.clave}-habilitado`;

  const etiquetaSwitch = crearElemento("label", "switch-dia");
  etiquetaSwitch.htmlFor = `jornada-${dia.clave}-habilitado`;

  const interruptor = document.createElement("input");
  interruptor.type = "checkbox";
  interruptor.id = `jornada-${dia.clave}-habilitado`;
  interruptor.checked = horario.habilitado;
  interruptor.setAttribute("aria-label", `Habilitar jornada del ${dia.nombre.toLowerCase()}`);

  const pista = crearElemento("span", "switch-pista");
  pista.setAttribute("aria-hidden", "true");
  etiquetaSwitch.append(interruptor, pista);

  const inicio = document.createElement("input");
  inicio.type = "time";
  inicio.className = "hora-dia";
  inicio.id = `jornada-${dia.clave}-inicio`;
  inicio.value = horario.horaInicio ?? "";
  inicio.disabled = !horario.habilitado;
  inicio.setAttribute("aria-label", `Hora de inicio del ${dia.nombre.toLowerCase()}`);

  const separador = crearElemento("span", "separador-hora", "a");
  separador.setAttribute("aria-hidden", "true");

  const fin = document.createElement("input");
  fin.type = "time";
  fin.className = "hora-dia";
  fin.id = `jornada-${dia.clave}-fin`;
  fin.value = horario.horaFin ?? "";
  fin.disabled = !horario.habilitado;
  fin.setAttribute("aria-label", `Hora de fin del ${dia.nombre.toLowerCase()}`);

  const error = crearElemento("p", "error-campo");
  error.id = `error-jornada-${dia.clave}`;
  error.setAttribute("role", "alert");

  interruptor.addEventListener("change", () => {
    const habilitado = interruptor.checked;
    inicio.disabled = !habilitado;
    fin.disabled = !habilitado;
    fila.classList.toggle("dia-deshabilitado", !habilitado);
    error.textContent = "";
    inicio.removeAttribute("aria-invalid");
    fin.removeAttribute("aria-invalid");
    limpiarMensaje();
  });

  for (const control of [inicio, fin]) {
    control.addEventListener("input", () => {
      error.textContent = "";
      control.removeAttribute("aria-invalid");
      limpiarMensaje();
    });
  }

  fila.classList.toggle("dia-deshabilitado", !horario.habilitado);
  fila.append(nombre, etiquetaSwitch, inicio, separador, fin);

  const grupo = crearElemento("div", "grupo-dia");
  grupo.append(fila, error);
  return grupo;
}

function pintarJornada(jornada) {
  listaJornada.replaceChildren(
    ...DIAS_SEMANA.map((dia) => crearFilaDia(
      dia,
      jornada[dia.clave] ?? { habilitado: false, horaInicio: null, horaFin: null }
    ))
  );
}

function leerConfiguracionFormulario() {
  const jornada = {};

  for (const dia of DIAS_SEMANA) {
    const habilitado = $(`jornada-${dia.clave}-habilitado`).checked;
    jornada[dia.clave] = {
      habilitado,
      horaInicio: habilitado ? $(`jornada-${dia.clave}-inicio`).value : null,
      horaFin: habilitado ? $(`jornada-${dia.clave}-fin`).value : null,
    };
  }

  return {
    zonaHoraria: "America/Hermosillo",
    tiempoMaximoEsperaRespuesta: {
      valor: Number($("cfg-respuesta-valor").value),
      unidad: $("cfg-respuesta-unidad").value,
    },
    tiempoEsperaContactoPrevio: {
      valor: Number($("cfg-contacto-valor").value),
      unidad: $("cfg-contacto-unidad").value,
    },
    jornada,
  };
}

function limpiarErrores() {
  $("error-respuesta").textContent = "";
  $("error-contacto").textContent = "";
  $("error-jornada").textContent = "";

  for (const dia of DIAS_SEMANA) {
    $(`error-jornada-${dia.clave}`).textContent = "";
    $(`jornada-${dia.clave}-inicio`).removeAttribute("aria-invalid");
    $(`jornada-${dia.clave}-fin`).removeAttribute("aria-invalid");
  }

  for (const id of [
    "cfg-respuesta-valor",
    "cfg-respuesta-unidad",
    "cfg-contacto-valor",
    "cfg-contacto-unidad",
  ]) {
    $(id).removeAttribute("aria-invalid");
  }

  mensaje.textContent = "";
  mensaje.className = "mensaje-configuracion";
}

function mostrarErrores(errores) {
  for (const [campo, texto] of Object.entries(errores)) {
    if (campo === "tiempoMaximoEsperaRespuesta") {
      $("error-respuesta").textContent = texto;
      $("cfg-respuesta-valor").setAttribute("aria-invalid", "true");
      $("cfg-respuesta-unidad").setAttribute("aria-invalid", "true");
    } else if (campo === "tiempoEsperaContactoPrevio") {
      $("error-contacto").textContent = texto;
      $("cfg-contacto-valor").setAttribute("aria-invalid", "true");
      $("cfg-contacto-unidad").setAttribute("aria-invalid", "true");
    } else if (campo.startsWith("jornada.")) {
      const dia = campo.split(".")[1];
      const errorDia = $(`error-jornada-${dia}`);
      if (errorDia) {
        errorDia.textContent = texto;
        $(`jornada-${dia}-inicio`).setAttribute("aria-invalid", "true");
        $(`jornada-${dia}-fin`).setAttribute("aria-invalid", "true");
      }
    } else if (campo === "jornada") {
      $("error-jornada").textContent = texto;
    }
  }

  mensaje.textContent = "Revisa los campos marcados antes de guardar.";
  mensaje.classList.add("error");
}

function actualizarLimitesTiempo(inputId, unidadId) {
  const input = $(inputId);
  const unidad = $(unidadId).value;

  input.min = "1";
  input.max = unidad === "dias" ? "30" : "720";
}

function limpiarMensaje() {
  mensaje.textContent = "";
  mensaje.className = "mensaje-configuracion";
}

function limpiarErrorTiempo(errorId, controles) {
  $(errorId).textContent = "";
  for (const id of controles) $(id).removeAttribute("aria-invalid");
  limpiarMensaje();
}

function abrirPanel() {
  panel.hidden = false;
  botonAbrir.setAttribute("aria-expanded", "true");
  botonCerrar.focus();
}

function cerrarPanel() {
  panel.hidden = true;
  botonAbrir.setAttribute("aria-expanded", "false");
  botonAbrir.focus();
}

function guardarConfiguracion(evento) {
  evento.preventDefault();
  limpiarErrores();

  const configuracion = leerConfiguracionFormulario();
  const resultado = validarConfiguracion(configuracion);

  if (!resultado.valido) {
    mostrarErrores(resultado.errores);
    return;
  }

  configuracionActual = configuracion;
  mensaje.textContent = "Configuración validada y guardada en el prototipo local. No se envió al servidor.";
  mensaje.classList.add("exito");
}

function configurarControles() {
  botonAbrir.addEventListener("click", abrirPanel);
  botonCerrar.addEventListener("click", cerrarPanel);

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !panel.hidden) cerrarPanel();
  });

  formulario.addEventListener("submit", guardarConfiguracion);

  const controlesRespuesta = ["cfg-respuesta-valor", "cfg-respuesta-unidad"];
  const controlesContacto = ["cfg-contacto-valor", "cfg-contacto-unidad"];

  $("cfg-respuesta-unidad").addEventListener("change", () => {
    actualizarLimitesTiempo("cfg-respuesta-valor", "cfg-respuesta-unidad");
    limpiarErrorTiempo("error-respuesta", controlesRespuesta);
  });

  $("cfg-contacto-unidad").addEventListener("change", () => {
    actualizarLimitesTiempo("cfg-contacto-valor", "cfg-contacto-unidad");
    limpiarErrorTiempo("error-contacto", controlesContacto);
  });

  $("cfg-respuesta-valor").addEventListener("input", () => {
    limpiarErrorTiempo("error-respuesta", controlesRespuesta);
  });

  $("cfg-contacto-valor").addEventListener("input", () => {
    limpiarErrorTiempo("error-contacto", controlesContacto);
  });

  for (const boton of document.querySelectorAll(".boton-stepper")) {
    boton.addEventListener("click", () => {
      const input = $(boton.dataset.target);
      const paso = Number(boton.dataset.step);
      const minimo = Number(input.min || 1);
      const maximo = Number(input.max || 720);
      const valorActual = Number(input.value || minimo);
      input.value = String(Math.min(maximo, Math.max(minimo, valorActual + paso)));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}

function iniciar() {
  $("cfg-respuesta-valor").value = configuracionActual.tiempoMaximoEsperaRespuesta.valor;
  $("cfg-respuesta-unidad").value = configuracionActual.tiempoMaximoEsperaRespuesta.unidad;
  $("cfg-contacto-valor").value = configuracionActual.tiempoEsperaContactoPrevio.valor;
  $("cfg-contacto-unidad").value = configuracionActual.tiempoEsperaContactoPrevio.unidad;

  pintarJornada(configuracionActual.jornada);
  actualizarLimitesTiempo("cfg-respuesta-valor", "cfg-respuesta-unidad");
  actualizarLimitesTiempo("cfg-contacto-valor", "cfg-contacto-unidad");
  configurarControles();
}

iniciar();
