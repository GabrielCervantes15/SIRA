'use strict';

// SIRA - Monitoreo de aspirantes
// EQ-30: el interruptor consulta el endpoint oficial de EQ-29.
// No se modifica el módulo de monitoreo del backend.

const API_ASPIRANTES = '/api/monitoreo/aspirantes';
const API_SESION = '/api/v1/auth/session';
const API_CERRAR_SESION = '/api/v1/auth/logout';
const LIMITE_POR_PAGINA = 12;
const INTERVALO_SESION_MS = 5000;

const elementos = {
  avatar: document.querySelector('#user-avatar'),
  nombreUsuario: document.querySelector('#user-name'),
  rolUsuario: document.querySelector('#user-role'),
  cerrarSesion: document.querySelector('#logout'),
  busqueda: document.querySelector('#search-name'),
  incluirAceptados: document.querySelector('#include-accepted'),
  cuerpoTabla: document.querySelector('#aspirants-body'),
  resumen: document.querySelector('#result-summary'),
  pagina: document.querySelector('#page-indicator'),
  anterior: document.querySelector('#previous-page'),
  siguiente: document.querySelector('#next-page'),
  feedback: document.querySelector('#feedback-message'),
  estadoApi: document.querySelector('#api-status'),
  panelCampos: document.querySelector('#fields-panel'),
  botonCampos: document.querySelector('#toggle-fields'),
};

const estado = {
  usuario: null,
  nombre: '',
  incluirAceptados: false,
  limit: LIMITE_POR_PAGINA,
  offset: 0,
  total: 0,
  aspirantes: [],
  solicitudActual: 0,
  verificandoSesion: false,
  temporizadorBusqueda: null,
  columnas: {
    semaforo: true,
    nombreCompleto: true,
    carreraSolicitada: true,
    preparatoriaProcedencia: true,
    fechaSolicitud: true,
    fechaUltimaActividad: true,
    estadoSolicitud: false,
  },
};

function escaparHTML(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (caracter) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[caracter]);
}

function establecerFeedback(mensaje = '', tipo = 'info') {
  elementos.feedback.textContent = mensaje;
  elementos.feedback.dataset.type = tipo;
}

function establecerEstadoApi(texto, conectado) {
  elementos.estadoApi.textContent = texto;
  elementos.estadoApi.classList.toggle('is-online', Boolean(conectado));
  const indicador = document.createElement('span');
  indicador.className = 'status-indicator';
  elementos.estadoApi.prepend(indicador);
}

function iniciales(nombre) {
  return String(nombre || 'SIRA')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join('')
    .toUpperCase();
}

