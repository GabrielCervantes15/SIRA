/**
 * Monitoreo de aspirantes, Alertas dinámicas y Ventana de Chat WhatsApp (HU 2, HU 3 y HU 4).
 *   EQ-26 · HU2-1 / HU2-8 / HU2-9 / HU2-10 → tabla con semáforo, filtros combinables, orden, paginación numerada y estado vacío
 *   EQ-40 · HU3-1 / HU3-6 / HU3-8          → panel flotante de contacto y actividades (con filtro de fechas y limpiar filtros)
 *   EQ-46 · HU3-7 / HU4                    → alertas y conversaciones reales de la cartera del colaborador autenticado
 */
import { api } from "./api.js";

const TAMANO = 13;
const ETIQUETA_SEMAFORO = { ROJO: "Rojo", NARANJA: "Naranja", AMARILLO: "Amarillo", VERDE: "Verde" };
const ETIQUETA_ESTADO_FILTRO = {
  RECIBIDA: "Recibida",
  EN_REVISION: "En revisión",
  CONSTANCIA_RECHAZADA: "Constancia rechazada",
  ACEPTADA: "Aceptada",
  RECHAZADA: "Rechazada",
};
const ETIQUETA_CRITERIO = {
  semaforo: "Semáforo",
  carrera: "Carrera",
  preparatoria: "Preparatoria",
  periodo: "Período",
  estadoSolicitud: "Estado",
};

const SIGLAS_CARRERA = {
  "ingenieria en software": "ISW",
  "ingenieria industrial": "IIN",
  "ingenieria industrial y de sistemas": "IIS",
  "ingenieria en mecatronica": "IMT",
  "ingenieria en electronica": "IEL",
  "ingenieria en electromecanica": "IEM",
  "licenciatura en administracion": "LAD",
  "licenciatura en psicologia": "LPS",
};

const FORMATO_FECHA = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
const FORMATO_HORA = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });
const FORMATO_HORA_24 = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
const FORMATO_DIA_SEMANA = new Intl.DateTimeFormat("es-MX", { weekday: "long" });

const estado = {
  usuarioNombre: "Usuario SIRA",
  pagina: 1,
  ordenarPor: "semaforo",
  direccion: "desc",
  criterioActivo: "nombre",
  busqueda: "",
  incluirAceptados: false,
  filtros: {
    semaforo: "",
    carrera: "",
    preparatoria: "",
    periodo: "",
    estadoSolicitud: "",
  },
  columnasVisibles: {
    semaforo: true,
    nombre: true,
    carrera: true,
    preparatoria: true,
    fechaSolicitud: true,
    ultimaActividad: true,
  },
  ultimosDatos: [],
  aspiranteId: null,
  solicitud: 0,
  // Estado real de conversaciones de la cartera del colaborador
  chat: {
    abierto: false,
    expandido: false,
    cargadoInicial: false,
    aspiranteActivoId: null,
    filtroContactos: "",
    filtroMensajes: "",
    contactos: new Map(), // aspiranteId -> { id, aspirante, mensajes, noLeidos, cargadoServidor }
  },
};

const MAPA_SELECTS_FILTROS = {
  semaforo: "filtro-semaforo",
  carrera: "filtro-carrera",
  preparatoria: "filtro-preparatoria",
  periodo: "filtro-periodo",
  estadoSolicitud: "filtro-estado",
};

const $ = (id) => document.getElementById(id);
const tabla = $("tabla");
const cuerpo = $("cuerpo-tabla");
const estadoTabla = $("estado-tabla");
const estadoVacio = $("estado-vacio");

// ---------- Utilidades ----------

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fechaCorta(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return FORMATO_FECHA.format(d);
}

function hora24(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return FORMATO_HORA_24.format(d);
}

function etiquetaFechaMensaje(iso) {
  if (!iso) return "Reciente";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "Reciente";

  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const inicioFecha = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
  const diffDias = Math.round((inicioHoy - inicioFecha) / 86_400_000);

  if (diffDias <= 0) return "Hoy";
  if (diffDias === 1) return "Ayer";
  if (diffDias < 7) {
    const dia = FORMATO_DIA_SEMANA.format(fecha);
    return dia.charAt(0).toUpperCase() + dia.slice(1);
  }
  return FORMATO_FECHA.format(fecha);
}

function etiquetaTiempoListaContacto(iso) {
  if (!iso) return "";
  const etiqueta = etiquetaFechaMensaje(iso);
  if (etiqueta === "Hoy") return hora24(iso);
  return etiqueta;
}

function inicialesDe(nombreCompleto) {
  const partes = String(nombreCompleto || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "SI";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

function subtituloCarreraPrepa(carrera = "", preparatoria = "") {
  const normCarrera = normalizar(carrera);
  const sigla = SIGLAS_CARRERA[normCarrera] ||
    carrera
      .split(/\s+/)
      .filter((p) => p.length > 2)
      .map((p) => p[0].toUpperCase())
      .join("")
      .slice(0, 4) ||
    "ITSON";
  const prepaCorta = String(preparatoria || "Preparatoria")
    .replace(/\s+\d+$/, "")
    .replace(/\s+Obregón.*$/i, "")
    .trim();
  return `${sigla} - ${prepaCorta}`;
}

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
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const h of hijos) el.append(h);
  return el;
}

