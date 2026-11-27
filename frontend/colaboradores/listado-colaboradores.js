/**
 * EQ-71 · HU6-12: listado de colaboradores por campus.
 *
 * Lo usan las dos vistas del Figma:
 *   - colaborador   → listado.html  (solo consulta)
 *   - administrador → registro.html (además: mostrar inactivos, registrar e inactivar)
 *
 * Los elementos de administrador son opcionales: si no existen en la página, se ignoran.
 */
import { etiquetaCampus, paginar, describirPeriodoBaja } from './validaciones.js';

const $ = (id) => document.getElementById(id);
const tonos = ['#345f81', '#64859c', '#5a6590', '#7d648a', '#8a9c71', '#a36a70', '#6c8298', '#86745c', '#41788b'];

const listado = {
  datos: [], campus: [], filtroCampus: '', pagina: 0, tamano: 9, solicitud: 0, esAdministrador: false,
  alInactivar: null, alReactivar: null, alCambiarCasosEspeciales: null,
};

async function pedirJson(ruta, opciones = {}) {
  const respuesta = await fetch(ruta, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...opciones,
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    if (respuesta.status === 401) window.location.replace('/?expired=1');
    throw Object.assign(new Error(datos.mensaje || 'No se pudo completar la solicitud.'), { codigo: datos.codigo });
  }
  return datos;
}

function anunciarEstadoCasosEspeciales(texto = '', tipo = 'exito') {
  const aviso = $('estado-casos-especiales');
  if (!aviso) return;
  aviso.textContent = texto;
  aviso.className = `registro-mensaje aviso-casos-especiales ${tipo}`;
  aviso.hidden = !texto;
}

