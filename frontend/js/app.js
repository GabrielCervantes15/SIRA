/**
 * Monitoreo de aspirantes (HU 2 y HU 3).
 *   EQ-26 · HU2-1 / HU2-8 / HU2-10 → tabla con semáforo, orden, paginación y estados
 *   EQ-40 · HU3-1 / HU3-6 / HU3-8  → panel de contacto y de actividades (historial)
 *   EQ-36 · HU2-11                 → abrir el expediente al seleccionar (y desde la URL)
 */
import { api } from "./api.js";
import { aspiranteDesdeUrl, urlConAspirante } from "./expediente-url.js";
import { inicialesUsuario } from "./usuario.js";
import { inicializarConfiguracionMensajes } from "./configuracion-mensajes.js";
import { inicializarEnvioMensajes } from "./envio-mensajes.js";

const TAMANO = 13;
const ETIQUETA_SEMAFORO = { ROJO: "Rojo", NARANJA: "Naranja", VERDE: "Verde" };
const FORMATO_FECHA = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
const FORMATO_HORA = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });

const estado = {
  pagina: 1,
  ordenarPor: "semaforo",
  direccion: "desc",
  busqueda: "",
  incluirAceptados: false,
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
    if (k === "onclick" && typeof v === "function") el.addEventListener("click", v);
    else if (k === "class") el.className = v;
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
      incluirAceptados: estado.incluirAceptados,
      busqueda: estado.busqueda,
    });
    if (solicitud !== estado.solicitud) return; // llegó una respuesta vieja

    // La búsqueda se realiza en el servidor antes de paginar (HU2-4).
    const filtrados = datos;

    if (paginacion.totalResultados === 0) {
      mostrarEstadoTabla("", "No hay aspirantes en tu cartera.");
      return;
    }
    if (filtrados.length === 0) {
      mostrarEstadoTabla("", "No se encontraron resultados.", {
        restablecer: () => { estado.busqueda = ""; $("buscar").value = ""; estado.incluirAceptados = false; $("incluir-aceptados").checked = false; estado.pagina = 1; cargarTabla(); },
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
  // RECHAZO_SOLICITUD y CAMBIO_ESTADO/NOTA_SEGUIMIENTO son los nombres reales
  // del historial integrado (datos-semilla/aspirantes.json); RECHAZO se deja
  // por compatibilidad con datos más antiguos.
  return {
    MENSAJE_ENVIADO: "Mensaje",
    CONSTANCIA_ENTREGADA: "Constancia",
    RECHAZO: "Rechazo",
    RECHAZO_SOLICITUD: "Rechazo",
    CAMBIO_ESTADO: "Estado",
    NOTA_SEGUIMIENTO: "Seguimiento",
  }[tipo] ?? "Actividad";
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

// EQ-46 · HU3-7: vista de mensajería, de solo lectura en este sprint.
function pintarChat(mensajes) {
  const lista = $("lista-chat");
  $("sin-chat").hidden = mensajes.length > 0;
  lista.replaceChildren(...mensajes.map((m) => elemento("li", { class: `burbuja ${m.direccion}` }, [
    elemento("div", { class: "remitente", text: etiquetaRemitente(m.remitenteTipo) }),
    elemento("p", { text: m.contenido }),
    elemento("time", { datetime: m.fecha, text: `${fechaCorta(m.fecha)} · ${FORMATO_HORA.format(new Date(m.fecha))}` }),
  ])));
}

function etiquetaRemitente(tipo) {
  return { ASPIRANTE: "Aspirante", COLABORADOR: "Colaborador", BOT_IA: "Mensaje automático", SISTEMA: "Sistema" }[tipo] ?? tipo;
}

async function cargarChat() {
  const id = estado.aspiranteId;
  if (!id) return;
  try {
    const { datos } = await api.conversacion(id);
    if (id !== estado.aspiranteId) return;
    // Orden cronológico (el más antiguo primero), como en una conversación real.
    pintarChat([...datos].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)));
  } catch (error) {
    if (id !== estado.aspiranteId) return;
    $("lista-chat").replaceChildren();
    $("sin-chat").hidden = false;
    $("sin-chat").textContent = error.codigo === "SIN_PERMISO"
      ? "No tienes permiso para ver este aspirante."
      : "No pudimos cargar la conversación. Inténtalo de nuevo.";
  }
}

const PESTANAS = ["contacto", "actividades", "chat"];

function seleccionarPestana(nombre) {
  for (const otra of PESTANAS) {
    const activa = otra === nombre;
    $(`pestana-${otra}`).setAttribute("aria-selected", String(activa));
    $(`pestana-${otra}`).classList.toggle("activa", activa);
    $(`vista-${otra}`).hidden = !activa;
  }
  if (nombre === "actividades") cargarActividades();
  if (nombre === "chat") cargarChat();
}

function recordarEnUrl(id) {
  try {
    window.history.replaceState(null, "", urlConAspirante(window.location.href, id));
  } catch {
    // Sin History API (p. ej. vista incrustada): el panel funciona igual.
  }
}

async function abrirPanel(id) {
  estado.aspiranteId = id;
  recordarEnUrl(id);
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
  recordarEnUrl(null);
  $("panel").hidden = true;
  for (const fila of cuerpo.querySelectorAll("tr")) fila.setAttribute("aria-selected", "false");
}

// ---------- HU 9 (EQ-109, EQ-110): configuración de envío ----------

const VISTAS = {
  monitoreo: "nav-aspirantes",
  "mensajes-ia": "nav-mensajes",
};

function mostrarVista(nombre) {
  document.querySelector(".monitoreo").hidden = nombre !== "monitoreo";
  $("vista-mensajes-ia").hidden = nombre !== "mensajes-ia";
  for (const [clave, idNav] of Object.entries(VISTAS)) {
    $(idNav).classList.toggle("activo", clave === nombre);
    $(idNav).setAttribute("aria-current", clave === nombre ? "page" : "false");
  }
  if (nombre === "mensajes-ia") cargarMensajesIA();
}

// ---------- HU 8 (EQ-98, EQ-99): mensajes predefinidos de la IA ----------

const estadoMensajesIA = { categoria: "ENVIO", pagina: 1, semaforo: "" };

function pintarLlave(llave) {
  return elemento("span", { class: "mia-llave" }, [
    elemento("span", { class: "mia-llave-tipo", text: `${llave.tipo}:` }),
    elemento("span", { class: "mia-llave-valor", text: llave.valor }),
  ]);
}

function pintarTarjetaMensaje(m) {
  return elemento("article", { class: "mia-tarjeta" }, [
    elemento("p", { class: "mia-etiqueta", text: "Llaves:" }),
    elemento("div", { class: "mia-llaves" }, m.llaves.map(pintarLlave)),
    elemento("p", { class: "mia-etiqueta", text: "Mensaje:" }),
    elemento("p", { class: "mia-mensaje", text: m.mensaje }),
  ]);
}

async function cargarMensajesIA() {
  $("mia-cat-envio").classList.toggle("activo", estadoMensajesIA.categoria === "ENVIO");
  $("mia-cat-respuesta").classList.toggle("activo", estadoMensajesIA.categoria === "RESPUESTA");
  try {
    const r = await api.mensajesIA.listar({
      categoria: estadoMensajesIA.categoria,
      semaforo: estadoMensajesIA.semaforo || undefined,
      pagina: estadoMensajesIA.pagina,
      tamano: 9,
    });
    $("mia-total").textContent = r.totalGeneral;
    const totalPaginas = Math.max(1, Math.ceil(r.totalCategoria / r.tamano));
    $("mia-indicador").textContent = r.totalCategoria === 0 ? "" : `${r.pagina} de ${totalPaginas}`;
    $("mia-anterior").disabled = r.pagina <= 1;
    $("mia-siguiente").disabled = r.pagina >= totalPaginas;
    $("mia-tarjetas").replaceChildren(...r.datos.map(pintarTarjetaMensaje));
    $("mia-sin-resultados").hidden = r.datos.length > 0;
  } catch (error) {
    $("mia-tarjetas").replaceChildren();
    $("mia-sin-resultados").hidden = false;
    $("mia-sin-resultados").textContent = "No se pudo cargar el catálogo de mensajes.";
  }
}

// ---------- Eventos ----------

function configurarEventos() {
  $("nav-aspirantes").addEventListener("click", (e) => { e.preventDefault(); mostrarVista("monitoreo"); });
  $("nav-mensajes").addEventListener("click", (e) => { e.preventDefault(); mostrarVista("mensajes-ia"); });
  $("mia-cat-envio").addEventListener("click", () => { estadoMensajesIA.categoria = "ENVIO"; estadoMensajesIA.pagina = 1; cargarMensajesIA(); });
  $("mia-cat-respuesta").addEventListener("click", () => { estadoMensajesIA.categoria = "RESPUESTA"; estadoMensajesIA.pagina = 1; cargarMensajesIA(); });
  $("mia-filtro-semaforo").addEventListener("change", (e) => { estadoMensajesIA.semaforo = e.target.value; estadoMensajesIA.pagina = 1; cargarMensajesIA(); });
  $("mia-anterior").addEventListener("click", () => { estadoMensajesIA.pagina -= 1; cargarMensajesIA(); });
  $("mia-siguiente").addEventListener("click", () => { estadoMensajesIA.pagina += 1; cargarMensajesIA(); });

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

  $("incluir-aceptados").addEventListener("change", (e) => {
    estado.incluirAceptados = e.target.checked;
    estado.pagina = 1;
    cargarTabla();
  });

  $("pestana-contacto").addEventListener("click", () => seleccionarPestana("contacto"));
  $("pestana-actividades").addEventListener("click", () => seleccionarPestana("actividades"));
  $("pestana-chat").addEventListener("click", () => seleccionarPestana("chat"));
  $("desde").addEventListener("change", cargarActividades);
  $("hasta").addEventListener("change", cargarActividades);
  $("cerrar-panel").addEventListener("click", cerrarPanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("panel").hidden) cerrarPanel(); });
}