function punto(nivel) {
  return elemento("span", { class: "semaforo" }, [
    elemento("span", { class: `semaforo-punto ${nivel}`, "aria-hidden": "true" }),
    elemento("span", { class: "sin-texto", text: ETIQUETA_SEMAFORO[nivel] ?? nivel }),
  ]);
}

function formatearPeriodoEtiqueta(codigo) {
  if (codigo === "2027-1") return "Enero - Mayo 2027";
  if (codigo === "2026-2") return "Agosto - Diciembre 2026";
  if (codigo === "2026-1") return "Enero - Mayo 2026";
  return codigo;
}

// ---------- [HU2-10] Estado sin resultados y Estados de tabla ----------

function renderizarEstadoVacio() {
  ocultarEstadoTabla();
  tabla.hidden = true;
  $("paginacion").hidden = true;
  if (estadoVacio) estadoVacio.hidden = false;
}

function ocultarEstadoVacio() {
  if (estadoVacio) estadoVacio.hidden = true;
  tabla.hidden = false;
}

function mostrarEstadoTabla(tipo, mensaje, { reintentar = null, restablecer = null } = {}) {
  tabla.hidden = true;
  $("paginacion").hidden = true;
  if (estadoVacio) estadoVacio.hidden = true;
  estadoTabla.hidden = false;
  estadoTabla.className = `estado-tabla ${tipo}`;
  estadoTabla.replaceChildren(elemento("p", { text: mensaje }));
  if (reintentar) estadoTabla.append(elemento("button", { type: "button", class: "boton-restablecer", text: "Reintentar", onclick: reintentar }));
  if (restablecer) estadoTabla.append(elemento("button", { type: "button", class: "boton-restablecer", text: "Restablecer filtros", onclick: restablecer }));
}

function ocultarEstadoTabla() {
  estadoTabla.hidden = true;
  estadoTabla.replaceChildren();
}

function mostrarCargando() {
  tabla.hidden = true;
  $("paginacion").hidden = true;
  if (estadoVacio) estadoVacio.hidden = true;
  estadoTabla.hidden = false;
  estadoTabla.className = "estado-tabla";
  estadoTabla.replaceChildren(elemento("p", { text: "Cargando aspirantes…", role: "status" }));
}

// ---------- [HU2-9] Catálogos y controles de filtros combinables ----------

async function inicializarCatalogosFiltros() {
  try {
    const catalogos = await api.filtros();
    llenarSelect("filtro-carrera", "Carrera: Todas", catalogos.carreras || []);
    llenarSelect("filtro-preparatoria", "Preparatoria: Todas", catalogos.preparatorias || []);
    llenarSelect(
      "filtro-periodo",
      "Período: Todos",
      (catalogos.periodos || []).map((p) => ({ valor: p, texto: `${p} (${formatearPeriodoEtiqueta(p)})` }))
    );
    llenarSelect(
      "filtro-estado",
      "Estado: Todos",
      (catalogos.estadosSolicitud || []).map((e) => ({
        valor: e,
        texto: ETIQUETA_ESTADO_FILTRO[e] ?? e.replaceAll("_", " "),
      }))
    );
    if (Array.isArray(catalogos.semaforos) && catalogos.semaforos.length > 0) {
      llenarSelect(
        "filtro-semaforo",
        "Semáforo: Todos",
        catalogos.semaforos.map((s) => ({
          valor: String(s).toUpperCase(),
          texto: String(s),
        }))
      );
    }
  } catch (error) {
    console.warn("No se pudieron cargar los catálogos dinámicos de filtros:", error);
  }
}

function llenarSelect(idSelect, textoPorDefecto, opciones) {
  const select = $(idSelect);
  if (!select) return;
  const valorActual = select.value;
  select.replaceChildren(elemento("option", { value: "", text: textoPorDefecto }));
  for (const item of opciones) {
    const valor = typeof item === "object" ? item.valor : item;
    const texto = typeof item === "object" ? item.texto : item;
    select.append(elemento("option", { value: valor, text: texto }));
  }
  select.value = valorActual;
}

function actualizarVisibilidadControlFiltro() {
  const criterio = estado.criterioActivo;
  const buscador = $("contenedor-buscador");
  if (buscador) buscador.hidden = criterio !== "nombre";

  for (const [clave, idSelect] of Object.entries(MAPA_SELECTS_FILTROS)) {
    const el = $(idSelect);
    if (el) el.hidden = criterio !== clave;
  }
}

function pintarChipsFiltros() {
  const contenedor = $("chips-filtros");
  if (!contenedor) return;
  const chips = [];

  for (const [clave, valor] of Object.entries(estado.filtros)) {
    if (!valor) continue;
    const etiquetaValor = clave === "estadoSolicitud"
      ? (ETIQUETA_ESTADO_FILTRO[valor] ?? valor)
      : clave === "semaforo"
        ? (ETIQUETA_SEMAFORO[valor] ?? valor)
        : valor;

    const chip = elemento("span", { class: "chip-filtro" }, [
      elemento("span", { text: `${ETIQUETA_CRITERIO[clave]}: ${etiquetaValor}` }),
      elemento("button", {
        type: "button",
        "aria-label": `Quitar filtro ${ETIQUETA_CRITERIO[clave]}`,
        text: "✕",
        onclick: () => {
          estado.filtros[clave] = "";
          const select = $(MAPA_SELECTS_FILTROS[clave]);
          if (select) select.value = "";
          estado.pagina = 1;
          pintarChipsFiltros();
          cargarTabla();
        },
      }),
    ]);
    chips.push(chip);
  }

  contenedor.replaceChildren(...chips);
}

