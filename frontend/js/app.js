/**
 * Monitoreo de aspirantes (HU 2 y HU 3).
 *   EQ-26 · HU2-1 / HU2-8 / HU2-10 → tabla con semáforo, orden, paginación y estados
 *   EQ-40 · HU3-1 / HU3-6 / HU3-8  → panel de contacto y de actividades (historial)
 */
import { api } from "./api.js";

const TAMANO = 13;
const ETIQUETA_SEMAFORO = { ROJO: "Rojo", NARANJA: "Naranja", AMARILLO: "Amarillo", VERDE: "Verde" };
const FORMATO_FECHA = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
const FORMATO_HORA = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });

const estado = {
  pagina: 1,
  ordenarPor: "semaforo",
  direccion: "desc",
  busqueda: "",
  incluirCerrados: false,
  aspiranteId: null,
  solicitud: 0, // para descartar respuestas viejas
};

const $ = (id) => document.getElementById(id);
const tabla = $("tabla");
const cuerpo = $("cuerpo-tabla");
const estadoTabla = $("estado-tabla");

// ---------- Utilidades ----------

function fechaCorta(iso) {
  if (!iso) return "—";
  return FORMATO_FECHA.format(new Date(iso));
}

/** «Hace 3 días», «Hace 23 horas», «Hace 57 minutos», como en el Figma. */
function haceCuanto(iso) {
  if (!iso) return "Sin actividad";
  const segundos = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  const unidades = [
    ["año", 31536000], ["mes", 2592000], ["semana", 604800],
    ["día", 86400], ["hora", 3600], ["minuto", 60], ["segundo", 1],
  ];
  for (const [nombre, s] of unidades) {
    const n = Math.floor(segundos / s);
    if (n >= 1) {
      const plural = n === 1 ? "" : (nombre === "mes" ? "es" : "s");
      const etiqueta = nombre === "día" && n !== 1 ? "días" : `${nombre}${plural}`;
      return `Hace ${n} ${etiqueta}`;
    }
  }
  return "Hace un momento";
}

function elemento(etiqueta, atributos = {}, hijos = []) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos)) {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const h of hijos) el.append(h);
  return el;
}

function punto(nivel) {
  // El color lo complementa el texto oculto, para no depender solo del color.
  return elemento("span", { class: `semaforo` }, [
    elemento("span", { class: `semaforo-punto ${nivel}`, "aria-hidden": "true" }),
    elemento("span", { class: "sin-texto", text: ETIQUETA_SEMAFORO[nivel] ?? nivel }),
  ]);
}

// ---------- Tabla (EQ-26) ----------

function mostrarEstadoTabla(tipo, mensaje, { reintentar = null, restablecer = null } = {}) {
  tabla.hidden = true;
  $("paginacion").hidden = true;
  estadoTabla.hidden = false;
  estadoTabla.className = `estado-tabla ${tipo}`;
  estadoTabla.replaceChildren(elemento("p", { text: mensaje }));
  if (reintentar) estadoTabla.append(elemento("button", { type: "button", class: "boton", text: "Reintentar", onclick: reintentar }));
  if (restablecer) estadoTabla.append(elemento("button", { type: "button", class: "boton", text: "Restablecer filtros", onclick: restablecer }));
}

function ocultarEstadoTabla() {
  estadoTabla.hidden = true;
  estadoTabla.replaceChildren();
}

function mostrarCargando() {
  tabla.hidden = true;
  $("paginacion").hidden = true;
  estadoTabla.hidden = false;
  estadoTabla.className = "estado-tabla";
  estadoTabla.replaceChildren(elemento("p", { text: "Cargando aspirantes…", role: "status" }));
}

function actualizarEncabezados() {
  for (const boton of document.querySelectorAll(".orden")) {
    const activo = boton.dataset.columna === estado.ordenarPor;
    boton.setAttribute("aria-sort", activo ? (estado.direccion === "asc" ? "ascending" : "descending") : "none");
  }
}