let validandoSesion = false;
async function revisarSesion() {
  if (validandoSesion) return;
  validandoSesion = true;
  try {
    await api.sesion();
  } catch (error) {
    if (error.estado === 401) window.location.replace('/?expired=1');
  } finally {
    validandoSesion = false;
  }
}

async function iniciar() {
  try {
    const sesion = await api.sesion();
    $("nombre-usuario").textContent = sesion.nombre;
    $("avatar-usuario").textContent = inicialesUsuario(sesion.nombre);
    inicializarConfiguracionMensajes({
      api,
      esAdministrador: sesion.usuario?.rol === "administrador",
    });
    inicializarEnvioMensajes({
      esAdministrador: sesion.usuario?.rol === "administrador",
    });
    // EQ-71: los dos roles ven el listado de colaboradores; el administrador entra a la vista
    // con registro e inactivación, el colaborador a la de solo consulta (Figma).
    const enlace = $("nav-colaboradores");
    const esAdministrador = sesion.usuario?.rol === "administrador";
    enlace.href = esAdministrador ? "/app/colaboradores/registro.html" : "/app/colaboradores/listado.html";
    enlace.removeAttribute("aria-disabled");
    enlace.title = esAdministrador ? "Listado y registro de colaboradores" : "Listado de colaboradores";
  } catch (error) {
    if (error.estado === 401) window.location.replace('/?expired=1');
    else $("nombre-usuario").textContent = "Sin conexión al servicio de sesión";
    return;
  }
  configurarEventos();
  $("cerrar-sesion").addEventListener("click", async () => {
    $("cerrar-sesion").disabled = true;
    try {
      await api.cerrarSesion();
      window.location.replace('/');
    } catch (error) {
      $("cerrar-sesion").disabled = false;
      window.alert("No se pudo cerrar la sesión. Inténtalo nuevamente.");
    }
  });
  cargarTabla();
  // Desde la pantalla de Colaboradores, «Mensajes» llega como /app?vista=mensajes.
  if (new URLSearchParams(window.location.search).get("vista") === "mensajes") mostrarVista("mensajes-ia");
  // EQ-36: si la URL trae ?aspirante=ID se abre su expediente (403/404 se informan en el panel).
  const aspiranteInicial = aspiranteDesdeUrl(window.location.href);
  if (aspiranteInicial) abrirPanel(aspiranteInicial);
  window.setInterval(revisarSesion, 5000);
}

iniciar();