function hayFiltrosBusquedaActivos() {
  return Boolean(
    estado.busqueda.trim() ||
    estado.incluirAceptados ||
    Object.values(estado.filtros).some((v) => Boolean(v))
  );
}

function restablecerFiltrosBusqueda() {
  estado.busqueda = "";
  estado.incluirAceptados = false;
  estado.criterioActivo = "nombre";
  estado.pagina = 1;
  for (const clave of Object.keys(estado.filtros)) {
    estado.filtros[clave] = "";
  }

  if ($("buscar")) $("buscar").value = "";
  if ($("incluir-aceptados")) $("incluir-aceptados").checked = false;
  if ($("criterio-filtro")) $("criterio-filtro").value = "nombre";

  for (const idSelect of Object.values(MAPA_SELECTS_FILTROS)) {
    const select = $(idSelect);
    if (select) select.value = "";
  }

  actualizarVisibilidadControlFiltro();
  pintarChipsFiltros();
  ocultarEstadoVacio();
  cargarTabla();
}

// ---------- Columnas visibles y Tabla ----------

function aplicarColumnasVisibles() {
  for (const [col, visible] of Object.entries(estado.columnasVisibles)) {
    for (const celda of document.querySelectorAll(`[data-col="${col}"]`)) {
      celda.hidden = !visible;
    }
  }
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
      elemento("td", { "data-col": "semaforo" }, [punto(a.semaforo.nivel)]),
      elemento("td", { "data-col": "nombre", text: a.nombre, title: a.nombre }),
      elemento("td", { "data-col": "carrera", text: a.carrera, title: a.carrera }),
      elemento("td", { "data-col": "preparatoria", text: a.preparatoria, title: a.preparatoria }),
      elemento("td", { "data-col": "fechaSolicitud", text: fechaCorta(a.fechaSolicitud) }),
      elemento("td", { "data-col": "ultimaActividad", text: haceCuanto(a.ultimaActividad) }),
    );
    fila.addEventListener("click", () => abrirPanel(a.id));
    fila.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirPanel(a.id); } });
    return fila;
  }));
  aplicarColumnasVisibles();
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
      ...estado.filtros,
    });
    if (solicitud !== estado.solicitud) return;

    estado.ultimosDatos = datos;

    if (paginacion.totalResultados === 0 || datos.length === 0) {
      if (hayFiltrosBusquedaActivos()) {
        renderizarEstadoVacio();
      } else {
        mostrarEstadoTabla("", "No hay aspirantes en tu cartera.");
      }
      return;
    }

    ocultarEstadoTabla();
    ocultarEstadoVacio();
    pintarFilas(datos);
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
  const contenedorNumeros = $("indicador-pagina");
  nav.hidden = totalPaginas <= 1;
  $("anterior").disabled = pagina <= 1;
  $("siguiente").disabled = pagina >= totalPaginas;

  const botones = [];
  const irAPagina = (num) => {
    if (num === estado.pagina || num < 1 || num > totalPaginas) return;
    estado.pagina = num;
    cargarTabla();
  };

  const paginasAMostrar = new Set([1, totalPaginas, pagina, pagina - 1, pagina + 1]);
  if (pagina <= 3) {
    paginasAMostrar.add(2);
    paginasAMostrar.add(3);
  }
  if (pagina >= totalPaginas - 2) {
    paginasAMostrar.add(totalPaginas - 1);
    paginasAMostrar.add(totalPaginas - 2);
  }

  const ordenadas = [...paginasAMostrar]
    .filter((p) => p >= 1 && p <= totalPaginas)
    .sort((a, b) => a - b);

  let previa = 0;
  for (const p of ordenadas) {
    if (previa && p - previa > 1) {
      botones.push(elemento("span", { class: "pag-elipsis", text: "...", "aria-hidden": "true" }));
    }
    botones.push(
      elemento("button", {
        type: "button",
        class: `pag-numero${p === pagina ? " activo" : ""}`,
        "aria-label": `Página ${p}`,
        "aria-current": p === pagina ? "page" : "false",
        text: String(p),
        onclick: () => irAPagina(p),
      })
    );
    previa = p;
  }

  contenedorNumeros.replaceChildren(...botones);
}

// ---------- Panel de Contacto y Actividades (EQ-40) ----------