function crearElemento(tag, clase, texto) {
  const el = document.createElement(tag);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function iniciales(nombre) {
  const partes = String(nombre || '?').trim().split(/\s+/);
  return `${partes[0]?.[0] || ''}${partes[1]?.[0] || ''}`.toUpperCase();
}

function pintarFiltrosCampus() {
  const filtros = $('filtros-campus');
  filtros.replaceChildren();
  for (const campus of listado.campus) {
    const activo = listado.filtroCampus === campus;
    const boton = crearElemento('button', 'filtro-campus', `${etiquetaCampus(campus)}${activo ? ' ×' : ''}`);
    boton.type = 'button';
    boton.classList.toggle('activo', activo);
    boton.setAttribute('aria-pressed', String(activo));
    boton.title = activo ? `Quitar filtro ${campus}` : `Ver solo ${campus}`;
    boton.addEventListener('click', () => {
      listado.filtroCampus = activo ? '' : campus;
      listado.pagina = 0;
      pintarFiltrosCampus();
      recargarListado();
    });
    filtros.append(boton);
  }
}

function ordenarListado(datos) {
  const orden = $('ordenar-muestra').value;
  const clave = (c) => orden === 'campus' ? `${c.campus ?? ''} ${c.nombreCompleto ?? ''}` : (c.nombreCompleto ?? c.idInstitucional);
  return [...datos].sort((a, b) => clave(a).localeCompare(clave(b), 'es'));
}

function tarjeta(c, indice) {
  const nombre = c.nombreCompleto ?? `ID ${c.idInstitucional}`;
  const el = crearElemento('article', `tarjeta-colaborador${c.activo ? '' : ' inactivo'}`);
  const superior = crearElemento('div', 'superior-tarjeta');
  const avatar = crearElemento('div', 'avatar-muestra', iniciales(nombre));
  avatar.style.setProperty('--tono', tonos[indice % tonos.length]);
  avatar.setAttribute('aria-hidden', 'true');
  const datos = crearElemento('div', 'detalles-muestra');
  const titulo = crearElemento('h3', '', nombre);
  if (!c.activo) titulo.append(crearElemento('span', 'estado-inactivo', 'Inactivo'));
  const insigniaEspecial = crearElemento('span', 'insignia-casos-especiales', 'Casos especiales');
  insigniaEspecial.hidden = !c.casosEspeciales;
  if (listado.esAdministrador) titulo.append(insigniaEspecial);
  const campus = crearElemento('p', '');
  campus.append(crearElemento('span', '', 'Campus: '), crearElemento('strong', '', etiquetaCampus(c.campus) || '—'));
  const carga = crearElemento('p', '');
  if (c.activo) carga.append(crearElemento('span', '', 'Núm. aspirantes: '), crearElemento('strong', '', String(c.totalAspirantes ?? 0)));
  else carga.append(crearElemento('span', '', 'Periodo Baja: '), crearElemento('strong', '', describirPeriodoBaja(c.periodoBaja)));
  const carreras = crearElemento('p', 'carreras-tarjeta', c.carreras.join(' · ') || 'Sin carreras');
  carreras.title = c.carreras.join(', ');
  datos.append(titulo, campus, carga, carreras);
  superior.append(avatar, datos);

  const inferior = crearElemento('div', 'inferior-tarjeta');
  const contacto = crearElemento('div', 'contacto-muestra');
  contacto.append(crearElemento('span', '', `☎ Cel: ${c.telefono ?? 'Sin teléfono'}`));
  if (c.correoInstitucional) {
    const correo = crearElemento('a', 'correo-ficticio', `✉ ${c.correoInstitucional}`);
    correo.href = `mailto:${c.correoInstitucional}`;
    contacto.append(correo);
  } else {
    contacto.append(crearElemento('span', 'correo-ficticio', '✉ Sin correo'));
  }
  inferior.append(contacto);

  // Solo administrador: activo → icono de perfil con X (dar de baja, HU6-18);
  // inactivo → icono de perfil con + (reactivar; el flujo lo conecta `alReactivar`).
  // EQ-73 / HU6-19: casilla «Casos especiales (otros campus)» conectada a PATCH /api/v1/colaboradores/:id/casos-especiales.
  let filaCasosEspeciales = null;
  if (listado.esAdministrador) {
    filaCasosEspeciales = crearElemento('div', 'fila-casos-especiales');
    const etiquetaSwitch = crearElemento('label', 'interruptor-casos-especiales');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('role', 'switch');
    checkbox.checked = Boolean(c.casosEspeciales);
    checkbox.disabled = !c.activo;
    checkbox.setAttribute('aria-label', `Casos especiales (otros campus) para ${nombre}`);

    const pista = crearElemento('span', 'pista-muestra');
    pista.setAttribute('aria-hidden', 'true');
    const textoSwitch = crearElemento('span', 'texto-casos-especiales', 'Casos especiales (otros campus)');
    etiquetaSwitch.append(checkbox, pista, textoSwitch);

    if (!c.activo) {
      etiquetaSwitch.title = 'Solo colaboradores activos pueden recibir casos especiales';
    } else {
      etiquetaSwitch.title = 'Habilita o deshabilita la recepción de expedientes de otros campus';
      checkbox.addEventListener('change', async () => {
        const valorAnterior = Boolean(c.casosEspeciales);
        const nuevoValor = checkbox.checked;
        checkbox.disabled = true;
        try {
          const respuesta = await pedirJson(
            `/api/v1/colaboradores/${encodeURIComponent(c.idInstitucional)}/casos-especiales`,
            {
              method: 'PATCH',
              body: JSON.stringify({ casosEspeciales: nuevoValor }),
            }
          );
          const confirmado = Boolean(respuesta?.colaborador?.casosEspeciales ?? nuevoValor);
          c.casosEspeciales = confirmado;
          checkbox.checked = confirmado;
          insigniaEspecial.hidden = !confirmado;
          anunciarEstadoCasosEspeciales(
            confirmado
              ? `Casos especiales habilitados para ${nombre}. Ya puede recibir expedientes de otros campus.`
              : `Casos especiales deshabilitados para ${nombre}.`,
            'exito'
          );
          listado.alCambiarCasosEspeciales?.(c, confirmado);
        } catch (error) {
          c.casosEspeciales = valorAnterior;
          checkbox.checked = valorAnterior;
          insigniaEspecial.hidden = !valorAnterior;
          anunciarEstadoCasosEspeciales(
            error.message || 'No se pudo actualizar la autorización de casos especiales.',
            'error'
          );
        } finally {
          checkbox.disabled = !c.activo;
        }
      });
    }
    filaCasosEspeciales.append(etiquetaSwitch);

    const boton = crearElemento('button', 'boton-inactivar');
    boton.type = 'button';
    const marca = c.activo ? '<path d="M17 8l5 5M22 8l-5 5" stroke="currentColor" stroke-width="2"/>' : '<path d="M19.5 7v8M15.5 11h8" stroke="currentColor" stroke-width="2"/>';
    boton.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="9" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6" fill="none" stroke="currentColor" stroke-width="2"/>${marca}</svg>`;
    const accion = c.activo ? listado.alInactivar : listado.alReactivar;
    const verbo = c.activo ? 'Dar de baja' : 'Reactivar';
    boton.disabled = typeof accion !== 'function';
    boton.title = boton.disabled ? `${verbo} (no disponible)` : `${verbo} a ${nombre}`;
    boton.setAttribute('aria-label', boton.title);
    if (!boton.disabled) boton.addEventListener('click', () => accion(c));
    inferior.append(boton);
  }

  if (filaCasosEspeciales) el.append(superior, filaCasosEspeciales, inferior);
  else el.append(superior, inferior);
  return el;
}

function pintarListado() {
  const registros = ordenarListado(listado.datos);
  const { visibles, pagina, paginas, inicio } = paginar(registros, listado.pagina, listado.tamano);
  listado.pagina = pagina;
  $('conteo-colaboradores').textContent = String(listado.datos.filter((c) => c.activo).length);
  $('conteo-aspirantes').textContent = String(listado.datos.reduce((t, c) => t + (c.totalAspirantes || 0), 0));
  $('conteo-pagina').textContent = registros.length ? `${inicio + 1} – ${inicio + visibles.length} de ${registros.length}` : '0 de 0';
  $('pagina-anterior').disabled = pagina === 0;
  $('pagina-siguiente').disabled = pagina >= paginas - 1;

  const contenedor = $('cuadricula-colaboradores');
  contenedor.replaceChildren();
  if (!visibles.length) {
    const hayFiltros = listado.filtroCampus || $('buscar-muestra').value.trim();
    contenedor.append(crearElemento('p', 'cuadricula-vacia', hayFiltros
      ? 'No hay colaboradores con esos filtros.'
      : 'Todavía no hay colaboradores registrados.'));
    return;
  }
  visibles.forEach((c, i) => contenedor.append(tarjeta(c, inicio + i)));
}

/** Vuelve a pedir el listado con los filtros actuales (p. ej. después de registrar a alguien). */
export async function recargarListado() {
  const solicitud = ++listado.solicitud;
  const parametros = new URLSearchParams();
  if (listado.filtroCampus) parametros.set('campus', listado.filtroCampus);
  if ($('mostrar-inactivos')?.checked) parametros.set('incluir_inactivos', 'true');
  const busqueda = $('buscar-muestra').value.trim();
  if (busqueda) parametros.set('busqueda', busqueda);
  try {
    const respuesta = await pedirJson(`/api/v1/colaboradores?${parametros}`);
    if (solicitud !== listado.solicitud) return; // respuesta vieja
    listado.datos = respuesta.colaboradores;
    if (!listado.campus.length) {
      listado.campus = respuesta.campus;
      pintarFiltrosCampus();
    }
    pintarListado();
  } catch (error) {
    if (solicitud !== listado.solicitud) return;
    $('cuadricula-colaboradores').replaceChildren(
      crearElemento('p', 'cuadricula-vacia', `No pudimos cargar los colaboradores. ${error.message}`));
  }
}

/**
 * Conecta los controles del listado y hace la primera carga.
 * @param {{
 *   esAdministrador?: boolean,
 *   alInactivar?: (c: Object) => void,
 *   alReactivar?: (c: Object) => void,
 *   alCambiarCasosEspeciales?: (c: Object, habilitado: boolean) => void
 * }} [opciones]
 */
export function iniciarListadoColaboradores({
  esAdministrador = false,
  alInactivar = null,
  alReactivar = null,
  alCambiarCasosEspeciales = null,
} = {}) {
  listado.esAdministrador = esAdministrador;
  listado.alInactivar = alInactivar;
  listado.alReactivar = alReactivar;
  listado.alCambiarCasosEspeciales = alCambiarCasosEspeciales;
  let espera = null;
  $('buscar-muestra').addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => { listado.pagina = 0; recargarListado(); }, 250);
  });
  $('ordenar-muestra').addEventListener('change', () => { listado.pagina = 0; pintarListado(); });
  $('mostrar-inactivos')?.addEventListener('change', () => { listado.pagina = 0; recargarListado(); });
  $('pagina-anterior').addEventListener('click', () => { if (listado.pagina > 0) { listado.pagina--; pintarListado(); } });
  $('pagina-siguiente').addEventListener('click', () => { listado.pagina++; pintarListado(); });
  return recargarListado();
}
