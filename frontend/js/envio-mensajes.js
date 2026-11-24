import { obtenerLote, validarFiltros } from "./envio-mensajes-validaciones.js";

const $ = (id) => document.getElementById(id);
const ahora = () => new Date();
const diasAtras = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

const DEMO = [
  ["d01","AMARILLO","Ingeniería en Software","EN_PROCESO",9,72,true,true,true],
  ["d02","NARANJA","Ingeniería Industrial","EN_PROCESO",12,96,true,true,false],
  ["d03","ROJO","Ingeniería en Mecatrónica","EN_PROCESO",18,120,true,true,true],
  ["d04","AMARILLO","Ingeniería en Electrónica","EN_PROCESO",21,80,true,true,true],
  ["d05","NARANJA","Ingeniería en Software","EN_PROCESO",25,96,true,true,true],
  ["d06","ROJO","Ingeniería Industrial","EN_PROCESO",32,120,true,true,true],
  ["d07","AMARILLO","Ingeniería en Mecatrónica","EN_PROCESO",15,72,true,true,false],
  ["d08","NARANJA","Ingeniería en Electrónica","EN_PROCESO",42,96,true,true,true],
  ["d09","ROJO","Ingeniería en Software","EN_PROCESO",50,96,true,true,true],
  ["d10","AMARILLO","Ingeniería Industrial","EN_PROCESO",60,96,true,true,true],
  ["d11","VERDE","Ingeniería en Software","EN_PROCESO",2,96,true,true,true],
  ["d12","ROJO","Ingeniería en Mecatrónica","ACEPTADA",40,96,true,true,true],
  ["d13","NARANJA","Ingeniería en Electrónica","RECHAZADA",35,96,true,true,true],
  ["d14","ROJO","Ingeniería en Software","EN_PROCESO",14,24,true,true,true],
  ["d15","AMARILLO","Ingeniería Industrial","EN_PROCESO",28,96,false,false,true],
  ["d16","NARANJA","Ingeniería en Mecatrónica","EN_PROCESO",45,96,true,false,true],
].map(([id,semaforo,carrera,estado,dias,hours,whatsappValido,consentimientoWhatsapp,correoValido]) => ({
  id, semaforo, carrera, estado, enCartera:true, ultimaActividad:diasAtras(dias),
  horasDesdeContacto:hours, whatsappValido, consentimientoWhatsapp, correoValido,
}));