function pintarContacto(d) {
  const vista = $("contacto-caja") ?? $("vista-contacto");
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

function formatearFechaHoraActividad(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${fechaCorta(iso)} - ${FORMATO_HORA.format(d)}`;
}

function pintarActividades(datos) {
  const lista = $("lista-actividades");
  $("sin-actividades").hidden = datos.length > 0;
  lista.replaceChildren(...datos.map((a) => elemento("li", { class: `evento ${a.tipo}` }, [
    elemento("p", { text: a.texto }),
    elemento("time", { datetime: a.fecha, text: formatearFechaHoraActividad(a.fecha) }),
  ])));
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
      : error.codigo === "PARAMETRO_INVALIDO"
        ? "La fecha de inicio no puede ser posterior a la fecha de fin."
        : "No pudimos cargar el historial. Inténtalo de nuevo.";
  }
}

function limpiarFiltrosFechasActividades() {
  if ($("desde")) $("desde").value = "";
  if ($("hasta")) $("hasta").value = "";
  cargarActividades();
}

const PESTANAS = ["contacto", "actividades"];

function seleccionarPestana(nombre) {
  if (nombre === "chat") {
    if (estado.aspiranteId) {
      abrirVentanaChat(estado.aspiranteId);
    }
    return;
  }
  for (const otra of PESTANAS) {
    const activa = otra === nombre;
    const btn = $(`pestana-${otra}`);
    if (btn) {
      btn.setAttribute("aria-selected", String(activa));
      btn.classList.toggle("activa", activa);
    }
    const vista = $(`vista-${otra}`);
    if (vista) vista.hidden = !activa;
  }
  if (nombre === "actividades") cargarActividades();
}

async function abrirPanel(id, pestanaInicial = "contacto") {
  estado.aspiranteId = id;
  for (const fila of cuerpo.querySelectorAll("tr")) {
    fila.setAttribute("aria-selected", String(fila.dataset.id === id));
  }
  if (pestanaInicial === "chat") {
    await abrirVentanaChat(id);
    return;
  }
  $("panel").hidden = false;
  seleccionarPestana(pestanaInicial);
  const contenedorContacto = $("contacto-caja") ?? $("vista-contacto");
  contenedorContacto.replaceChildren(elemento("p", { class: "ayuda", text: "Cargando…" }));
  try {
    const detalle = await api.detalle(id);
    if (id !== estado.aspiranteId) return;
    $("panel-nombre").textContent = detalle.nombre;
    pintarContacto(detalle);
  } catch (error) {
    if (id !== estado.aspiranteId) return;
    $("panel-nombre").textContent = "Aspirante";
    contenedorContacto.replaceChildren(elemento("p", {
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

// ==========================================================================
// Ventana General y Detallada de Chat (Conversaciones Reales + WhatsApp API)
// ==========================================================================

/**
 * Carga la lista general de conversaciones reales de la cartera del colaborador.
 */
async function cargarConversacionesCartera() {
  try {
    const { conversaciones } = await api.conversaciones();
    for (const conv of conversaciones) {
      const id = conv.aspirante.id;
      const existente = estado.chat.contactos.get(id);
      estado.chat.contactos.set(id, {
        id,
        aspirante: conv.aspirante,
        mensajes: conv.mensajes,
        noLeidos: existente?.leidoEnSesion ? 0 : (conv.noLeidos ?? 0),
        leidoEnSesion: Boolean(existente?.leidoEnSesion),
        cargadoServidor: true,
      });
    }
    estado.chat.cargadoInicial = true;

    if (!estado.chat.aspiranteActivoId && estado.chat.contactos.size > 0) {
      estado.chat.aspiranteActivoId = estado.chat.contactos.keys().next().value;
    }
  } catch (error) {
    console.warn("No se pudo cargar el listado de conversaciones:", error);
  }
}

/**
 * Asegura que un aspirante específico de la cartera esté presente en el mapa de contactos del chat
 * y que sus mensajes estén sincronizados desde `/api/monitoreo/aspirantes/:id/conversacion`.
 */
async function asegurarConversacionDeAspirante(aspiranteId, moverAlInicio = false) {
  if (!aspiranteId) return null;

  let item = estado.chat.contactos.get(aspiranteId);
  if (!item) {
    let datosAspirante = estado.ultimosDatos.find((a) => a.id === aspiranteId);
    if (!datosAspirante) {
      try {
        datosAspirante = await api.detalle(aspiranteId);
      } catch {
        return null;
      }
    }
    item = {
      id: aspiranteId,
      aspirante: datosAspirante,
      mensajes: [],
      noLeidos: 0,
      leidoEnSesion: true,
      cargadoServidor: false,
    };
  }

  try {
    const { datos } = await api.conversacion(aspiranteId);
    item.mensajes = [...datos].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    item.cargadoServidor = true;
  } catch {
    item.cargadoServidor = true;
  }

  if (moverAlInicio) {
    const nuevoMapa = new Map([[aspiranteId, item]]);
    for (const [k, v] of estado.chat.contactos.entries()) {
      if (k !== aspiranteId) nuevoMapa.set(k, v);
    }
    estado.chat.contactos = nuevoMapa;
  } else {
    estado.chat.contactos.set(aspiranteId, item);
  }

  return item;
}

/**
 * Determina el estado operativo de la conversación a partir de sus mensajes reales:
 * - "sin_respuesta": solo existen mensajes SALIENTES (BOT_IA / SISTEMA) y ningún ENTRANTE del aspirante.
 * - "ia": existen mensajes ENTRANTES del aspirante, pero aún no ha intervenido ningún COLABORADOR.
 * - "colaborador": ya existe participación del COLABORADOR o conversación abierta sin bloqueo.
 */
function calcularEstadoConversacion(mensajes) {
  if (!Array.isArray(mensajes) || mensajes.length === 0) return "colaborador";
  const tieneEntrantes = mensajes.some((m) => m.direccion === "ENTRANTE");
  const tieneColaborador = mensajes.some((m) => m.remitenteTipo === "COLABORADOR");
  if (!tieneEntrantes) return "sin_respuesta";
  if (!tieneColaborador) return "ia";
  return "colaborador";
}

function obtenerExtractoContacto(item) {
  const ultimo = item.mensajes[item.mensajes.length - 1];
  if (!ultimo) return "Sin mensajes registrados";
  const prefijo = ultimo.direccion === "SALIENTE" ? "✓✓ " : "";
  return `${prefijo}${ultimo.contenido}`;
}

function obtenerTiempoContacto(item) {
  const ultimo = item.mensajes[item.mensajes.length - 1];
  if (!ultimo?.fecha) return "";
  return etiquetaTiempoListaContacto(ultimo.fecha);
}

function renderizarListaContactosChat() {
  const listaEl = $("chat-contactos-lista");
  if (!listaEl) return;

  const termino = normalizar(estado.chat.filtroContactos);
  const items = [];

  for (const item of estado.chat.contactos.values()) {
    const nombreNorm = normalizar(item.aspirante.nombre);
    const carreraNorm = normalizar(item.aspirante.carrera);
    const prepaNorm = normalizar(item.aspirante.preparatoria);
    if (termino && !nombreNorm.includes(termino) && !carreraNorm.includes(termino) && !prepaNorm.includes(termino)) {
      continue;
    }

    const activo = item.id === estado.chat.aspiranteActivoId;
    const filaInfHijos = [
      elemento("span", { class: "chat-contacto-extracto", text: obtenerExtractoContacto(item) }),
    ];
    if (item.noLeidos > 0) {
      filaInfHijos.push(elemento("span", { class: "chat-contacto-badge", text: String(item.noLeidos) }));
    }

    const li = elemento(
      "li",
      {
        class: `chat-contacto-item${activo ? " activo" : ""}`,
        role: "option",
        "aria-selected": String(activo),
        "data-aspirante-id": item.id,
        tabindex: "0",
      },
      [
        elemento("span", { class: "chat-contacto-avatar", "aria-hidden": "true", text: inicialesDe(item.aspirante.nombre) }),
        elemento("div", { class: "chat-contacto-cuerpo" }, [
          elemento("div", { class: "chat-contacto-fila-superior" }, [
            elemento("span", { class: "chat-contacto-nombre", text: item.aspirante.nombre }),
            elemento("span", { class: "chat-contacto-tiempo", text: obtenerTiempoContacto(item) }),
          ]),
          elemento("div", { class: "chat-contacto-fila-inferior" }, filaInfHijos),
        ]),
      ]
    );

    // Detener propagación para que al reemplazar los hijos de la lista no se dispare el cierre externo
    li.addEventListener("click", (e) => {
      e.stopPropagation();
      seleccionarConversacionChat(item.id);
    });

    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        seleccionarConversacionChat(item.id);
      }
    });

    items.push(li);
  }

  listaEl.replaceChildren(...items);
}

function crearIconoAvatarMensaje(mensaje, inicialesAspirante) {
  if (mensaje.direccion === "ENTRANTE") {
    return elemento("span", { class: "chat-msg-avatar aspirante", "aria-hidden": "true", text: inicialesAspirante });
  }
  if (mensaje.remitenteTipo === "COLABORADOR") {
    return elemento("span", {
      class: "chat-msg-avatar colaborador",
      title: `Colaborador: ${estado.usuarioNombre}`,
      "aria-hidden": "true",
      text: inicialesDe(estado.usuarioNombre),
    });
  }
  // BOT_IA o SISTEMA: ícono de robot blanco sobre círculo azul
  return elemento("span", {
    class: "chat-msg-avatar bot",
    title: "Respuesta automática (IA SIRA)",
    "aria-hidden": "true",
    html: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><line x1="12" y1="3" x2="12" y2="8"/><circle cx="12" cy="3" r="1"/><circle cx="9" cy="13" r="1" fill="currentColor"/><circle cx="15" cy="13" r="1" fill="currentColor"/><line x1="9" y1="17" x2="15" y2="17"/></svg>`,
  });
}

