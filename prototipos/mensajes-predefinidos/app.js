
import {
  catalogoDemo,
  obtenerMensajes,
  buscarMensajes,
  buscarMensajePorId
} from "./catalogo.js";

const elementos = {
  categorias: document.querySelectorAll("[data-category]"),
  lista: document.querySelector("#catalog-list"),
  detalle: document.querySelector("#detail-content"),
  contador: document.querySelector("#message-count"),
  descripcion: document.querySelector("#catalog-description"),
  busqueda: document.querySelector("#search-message")
};

const estado = {
  categoria: "envio",
  seleccionado: null,
  fase: "cargando",
  consulta: "",
  catalogo: catalogoDemo
};

function escapar(valor) {
  return String(valor).replace(/[&<>"']/g, caracter => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[caracter]);
}

function cambiarEstado(fase) {
  estado.fase = fase;
  renderizarLista();
}

function renderizarLista() {
  if (estado.fase === "cargando") {
    elementos.lista.innerHTML =
      '<div class="state-message"><h3>Cargando catálogo...</h3><p>Consultando mensajes disponibles.</p></div>';
    elementos.contador.textContent = "Cargando";
    return;
  }

  if (estado.fase === "error") {
    elementos.lista.innerHTML = `
      <div class="state-message">
        <h3>No fue posible cargar los mensajes</h3>
        <p>Ocurrió un error al consultar el catálogo.</p>
        <button id="reintentar">Reintentar</button>
      </div>`;
    elementos.contador.textContent = "Error";

    document.querySelector("#reintentar")
      ?.addEventListener("click", cargarCatalogo);
    return;
  }

  const mensajes = buscarMensajes(
    obtenerMensajes(estado.categoria, estado.catalogo),
    estado.consulta
  );

  elementos.contador.textContent =
    `${mensajes.length} ${mensajes.length === 1 ? "mensaje" : "mensajes"}`;

  if (mensajes.length === 0) {
    elementos.lista.innerHTML = `
      <div class="state-message">
        <h3>No hay mensajes disponibles</h3>
        <p>No se encontraron mensajes en esta categoría o búsqueda.</p>
      </div>`;
    return;
  }

  elementos.lista.innerHTML = mensajes.map(mensaje => `
    <button class="message-card ${
      estado.seleccionado === mensaje.id ? "selected" : ""
    }" data-message-id="${escapar(mensaje.id)}">
      <strong>${escapar(mensaje.nombre)}</strong>
      <p>${escapar(mensaje.resumen)}</p>
      <span class="status-tag">${escapar(mensaje.estadoDefinicion)}</span>
    </button>
  `).join("");

  elementos.lista.querySelectorAll("[data-message-id]")
    .forEach(boton => {
      boton.addEventListener("click", () => {
        seleccionarMensaje(boton.dataset.messageId);
      });
    });
}

function renderizarDetalle(mensaje) {
  if (!mensaje) {
    elementos.detalle.innerHTML = `
      <div class="initial-state">
        <span class="empty-icon">✉</span>
        <h3>Selecciona un mensaje</h3>
        <p>Elige una tarjeta para consultar su contenido y sus reglas.</p>
      </div>`;
    return;
  }

  const variables = mensaje.variables.length
    ? mensaje.variables.map(variable => `{{${variable}}}`).join(", ")
    : "No definidas";

  elementos.detalle.innerHTML = `
    <div class="detail-content">
      <span class="status-tag">${escapar(mensaje.estadoDefinicion)}</span>
      <h2 id="detail-title">${escapar(mensaje.nombre)}</h2>

      <section class="detail-section">
        <h3>Contenido del mensaje</h3>
        <div class="preview-message">${escapar(mensaje.texto)}</div>
      </section>

      <section class="detail-section">
        <h3>Variables disponibles</h3>
        <div class="rule">
          <span>Variables</span>
          <span>${escapar(variables)}</span>
        </div>
      </section>

      <section class="detail-section">
        <h3>Reglas del mensaje</h3>
        <div class="rule-list">
          ${mensaje.reglas.map(([nombre, valor]) => `
            <div class="rule">
              <span>${escapar(nombre)}</span>
              <span>${escapar(valor)}</span>
            </div>
          `).join("")}
        </div>
      </section>
    </div>`;
}

function seleccionarMensaje(id) {
  const mensajes = obtenerMensajes(estado.categoria, estado.catalogo);
  const mensaje = buscarMensajePorId(id, mensajes);

  estado.seleccionado = mensaje?.id ?? null;

  renderizarLista();
  renderizarDetalle(mensaje);
}

function cambiarCategoria(categoria) {
  if (!["envio", "respuesta"].includes(categoria)) return;

  estado.categoria = categoria;
  estado.seleccionado = null;
  elementos.busqueda.value = "";
  estado.consulta = "";

  elementos.categorias.forEach(boton => {
    const activo = boton.dataset.category === categoria;
    boton.classList.toggle("active", activo);
    boton.setAttribute("aria-pressed", String(activo));
  });

  elementos.descripcion.textContent = categoria === "envio"
    ? "Mensajes para iniciar o dar seguimiento al contacto."
    : "Mensajes para responder consultas de los aspirantes.";

  renderizarDetalle(null);
  cargarCatalogo();
}

function cargarCatalogo() {
  cambiarEstado("cargando");

  try {
    const mensajes = obtenerMensajes(estado.categoria, estado.catalogo);

    if (!Array.isArray(mensajes)) {
      throw new Error("Formato de catálogo inválido");
    }

    estado.fase = "listo";
    renderizarLista();
  } catch (error) {
    console.error("Error al cargar catálogo:", error);
    cambiarEstado("error");
  }
}

elementos.categorias.forEach(boton => {
  boton.addEventListener("click", () => {
    cambiarCategoria(boton.dataset.category);
  });
});

elementos.busqueda.addEventListener("input", evento => {
  estado.consulta = evento.target.value;
  estado.seleccionado = null;
  renderizarDetalle(null);
  renderizarLista();
});

export function iniciarPrototipo() {
  cargarCatalogo();
}

export function obtenerEstadoPrototipo() {
  return { ...estado };
}

iniciarPrototipo();