function pintarFilas(datos) {
  cuerpo.replaceChildren(...datos.map((a) => {
    const fila = elemento("tr", { "data-id": a.id, tabindex: "0", "aria-selected": String(a.id === estado.aspiranteId) });
    fila.append(
      elemento("td", {}, [punto(a.semaforo.nivel)]),
      elemento("td", { text: a.nombre }),
      elemento("td", { text: a.carrera }),
      elemento("td", { text: a.preparatoria }),
      elemento("td", { text: fechaCorta(a.fechaSolicitud) }),
      elemento("td", { text: haceCuanto(a.ultimaActividad) }),
    );
    fila.addEventListener("click", () => abrirPanel(a.id));
    fila.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirPanel(a.id); } });
    return fila;
  }));
}

async function cargarTabla() {
  const solicitud = ++estado.solicitud;
  mostrarCargando();
  try {
    const { datos, paginacion } = await api.listarAspirantes({
      pagina: estado.pagina,
      tamano: TAMANO,
      ordenarPor: estado.ordenarPor,
      direccion: estado.direccion,
      incluirCerrados: estado.incluirCerrados,
    });
    if (solicitud !== estado.solicitud) return; // llegó una respuesta vieja

    // La búsqueda por nombre se aplica en el cliente sobre la página ya cargada,
    // hasta que HU2-4 la mueva al servidor.
    const termino = normalizar(estado.busqueda);
    const filtrados = termino ? datos.filter((a) => normalizar(a.nombre).includes(termino)) : datos;

    if (paginacion.totalResultados === 0) {
      mostrarEstadoTabla("", "No hay aspirantes en tu cartera.");
      return;
    }
    if (filtrados.length === 0) {
      mostrarEstadoTabla("", "No se encontraron resultados.", {
        restablecer: () => { estado.busqueda = ""; $("buscar").value = ""; estado.incluirCerrados = false; $("incluir-cerrados").checked = false; estado.pagina = 1; cargarTabla(); },
      });
      return;
    }

    ocultarEstadoTabla();
    tabla.hidden = false;
    pintarFilas(filtrados);
    actualizarEncabezados();
    actualizarPaginacion(paginacion);
  } catch (error) {
    if (solicitud !== estado.solicitud) return;
    mostrarEstadoTabla("error", "No pudimos cargar los aspirantes. Revisa tu conexión e inténtalo de nuevo.", { reintentar: cargarTabla });
    console.error(error);
  }
}

function actualizarPaginacion({ pagina, totalPaginas }) {
  const nav = $("paginacion");
  nav.hidden = totalPaginas <= 1;
  $("anterior").disabled = pagina <= 1;
  $("siguiente").disabled = pagina >= totalPaginas;
  $("indicador-pagina").textContent = `Página ${pagina} de ${totalPaginas}`;
}