function renderizarConversacionActiva() {
  const id = estado.chat.aspiranteActivoId;
  const item = estado.chat.contactos.get(id);
  const contenedor = $("chat-cuerpo-mensajes");
  if (!contenedor) return;

  if (!item) {
    if ($("chat-avatar-activo")) $("chat-avatar-activo").textContent = "--";
    if ($("chat-nombre-activo")) $("chat-nombre-activo").textContent = "Sin conversaciones";
    if ($("chat-subtitulo-activo")) $("chat-subtitulo-activo").textContent = "";
    contenedor.replaceChildren(
      elemento("div", { class: "chat-separador-fecha", text: "No hay conversaciones registradas en tu cartera." })
    );
    return;
  }

  const iniciales = inicialesDe(item.aspirante.nombre);
  if ($("chat-avatar-activo")) $("chat-avatar-activo").textContent = iniciales;
  if ($("chat-nombre-activo")) $("chat-nombre-activo").textContent = item.aspirante.nombre;
  if ($("chat-subtitulo-activo")) {
    $("chat-subtitulo-activo").textContent = subtituloCarreraPrepa(item.aspirante.carrera, item.aspirante.preparatoria);
  }

  const filtroMsg = normalizar(estado.chat.filtroMensajes);
  const mensajesFiltrados = filtroMsg
    ? item.mensajes.filter((m) => normalizar(m.contenido).includes(filtroMsg))
    : item.mensajes;

  const nodos = [];
  let ultimoDia = null;

  if (mensajesFiltrados.length === 0) {
    nodos.push(
      elemento("div", {
        class: "chat-separador-fecha",
        text: filtroMsg
          ? "Ningún mensaje coincide con la búsqueda."
          : "Este aspirante aún no tiene mensajes registrados. Escribe el primer mensaje abajo.",
      })
    );
  } else {
    for (const m of mensajesFiltrados) {
      const dia = etiquetaFechaMensaje(m.fecha);
      if (dia !== ultimoDia) {
        nodos.push(elemento("div", { class: "chat-separador-fecha", text: dia }));
        ultimoDia = dia;
      }

      const fila = elemento("div", { class: `chat-fila-mensaje ${m.direccion}` }, [
        crearIconoAvatarMensaje(m, iniciales),
        elemento("div", { class: "chat-msg-contenido-wrap" }, [
          elemento("div", { class: "chat-msg-burbuja", text: m.contenido }),
          elemento("span", { class: "chat-msg-hora", text: hora24(m.fecha) }),
        ]),
      ]);
      nodos.push(fila);
    }
  }

  contenedor.replaceChildren(...nodos);
  contenedor.scrollTop = contenedor.scrollHeight;

  // Actualizar banners e input según el estado real de la conversación del aspirante
  const modoConversacion = calcularEstadoConversacion(item.mensajes);
  const bannerIa = $("chat-banner-ia");
  const bannerSinRespuesta = $("chat-banner-sin-respuesta");
  const formEnviar = $("chat-form-enviar");

  if (modoConversacion === "sin_respuesta") {
    if (bannerIa) bannerIa.hidden = true;
    if (bannerSinRespuesta) bannerSinRespuesta.hidden = false;
    if (formEnviar) formEnviar.hidden = true;
  } else if (modoConversacion === "ia") {
    if (bannerIa) bannerIa.hidden = false;
    if (bannerSinRespuesta) bannerSinRespuesta.hidden = true;
    if (formEnviar) formEnviar.hidden = false;
  } else {
    if (bannerIa) bannerIa.hidden = true;
    if (bannerSinRespuesta) bannerSinRespuesta.hidden = true;
    if (formEnviar) formEnviar.hidden = false;
  }
}

