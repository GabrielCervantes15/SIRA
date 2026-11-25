
/**
 * HU9 (EQ-109 / EQ-110): interacción del panel lateral de configuración.
 * Diseño del prototipo: un solo horario (Inicio / Fin) para el envío. El
 * backend guarda la jornada por día, así que ese horario se aplica a los
 * días que ya están habilitados (por omisión, de lunes a viernes).
 * El acceso visual se habilita únicamente para Administrador; la API vuelve
 * a validar el rol en el servidor antes de consultar o guardar.
 */
import {
  DIAS_SEMANA,
  validarConfiguracion,
} from "./validaciones-configuracion-mensajes.js";

const $ = (id) => document.getElementById(id);

export function inicializarConfiguracionMensajes({ api, esAdministrador }) {
  const panel = $("panel-configuracion");
  const botonAbrir = $("abrir-configuracion");
  const botonCerrar = $("cerrar-configuracion");
  const formulario = $("form-configuracion");
  const botonGuardar = $("guardar-configuracion");
  const horaInicio = $("cfg-horario-inicio");
  const horaFin = $("cfg-horario-fin");
  const mensaje = $("mensaje-configuracion");

  if (!panel || !botonAbrir || !botonCerrar || !formulario ||
      !botonGuardar || !horaInicio || !horaFin || !mensaje) {
    return;
  }

  botonAbrir.hidden = !esAdministrador;
  panel.hidden = true;

  // El colaborador no necesita inicializar el panel administrativo.
  if (!esAdministrador) return;

  let guardando = false;

  function limpiarMensaje() {
    mensaje.textContent = "";
    mensaje.className = "mensaje-configuracion";
  }

  function habilitarFormulario(habilitado) {
    formulario.querySelectorAll(
      "input, select, button[type='submit'], .boton-stepper"
    ).forEach((control) => {
      control.disabled = !habilitado;
    });
  }

  const DIAS_LABORALES = ["lunes", "martes", "miercoles", "jueves", "viernes"];
  let jornadaCargada = {};

  function diasHabilitados(jornada) {
    const dias = DIAS_SEMANA
      .map((dia) => dia.clave)
      .filter((clave) => jornada?.[clave]?.habilitado);
    return dias.length > 0 ? dias : DIAS_LABORALES;
  }

  // Muestra el horario del primer día habilitado.
  function pintarHorario(jornada) {
    jornadaCargada = jornada ?? {};
    const primero = jornadaCargada[diasHabilitados(jornadaCargada)[0]] ?? {};
    horaInicio.value = primero.horaInicio ?? "08:00";
    horaFin.value = primero.horaFin ?? "18:00";
  }

  function cargarValores(configuracion) {
    $("cfg-respuesta-valor").value =
      configuracion.tiempoMaximoEsperaRespuesta.valor;

    $("cfg-respuesta-unidad").value =
      configuracion.tiempoMaximoEsperaRespuesta.unidad;

    $("cfg-contacto-valor").value =
      configuracion.tiempoEsperaContactoPrevio.valor;

    $("cfg-contacto-unidad").value =
      configuracion.tiempoEsperaContactoPrevio.unidad;

    pintarHorario(configuracion.jornada);

    actualizarLimitesTiempo(
      "cfg-respuesta-valor",
      "cfg-respuesta-unidad"
    );

    actualizarLimitesTiempo(
      "cfg-contacto-valor",
      "cfg-contacto-unidad"
    );
  }

  function leerConfiguracionFormulario() {
    const jornada = {};
    const habilitados = diasHabilitados(jornadaCargada);

    for (const dia of DIAS_SEMANA) {
      const habilitado = habilitados.includes(dia.clave);

      jornada[dia.clave] = {
        habilitado,
        horaInicio: habilitado ? horaInicio.value : null,
        horaFin: habilitado ? horaFin.value : null,
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

    for (const id of [
      "cfg-horario-inicio",
      "cfg-horario-fin",
      "cfg-respuesta-valor",
      "cfg-respuesta-unidad",
      "cfg-contacto-valor",
      "cfg-contacto-unidad",
    ]) {
      $(id).removeAttribute("aria-invalid");
    }

    limpiarMensaje();
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

      } else if (campo === "jornada" || campo.startsWith("jornada.")) {
        // Todos los días comparten el horario: basta un mensaje, sin nombrar el día.
        const sinDia = String(texto).replace(/^En [^,]+,\s*/, "");
        $("error-jornada").textContent = sinDia.charAt(0).toUpperCase() + sinDia.slice(1);
        horaInicio.setAttribute("aria-invalid", "true");
        horaFin.setAttribute("aria-invalid", "true");
      }
    }

    mensaje.textContent =
      "Revisa los campos marcados antes de guardar.";

    mensaje.classList.add("error");
  }

  function actualizarLimitesTiempo(inputId, unidadId) {
    const input = $(inputId);
    const unidad = $(unidadId).value;

    input.min = "1";
    input.max = unidad === "dias" ? "30" : "720";
  }

  function limpiarErrorTiempo(errorId, controles) {
    $(errorId).textContent = "";

    for (const id of controles) {
      $(id).removeAttribute("aria-invalid");
    }

    limpiarMensaje();
  }

  async function cargarConfiguracion() {
    limpiarErrores();
    habilitarFormulario(false);
    mensaje.textContent = "Cargando configuración…";

    try {
      const configuracion =
        await api.configuracionEnvio.obtener();

      cargarValores(configuracion);
      limpiarErrores();
      habilitarFormulario(true);

    } catch (error) {
      if (error.estado === 403 || error.codigo === "SIN_PERMISO") {
        botonAbrir.hidden = true;
        cerrarPanel();
        return;
      }

      mensaje.textContent =
        "No se pudo cargar la configuración del servidor. Inténtalo nuevamente.";

      mensaje.classList.add("error");
    }
  }

  function abrirPanel() {
    if (!esAdministrador || botonAbrir.hidden) return;

    panel.hidden = false;
    botonAbrir.setAttribute("aria-expanded", "true");
    botonCerrar.focus();

    cargarConfiguracion();
  }

  function cerrarPanel() {
    panel.hidden = true;
    botonAbrir.setAttribute("aria-expanded", "false");

    if (!botonAbrir.hidden) {
      botonAbrir.focus();
    } else {
      $("nav-mensajes")?.focus();
    }
  }

  async function guardarConfiguracion(evento) {
    evento.preventDefault();

    if (guardando) return;

    limpiarErrores();

    const configuracion = leerConfiguracionFormulario();
    const resultado = validarConfiguracion(configuracion);

    if (!resultado.valido) {
      mostrarErrores(resultado.errores);
      return;
    }

    guardando = true;
    habilitarFormulario(false);
    botonGuardar.textContent = "Guardando…";
    mensaje.textContent = "Guardando configuración…";

    try {
      const guardada =
        await api.configuracionEnvio.guardar(configuracion);

      cargarValores(guardada);

      mensaje.textContent =
        "Configuración guardada correctamente.";

      mensaje.classList.add("exito");

    } catch (error) {
      if (error.codigo === "CONFIGURACION_INVALIDA" && error.errores) {
        mostrarErrores(error.errores);

      } else if (
        error.estado === 403 ||
        error.codigo === "SIN_PERMISO"
      ) {
        botonAbrir.hidden = true;

        mensaje.textContent =
          "Tu cuenta ya no tiene permisos para modificar esta configuración.";

        mensaje.classList.add("error");
        cerrarPanel();

      } else {
        mensaje.textContent =
          "No se pudo guardar la configuración. Tus cambios siguen disponibles para reintentar.";

        mensaje.classList.add("error");
      }

    } finally {
      guardando = false;
      habilitarFormulario(true);
      botonGuardar.textContent = "Guardar";
    }
  }

  botonAbrir.addEventListener("click", abrirPanel);
  botonCerrar.addEventListener("click", cerrarPanel);
  formulario.addEventListener("submit", guardarConfiguracion);

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !panel.hidden) {
      cerrarPanel();
    }
  });

  const controlesRespuesta = [
    "cfg-respuesta-valor",
    "cfg-respuesta-unidad"
  ];

  const controlesContacto = [
    "cfg-contacto-valor",
    "cfg-contacto-unidad"
  ];

  $("cfg-respuesta-unidad").addEventListener("change", () => {
    actualizarLimitesTiempo(
      "cfg-respuesta-valor",
      "cfg-respuesta-unidad"
    );

    limpiarErrorTiempo("error-respuesta", controlesRespuesta);
  });

  $("cfg-contacto-unidad").addEventListener("change", () => {
    actualizarLimitesTiempo(
      "cfg-contacto-valor",
      "cfg-contacto-unidad"
    );

    limpiarErrorTiempo("error-contacto", controlesContacto);
  });

  for (const control of [horaInicio, horaFin]) {
    control.addEventListener("input", () => {
      limpiarErrorTiempo("error-jornada", ["cfg-horario-inicio", "cfg-horario-fin"]);
    });
  }

  $("cfg-respuesta-valor").addEventListener("input", () => {
    limpiarErrorTiempo("error-respuesta", controlesRespuesta);
  });

  $("cfg-contacto-valor").addEventListener("input", () => {
    limpiarErrorTiempo("error-contacto", controlesContacto);
  });

  // EQ-109 / EQ-110: controles para aumentar o disminuir valores.
  for (const boton of document.querySelectorAll(".boton-stepper")) {
    boton.addEventListener("click", () => {
      const input = $(boton.dataset.target);
      if (!input) return;

      const paso = Number(boton.dataset.step);
      const minimo = Number(input.min || 1);
      const maximo = Number(input.max || 720);
      const valorActual = Number(input.value || minimo);

      input.value = String(
        Math.min(maximo, Math.max(minimo, valorActual + paso))
      );

      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}