function normalizar(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// ---------- Panel (EQ-40) ----------

function pintarContacto(d) {
  const vista = $("vista-contacto");
  const campo = (titulo, valor) => elemento("div", { class: "campo" }, [
    elemento("dt", { text: titulo }),
    elemento("dd", { text: valor ?? "—" }),
  ]);
  vista.replaceChildren(
    elemento("div", { class: "campo" }, [
      elemento("dt", { text: "Semáforo:" }),
      elemento("dd", { class: "semaforo-detalle" }, [
        elemento("span", { class: `semaforo-punto ${d.semaforo.nivel}`, "aria-hidden": "true" }),
        elemento("span", { text: d.semaforo.texto }),
      ]),
    ]),
    campo("Estatus:", d.estado.texto),
    campo("Carrera solicitada:", d.carrera),
    campo("Preparatoria:", d.preparatoria),
    campo("Fecha de solicitud:", fechaCorta(d.fechaSolicitud)),
    campo("Teléfono:", d.telefono),
    campo("Correo electrónico:", d.correo),
  );
}

function pintarActividades(datos) {
  const lista = $("lista-actividades");
  $("sin-actividades").hidden = datos.length > 0;
  lista.replaceChildren(...datos.map((a) => elemento("li", { class: `evento ${a.tipo}` }, [
    elemento("div", { class: "tipo", text: etiquetaTipo(a.tipo) }),
    elemento("p", { text: a.texto }),
    elemento("time", { datetime: a.fecha, text: `${fechaCorta(a.fecha)} · ${FORMATO_HORA.format(new Date(a.fecha))}` }),
  ])));
}

function etiquetaTipo(tipo) {
  return { MENSAJE_ENVIADO: "Mensaje", CONSTANCIA_ENTREGADA: "Constancia", RECHAZO: "Rechazo" }[tipo] ?? "Actividad";
}

async function cargarActividades() {
  const id = estado.aspiranteId;
  if (!id) return;
  const rango = {};
  if ($("desde").value) rango.desde = new Date($("desde").value + "T00:00:00").toISOString();
  if ($("hasta").value) rango.hasta = new Date($("hasta").value + "T23:59:59").toISOString();
  try {
    const { datos } = await api.actividades(id, rango);
    if (id !== estado.aspiranteId) return;
    pintarActividades(datos);
  } catch (error) {
    if (id !== estado.aspiranteId) return;
    $("lista-actividades").replaceChildren();
    $("sin-actividades").hidden = false;
    $("sin-actividades").textContent = error.codigo === "SIN_PERMISO"
      ? "No tienes permiso para ver este aspirante."
      : "No pudimos cargar el historial. Inténtalo de nuevo.";
  }
}

function seleccionarPestana(nombre) {
  const esContacto = nombre === "contacto";
  $("pestana-contacto").setAttribute("aria-selected", String(esContacto));
  $("pestana-contacto").classList.toggle("activa", esContacto);
  $("pestana-actividades").setAttribute("aria-selected", String(!esContacto));
  $("pestana-actividades").classList.toggle("activa", !esContacto);
  $("vista-contacto").hidden = !esContacto;
  $("vista-actividades").hidden = esContacto;
  if (!esContacto) cargarActividades();
}

async function abrirPanel(id) {
  estado.aspiranteId = id;
  for (const fila of cuerpo.querySelectorAll("tr")) {
    fila.setAttribute("aria-selected", String(fila.dataset.id === id));
  }
  $("panel").hidden = false;
  seleccionarPestana("contacto");
  $("vista-contacto").replaceChildren(elemento("p", { class: "ayuda", text: "Cargando…" }));
  try {
    const detalle = await api.detalle(id);
    if (id !== estado.aspiranteId) return;
    $("panel-nombre").textContent = detalle.nombre;
    pintarContacto(detalle);
  } catch (error) {
    if (id !== estado.aspiranteId) return;
    $("panel-nombre").textContent = "Aspirante";
    $("vista-contacto").replaceChildren(elemento("p", {
      class: "ayuda",
      text: error.codigo === "SIN_PERMISO" ? "Este aspirante no está en tu cartera." : "No se encontró el aspirante.",
    }));
  }
}

function cerrarPanel() {
  estado.aspiranteId = null;
  $("panel").hidden = true;
  for (const fila of cuerpo.querySelectorAll("tr")) fila.setAttribute("aria-selected", "false");
}

// ---------- Eventos ----------

function configurarEventos() {
  for (const boton of document.querySelectorAll(".orden")) {
    boton.addEventListener("click", () => {
      const columna = boton.dataset.columna;
      if (estado.ordenarPor === columna) {
        estado.direccion = estado.direccion === "asc" ? "desc" : "asc";
      } else {
        estado.ordenarPor = columna;
        estado.direccion = columna === "semaforo" ? "desc" : "asc";
      }
      estado.pagina = 1;
      cargarTabla();
    });
  }

  $("anterior").addEventListener("click", () => { estado.pagina -= 1; cargarTabla(); });
  $("siguiente").addEventListener("click", () => { estado.pagina += 1; cargarTabla(); });

  let temporizador;
  $("buscar").addEventListener("input", (e) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { estado.busqueda = e.target.value; cargarTabla(); }, 250);
  });

  $("incluir-cerrados").addEventListener("change", (e) => {
    estado.incluirCerrados = e.target.checked;
    estado.pagina = 1;
    cargarTabla();
  });

  $("pestana-contacto").addEventListener("click", () => seleccionarPestana("contacto"));
  $("pestana-actividades").addEventListener("click", () => seleccionarPestana("actividades"));
  $("desde").addEventListener("change", cargarActividades);
  $("hasta").addEventListener("change", cargarActividades);
  $("cerrar-panel").addEventListener("click", cerrarPanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("panel").hidden) cerrarPanel(); });
}

async function iniciar() {
  configurarEventos();
  try {
    const sesion = await api.sesion();
    $("nombre-usuario").textContent = sesion.nombre;
  } catch {
    $("nombre-usuario").textContent = "Sin sesión";
  }
  cargarTabla();
}

iniciar();