async function seleccionarConversacionChat(aspiranteId) {
  if (!aspiranteId) return;
  estado.chat.aspiranteActivoId = aspiranteId;
  estado.aspiranteId = aspiranteId;

  // Sincronizar fila seleccionada en la tabla de monitoreo
  for (const fila of cuerpo.querySelectorAll("tr")) {
    fila.setAttribute("aria-selected", String(fila.dataset.id === aspiranteId));
  }

  const item = estado.chat.contactos.get(aspiranteId);
  if (item) {
    item.noLeidos = 0;
    item.leidoEnSesion = true;
  }

  renderizarListaContactosChat();
  renderizarConversacionActiva();

  // Sincronizar con el endpoint individual de conversación del aspirante
  await asegurarConversacionDeAspirante(aspiranteId, false);
  if (estado.chat.aspiranteActivoId === aspiranteId) {
    renderizarListaContactosChat();
    renderizarConversacionActiva();
  }
}

async function abrirVentanaChat(aspiranteId = null) {
  if (!estado.chat.cargadoInicial) {
    await cargarConversacionesCartera();
  }

  if (aspiranteId) {
    const yaExiste = estado.chat.contactos.has(aspiranteId);
    await asegurarConversacionDeAspirante(aspiranteId, !yaExiste);
    estado.chat.aspiranteActivoId = aspiranteId;
  } else if (!estado.chat.aspiranteActivoId && estado.chat.contactos.size > 0) {
    estado.chat.aspiranteActivoId = estado.chat.contactos.keys().next().value;
  }

  // Ocultar el panel lateral de Contacto/Actividades al abrir la ventana de Chat
  $("panel").hidden = true;

  estado.chat.abierto = true;
  const ventana = $("ventana-chat");
  if (ventana) ventana.hidden = false;
  if ($("btn-abrir-chat-superior")) {
    $("btn-abrir-chat-superior").setAttribute("aria-expanded", "true");
  }

  if (estado.chat.aspiranteActivoId) {
    await seleccionarConversacionChat(estado.chat.aspiranteActivoId);
  } else {
    renderizarListaContactosChat();
    renderizarConversacionActiva();
  }
}

function cerrarVentanaChat() {
  estado.chat.abierto = false;
  const ventana = $("ventana-chat");
  if (ventana) {
    ventana.hidden = true;
    ventana.classList.remove("expandida");
  }
  estado.chat.expandido = false;
  actualizarIconoExpandirChat();
  if ($("btn-abrir-chat-superior")) {
    $("btn-abrir-chat-superior").setAttribute("aria-expanded", "false");
  }
}