async function solicitarSesion() {
  const respuesta = await fetch(API_SESION, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (respuesta.status === 401) {
    window.location.replace('/?expired=1');
    return null;
  }

  if (!respuesta.ok) {
    throw new Error('No fue posible validar la sesión institucional.');
  }

  const datos = await respuesta.json();
  return datos.usuario || null;
}

async function cargarSesion() {
  try {
    estado.usuario = await solicitarSesion();

    if (!estado.usuario) return;

    const nombre = estado.usuario.nombreCompleto || 'Usuario SIRA';
    elementos.nombreUsuario.textContent = nombre;
    elementos.rolUsuario.textContent = estado.usuario.rol || 'Colaborador';
    elementos.avatar.textContent = iniciales(nombre);

    await cargarAspirantes();
  } catch (error) {
    establecerFeedback(error.message || 'No fue posible iniciar el monitoreo.', 'error');
    establecerEstadoApi('Sin conexión', false);
  }
}

function construirParametros() {
  const parametros = new URLSearchParams();

  // EQ-30: el backend incluye aceptados por defecto si el parámetro se omite.
  // Por eso enviamos explícitamente false al abrir el monitoreo.
  parametros.set('mostrar_aceptados', String(estado.incluirAceptados));
  parametros.set('limit', String(estado.limit));
  parametros.set('offset', String(estado.offset));
  parametros.set('ordenar_por', 'fechaSolicitud');
  parametros.set('orden_direccion', 'DESC');

  if (estado.nombre.trim()) {
    parametros.set('nombre', estado.nombre.trim());
  }

  return parametros;
}

async function cargarAspirantes() {
  const idSolicitud = ++estado.solicitudActual;
  establecerFeedback('');
  establecerEstadoApi('Consultando', false);
  elementos.cuerpoTabla.innerHTML = '<tr><td colspan="7" class="table-message">Consultando aspirantes…</td></tr>';

  try {
    const parametros = construirParametros();
    const respuesta = await fetch(`${API_ASPIRANTES}?${parametros.toString()}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });

    if (respuesta.status === 401) {
      window.location.replace('/?expired=1');
      return;
    }

    if (!respuesta.ok) {
      const errorApi = await respuesta.json().catch(() => ({}));
      throw new Error(errorApi.mensaje || 'No fue posible consultar los aspirantes.');
    }

    const resultado = await respuesta.json();

    // Evita que una respuesta anterior reemplace una búsqueda más reciente.
    if (idSolicitud !== estado.solicitudActual) return;

    estado.aspirantes = Array.isArray(resultado.aspirantes) ? resultado.aspirantes : [];
    estado.total = Number(resultado.total ?? estado.aspirantes.length);
    estado.limit = Number(resultado.limit ?? estado.limit);
    estado.offset = Number(resultado.offset ?? estado.offset);

    renderizarTabla();
    establecerEstadoApi('Conectado', true);
  } catch (error) {
    if (idSolicitud !== estado.solicitudActual) return;
    elementos.cuerpoTabla.innerHTML = '<tr><td colspan="7" class="table-message">No se pudo cargar la información.</td></tr>';
    elementos.resumen.textContent = 'No hay resultados disponibles';
    establecerFeedback(error.message || 'Error de comunicación con el servidor.', 'error');
    establecerEstadoApi('Error de conexión', false);
  }
}

function claseSemaforo(valor) {
  const semaforo = String(valor || '').trim().toUpperCase();

  if (semaforo === 'VERDE') return 'green';
  if (semaforo === 'AMARILLO' || semaforo === 'NARANJA') return 'amber';
  if (semaforo === 'ROJO') return 'red';

  return 'unknown';
}

function fechaLegible(valor) {
  if (!valor) return 'Sin registro';

  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return escaparHTML(valor);

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(fecha);
}

function actividadLegible(valor) {
  if (!valor) return 'Sin actividad';

  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return escaparHTML(valor);

  const diferencia = Date.now() - fecha.getTime();
  const minutos = Math.max(0, Math.floor(diferencia / 60000));

  if (minutos < 1) return 'Hace un momento';
  if (minutos < 60) return `Hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  if (dias < 30) return `Hace ${dias} día${dias === 1 ? '' : 's'}`;

  return fechaLegible(valor);
}

function celdaSemaforo(aspirante) {
  const color = claseSemaforo(aspirante.semaforo);
  const etiqueta = String(aspirante.semaforo || 'Sin dato').toUpperCase();
  return `<span class="semaphore ${color}" role="img" aria-label="Semáforo ${escaparHTML(etiqueta)}" title="${escaparHTML(etiqueta)}"></span>`;
}

function celdaEstado(valor) {
  const estadoSolicitud = String(valor || 'Sin estado');
  const clase = estadoSolicitud.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  return `<span class="status-pill status-${clase}">${escaparHTML(estadoSolicitud.replaceAll('_', ' '))}</span>`;
}

function renderizarTabla() {
  const columnas = [
    { key: 'semaforo', value: (a) => celdaSemaforo(a) },
    { key: 'nombreCompleto', value: (a) => escaparHTML(a.nombreCompleto || 'Sin nombre') },
    { key: 'carreraSolicitada', value: (a) => escaparHTML(a.carreraSolicitada || 'Sin carrera') },
    { key: 'preparatoriaProcedencia', value: (a) => escaparHTML(a.preparatoriaProcedencia || 'Sin preparatoria') },
    { key: 'fechaSolicitud', value: (a) => fechaLegible(a.fechaSolicitud) },
    { key: 'fechaUltimaActividad', value: (a) => actividadLegible(a.fechaUltimaActividad) },
    { key: 'estadoSolicitud', value: (a) => celdaEstado(a.estadoSolicitud) },
  ];

  const visibles = columnas.filter((columna) => estado.columnas[columna.key]);
  const filas = estado.aspirantes;

  if (!filas.length) {
    elementos.cuerpoTabla.innerHTML = `<tr><td colspan="${visibles.length || 1}" class="table-message">
      ${estado.nombre ? 'No se encontraron aspirantes con ese nombre.' : 'No hay aspirantes para mostrar con los criterios actuales.'}
    </td></tr>`;
  } else {
    elementos.cuerpoTabla.innerHTML = filas.map((aspirante) => {
      const celdas = visibles.map((columna) => `<td data-column="${columna.key}">${columna.value(aspirante)}</td>`).join('');
      return `<tr>${celdas}</tr>`;
    }).join('');
  }

  actualizarEncabezados();
  actualizarPaginacion();
}

function actualizarEncabezados() {
  document.querySelectorAll('[data-column]').forEach((elemento) => {
    const columna = elemento.dataset.column;
    elemento.classList.toggle('column-hidden', !estado.columnas[columna]);
  });
}

function actualizarPaginacion() {
  const inicio = estado.total === 0 ? 0 : estado.offset + 1;
  const fin = Math.min(estado.offset + estado.aspirantes.length, estado.total);
  const paginaActual = Math.floor(estado.offset / estado.limit) + 1;
  const paginasTotales = Math.max(1, Math.ceil(estado.total / estado.limit));

  elementos.resumen.textContent = `${inicio}–${fin} de ${estado.total} aspirante(s)`;
  elementos.pagina.textContent = `Página ${paginaActual} de ${paginasTotales}`;
  elementos.anterior.disabled = estado.offset <= 0;
  elementos.siguiente.disabled = estado.offset + estado.limit >= estado.total;
}

function cambiarPagina(direccion) {
  const nuevoOffset = estado.offset + (direccion * estado.limit);
  if (nuevoOffset < 0 || nuevoOffset >= estado.total) return;
  estado.offset = nuevoOffset;
  cargarAspirantes();
}

function configurarColumnas() {
  document.querySelectorAll('[data-column-toggle]').forEach((control) => {
    control.addEventListener('change', () => {
      const columna = control.dataset.columnToggle;
      estado.columnas[columna] = control.checked;
      renderizarTabla();
    });
  });

  elementos.botonCampos.addEventListener('click', () => {
    const abierto = elementos.botonCampos.getAttribute('aria-expanded') === 'true';
    elementos.botonCampos.setAttribute('aria-expanded', String(!abierto));
    elementos.panelCampos.classList.toggle('is-collapsed', abierto);
  });
}

function configurarEventos() {
  elementos.incluirAceptados.addEventListener('change', () => {
    estado.incluirAceptados = elementos.incluirAceptados.checked;
    estado.offset = 0;
    cargarAspirantes();
  });

  elementos.busqueda.addEventListener('input', () => {
    window.clearTimeout(estado.temporizadorBusqueda);
    estado.temporizadorBusqueda = window.setTimeout(() => {
      estado.nombre = elementos.busqueda.value;
      estado.offset = 0;
      cargarAspirantes();
    }, 350);
  });

  elementos.anterior.addEventListener('click', () => cambiarPagina(-1));
  elementos.siguiente.addEventListener('click', () => cambiarPagina(1));

  elementos.cerrarSesion.addEventListener('click', async () => {
    elementos.cerrarSesion.disabled = true;
    try {
      await fetch(API_CERRAR_SESION, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } finally {
      window.location.replace('/');
    }
  });

  configurarColumnas();
}

async function verificarSesionAutomatica() {
  if (estado.verificandoSesion || document.hidden) return;

  estado.verificandoSesion = true;

  try {
    const respuesta = await fetch(API_SESION, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });

    if (respuesta.status === 401) {
      window.location.replace('/?expired=1');
    }
  } catch (error) {
    // Un fallo momentáneo de red no cierra la sesión; el siguiente ciclo reintenta.
    console.error('No se pudo verificar la sesión:', error);
  } finally {
    estado.verificandoSesion = false;
  }
}

configurarEventos();
cargarSesion();
window.setInterval(verificarSesionAutomatica, INTERVALO_SESION_MS);