export function inicializarEnvioMensajes({ esAdministrador = false } = {}) {
  const tarjeta = $("tarjeta-envio-automatico");
  const modal = $("envio-modal");
  if (!tarjeta || !modal) return;
  if (esAdministrador) {
    tarjeta.hidden = true;
    return;
  }

  const selects = [...modal.querySelectorAll(".envio-dropdown")];
  let escenario = "normal";
  let enviando = false;
  let resultadoVisible = false;

  const filtros = () => ({
    semaforos: selects[0].querySelectorAll("input:checked").length
      ? [...selects[0].querySelectorAll("input:checked")].map((x) => x.value) : [],
    carreras: [...selects[1].querySelectorAll("input:checked")].map((x) => x.value),
    numero: Number($("envio-numero").value),
    unidad: $("envio-unidad").value,
    correo: $("envio-correo").checked,
  });

  function cerrarDropdowns(excepto = null) {
    selects.forEach((drop) => {
      if (drop === excepto) return;
      drop.querySelector(".envio-dropdown-menu").hidden = true;
      drop.querySelector(".envio-dropdown-trigger").setAttribute("aria-expanded", "false");
    });
  }

  function actualizarEtiquetas() {
    selects.forEach((drop) => {
      const checks = [...drop.querySelectorAll("input:checked")];
      const total = drop.querySelectorAll("input").length;
      const label = checks.length === total ? (drop.dataset.dropdown === "carreras" ? "Todas" : "Todos")
        : checks.length === 0 ? "Ninguno" : checks.length === 1 ? checks[0].parentElement.textContent.trim()
        : `${checks.length} seleccionados`;
      const trigger = drop.querySelector(".envio-dropdown-trigger");
      trigger.replaceChildren(document.createTextNode(`${label} `));
      const arrow = document.createElement("span");
      arrow.textContent = "▾";
      trigger.append(arrow);
    });
  }

  function contar() {
    const f = filtros();
    const lote = obtenerLote(DEMO, f, ahora());
    const count = escenario === "cero" ? 0 : lote.length;
    $("envio-conteo").textContent = `${count} aspirante${count === 1 ? "" : "s"} ${count === 1 ? "será" : "serán"} notificado${count === 1 ? "" : "s"}.`;
    const alerta = $("envio-alerta");
    alerta.hidden = false;
    if (!validarFiltros(f)) {
      alerta.textContent = "Selecciona al menos un semáforo, una carrera y un tiempo de inactividad válido.";
    } else if (escenario === "fuera") {
      alerta.textContent = "Fuera del horario permitido. Puedes preparar el lote, pero no enviarlo.";
    } else if (!count) {
      alerta.textContent = "No hay aspirantes que cumplan los criterios seleccionados.";
    } else {
      alerta.hidden = true;
      alerta.textContent = "";
    }
    $("confirmar-envio").disabled = enviando || resultadoVisible || !count || escenario === "fuera" || !validarFiltros(f);
    return lote;
  }

  function abrir() {
    modal.hidden = false;
    document.body.classList.add("envio-modal-abierto");
    $("envio-numero").value = "7";
    $("envio-unidad").value = "dias";
    $("envio-correo").checked = false;
    selects.forEach((d) => d.querySelectorAll("input").forEach((c) => { c.checked = true; }));
    escenario = $("envio-escenario").value;
    enviando = false;
    resultadoVisible = false;
    $("envio-progreso").hidden = true;
    $("envio-resultado").hidden = true;
    $("envio-plantillas").hidden = false;
    cerrarDropdowns();
    actualizarEtiquetas();
    contar();
    $("cerrar-envio").focus();
  }

  function cerrar() {
    modal.hidden = true;
    document.body.classList.remove("envio-modal-abierto");
    cerrarDropdowns();
    $("abrir-envio-automatico").focus();
  }

  selects.forEach((drop) => {
    const trigger = drop.querySelector(".envio-dropdown-trigger");
    trigger.addEventListener("click", () => {
      const menu = drop.querySelector(".envio-dropdown-menu");
      const abrirMenu = menu.hidden;
      cerrarDropdowns(drop);
      menu.hidden = !abrirMenu;
      trigger.setAttribute("aria-expanded", String(abrirMenu));
    });
    drop.querySelectorAll("input").forEach((check) => check.addEventListener("change", () => {
      actualizarEtiquetas();
      contar();
    }));
  });

  document.addEventListener("click", (event) => {
    if (!modal.hidden && !event.target.closest(".envio-dropdown")) cerrarDropdowns();
  });
  $("envio-unidad").addEventListener("mousedown", () => cerrarDropdowns());
  $("envio-numero").addEventListener("focus", () => cerrarDropdowns());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      if (selects.some((d) => !d.querySelector(".envio-dropdown-menu").hidden)) cerrarDropdowns();
      else cerrar();
    }
  });

  $("abrir-envio-automatico").addEventListener("click", abrir);
  $("cerrar-envio").addEventListener("click", cerrar);
  $("cancelar-envio").addEventListener("click", cerrar);
  $("envio-modal").addEventListener("click", (event) => { if (event.target === modal) cerrar(); });
  $("envio-escenario").addEventListener("change", (event) => {
    escenario = event.target.value;
    if (!modal.hidden) contar();
    $("envio-horario").textContent = escenario === "fuera"
      ? "Horario de demostración: fuera del horario permitido"
      : "Horario de demostración: 08:00 a 18:00";
  });
  ["envio-numero", "envio-unidad", "envio-correo"].forEach((id) => {
    $(id).addEventListener("input", contar);
    $(id).addEventListener("change", contar);
  });
  $("envio-menos").addEventListener("click", () => {
    $("envio-numero").value = Math.max(1, Number($("envio-numero").value || 1) - 1);
    contar();
  });
  $("envio-mas").addEventListener("click", () => {
    $("envio-numero").value = Math.min(365, Number($("envio-numero").value || 1) + 1);
    contar();
  });

  $("confirmar-envio").addEventListener("click", () => {
    const lote = contar();
    if (!lote.length || escenario !== "normal" || enviando) return;
    enviando = true;
    $("confirmar-envio").disabled = true;
    $("envio-plantillas").hidden = true;
    $("envio-progreso").hidden = false;
    $("envio-resultado").hidden = true;
    window.setTimeout(() => {
      enviando = false;
      resultadoVisible = true;
      $("envio-progreso").hidden = true;
      const correo = $("envio-correo").checked;
      $("envio-resultado").hidden = false;
      $("envio-resultado").textContent = `Simulación finalizada: ${lote.length} aspirantes procesados. Canales habilitados: WhatsApp${correo ? " y correo cuando el aspirante cuenta con dirección válida" : ""}. No se transmitió ningún mensaje real.`;
      $("confirmar-envio").disabled = true;
    }, 900);
  });

  actualizarEtiquetas();
}