function alternarExpandirChat() {
  estado.chat.expandido = !estado.chat.expandido;
  const ventana = $("ventana-chat");
  if (ventana) {
    ventana.classList.toggle("expandida", estado.chat.expandido);
  }
  actualizarIconoExpandirChat();
}

function actualizarIconoExpandirChat() {
  if ($("icono-expandir-chat")) $("icono-expandir-chat").hidden = estado.chat.expandido;
  if ($("icono-contraer-chat")) $("icono-contraer-chat").hidden = !estado.chat.expandido;
}

async function manejarEnvioMensajeChat(e) {
  e.preventDefault();
  const input = $("chat-input-mensaje");
  if (!input) return;
  const texto = input.value.trim();
  if (!texto) return;

  const id = estado.chat.aspiranteActivoId;
  const item = estado.chat.contactos.get(id);
  if (!item) return;

  input.value = "";
  try {
    const nuevoMsg = await api.enviarMensajeWhatsApp(id, {
      contenido: texto,
      telefono: item.aspirante.telefono,
    });
    item.mensajes.push(nuevoMsg);

    // Mover esta conversación al inicio de la lista por ser la más reciente
    const nuevoMapa = new Map([[id, item]]);
    for (const [k, v] of estado.chat.contactos.entries()) {
      if (k !== id) nuevoMapa.set(k, v);
    }
    estado.chat.contactos = nuevoMapa;

    renderizarListaContactosChat();
    renderizarConversacionActiva();
  } catch (error) {
    console.error("Error al enviar mensaje:", error);
  }
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

  if ($("criterio-filtro")) {
    $("criterio-filtro").addEventListener("change", (e) => {
      estado.criterioActivo = e.target.value;
      actualizarVisibilidadControlFiltro();
    });
  }

  let temporizador;
  $("buscar").addEventListener("input", (e) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      estado.busqueda = e.target.value;
      estado.pagina = 1;
      cargarTabla();
    }, 250);
  });

  for (const [clave, idSelect] of Object.entries(MAPA_SELECTS_FILTROS)) {
    const select = $(idSelect);
    if (!select) continue;
    select.addEventListener("change", (e) => {
      estado.filtros[clave] = e.target.value;
      estado.pagina = 1;
      pintarChipsFiltros();
      cargarTabla();
    });
  }

  $("incluir-aceptados").addEventListener("change", (e) => {
    estado.incluirAceptados = e.target.checked;
    estado.pagina = 1;
    cargarTabla();
  });

  if ($("btn-restablecer-vacio")) {
    $("btn-restablecer-vacio").addEventListener("click", restablecerFiltrosBusqueda);
  }

  // Menú de columnas visibles
  const btnColumnas = $("boton-columnas");
  const menuColumnas = $("menu-columnas");
  if (btnColumnas && menuColumnas) {
    btnColumnas.addEventListener("click", (e) => {
      e.stopPropagation();
      const abierto = !menuColumnas.hidden;
      menuColumnas.hidden = abierto;
      btnColumnas.setAttribute("aria-expanded", String(!abierto));
    });
    document.addEventListener("click", (e) => {
      if (!menuColumnas.hidden && !menuColumnas.contains(e.target) && e.target !== btnColumnas) {
        menuColumnas.hidden = true;
        btnColumnas.setAttribute("aria-expanded", "false");
      }
    });
    for (const check of menuColumnas.querySelectorAll("[data-col-toggle]")) {
      check.addEventListener("change", (e) => {
        const col = e.target.dataset.colToggle;
        estado.columnasVisibles[col] = e.target.checked;
        aplicarColumnasVisibles();
      });
    }
  }

  // Pestañas del panel de detalle y acceso directo al chat del aspirante seleccionado
  $("pestana-contacto").addEventListener("click", () => seleccionarPestana("contacto"));
  $("pestana-actividades").addEventListener("click", () => seleccionarPestana("actividades"));
  $("pestana-chat").addEventListener("click", (e) => {
    e.stopPropagation();
    if (estado.aspiranteId) {
      abrirVentanaChat(estado.aspiranteId);
    }
  });
  $("desde").addEventListener("change", cargarActividades);
  $("hasta").addEventListener("change", cargarActividades);
  if ($("btn-limpiar-filtros")) {
    $("btn-limpiar-filtros").addEventListener("click", limpiarFiltrosFechasActividades);
  }
  $("cerrar-panel").addEventListener("click", cerrarPanel);

  // ---------- Eventos de la Ventana General y Detallada de Chat ----------
  const btnChatSuperior = $("btn-abrir-chat-superior");
  if (btnChatSuperior) {
    btnChatSuperior.addEventListener("click", (e) => {
      e.stopPropagation();
      if (estado.chat.abierto) cerrarVentanaChat();
      else abrirVentanaChat(estado.aspiranteId);
    });
  }

  const enlaceAspirantes = $("enlace-aspirantes");
  if (enlaceAspirantes) {
    enlaceAspirantes.addEventListener("click", (e) => {
      if (estado.chat.abierto) {
        e.preventDefault();
        cerrarVentanaChat();
      }
    });
  }

  if ($("buscar-chat-aspirante")) {
    $("buscar-chat-aspirante").addEventListener("input", (e) => {
      estado.chat.filtroContactos = e.target.value;
      renderizarListaContactosChat();
    });
  }

  if ($("chat-btn-expandir")) {
    $("chat-btn-expandir").addEventListener("click", (e) => {
      e.stopPropagation();
      alternarExpandirChat();
    });
  }

  if ($("chat-btn-buscar-msg")) {
    $("chat-btn-buscar-msg").addEventListener("click", (e) => {
      e.stopPropagation();
      const wrap = $("chat-buscador-mensajes-contenedor");
      if (!wrap) return;
      wrap.hidden = !wrap.hidden;
      if (!wrap.hidden) {
        $("chat-buscar-en-conversacion")?.focus();
      } else {
        estado.chat.filtroMensajes = "";
        if ($("chat-buscar-en-conversacion")) $("chat-buscar-en-conversacion").value = "";
        renderizarConversacionActiva();
      }
    });
  }

  if ($("chat-buscar-en-conversacion")) {
    $("chat-buscar-en-conversacion").addEventListener("input", (e) => {
      estado.chat.filtroMensajes = e.target.value;
      renderizarConversacionActiva();
    });
  }

  const btnOpcionesChat = $("chat-btn-opciones");
  const menuOpcionesChat = $("chat-menu-opciones");
  if (btnOpcionesChat && menuOpcionesChat) {
    btnOpcionesChat.addEventListener("click", (e) => {
      e.stopPropagation();
      const abierto = !menuOpcionesChat.hidden;
      menuOpcionesChat.hidden = abierto;
      btnOpcionesChat.setAttribute("aria-expanded", String(!abierto));
    });

    if ($("chat-ir-expediente")) {
      $("chat-ir-expediente").addEventListener("click", (e) => {
        e.stopPropagation();
        menuOpcionesChat.hidden = true;
        const idActivo = estado.chat.aspiranteActivoId;
        cerrarVentanaChat();
        if (idActivo) abrirPanel(idActivo, "contacto");
      });
    }

    if ($("chat-ir-actividades")) {
      $("chat-ir-actividades").addEventListener("click", (e) => {
        e.stopPropagation();
        menuOpcionesChat.hidden = true;
        const idActivo = estado.chat.aspiranteActivoId;
        cerrarVentanaChat();
        if (idActivo) abrirPanel(idActivo, "actividades");
      });
    }

    if ($("chat-cerrar-menu")) {
      $("chat-cerrar-menu").addEventListener("click", (e) => {
        e.stopPropagation();
        menuOpcionesChat.hidden = true;
        cerrarVentanaChat();
      });
    }
  }

  if ($("chat-form-enviar")) {
    $("chat-form-enviar").addEventListener("submit", manejarEnvioMensajeChat);
  }

  if ($("chat-btn-emoji")) {
    $("chat-btn-emoji").addEventListener("click", (e) => {
      e.stopPropagation();
      const input = $("chat-input-mensaje");
      if (!input) return;
      input.value += " 👋";
      input.focus();
    });
  }

  // Usar composedPath() para que nunca se cierre la ventana de chat al hacer clic en elementos internos que se re-renderizan
  document.addEventListener("click", (e) => {
    const rutaEvento = typeof e.composedPath === "function" ? e.composedPath() : [];

    if (
      menuOpcionesChat &&
      !menuOpcionesChat.hidden &&
      !rutaEvento.includes(menuOpcionesChat) &&
      !rutaEvento.includes(btnOpcionesChat)
    ) {
      menuOpcionesChat.hidden = true;
    }

    const ventana = $("ventana-chat");
    if (
      estado.chat.abierto &&
      !estado.chat.expandido &&
      ventana &&
      !rutaEvento.includes(ventana) &&
      !ventana.contains(e.target) &&
      !rutaEvento.includes(btnChatSuperior)
    ) {
      cerrarVentanaChat();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (estado.chat.abierto) cerrarVentanaChat();
      else if (!$("panel").hidden) cerrarPanel();
    }
  });
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
    estado.usuarioNombre = sesion.nombre;
    $("nombre-usuario").textContent = sesion.nombre;
    if ($("saludo-usuario")) {
      $("saludo-usuario").textContent = `Bienvenido, ${sesion.nombre}!`;
    }
    if ($("avatar-usuario")) {
      $("avatar-usuario").textContent = inicialesDe(sesion.nombre);
    }
    const enlaceColab = $("enlace-colaboradores");
    if (enlaceColab && sesion.usuario?.rol !== "administrador") {
      enlaceColab.setAttribute("aria-disabled", "true");
      enlaceColab.href = "#";
      enlaceColab.title = "Disponible para administradores";
    }
  } catch (error) {
    if (error.estado === 401) window.location.replace('/?expired=1');
    else $("nombre-usuario").textContent = "Sin conexión al servicio de sesión";
    return;
  }

  configurarEventos();
  await Promise.all([
    inicializarCatalogosFiltros(),
    cargarConversacionesCartera(),
  ]);

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
  window.setInterval(revisarSesion, 5000);
}

iniciar();
