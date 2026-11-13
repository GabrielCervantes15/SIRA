/**
 * EQ-62 / EQ-63 · UI siguiendo el prototipo de Figma.
 * El tablero de fondo es SOLO una muestra visual local. No representa colaboradores reales.
 * El modal usa endpoints administrativos existentes y guarda un borrador (no confirma alta).
 */
import { idValido, puedeContinuar, puedeGuardarCarreras } from './validaciones.js';

const $ = (id) => document.getElementById(id);
const estado = {
  perfil: null,
  campus: '',
  catalogo: {},
  campusDisponibles: [],
  carreras: new Set(),
  consulta: 0,
  paso: 1,
  ultimoFoco: null,
};

// Registros FICTICIOS destinados únicamente a imitar la retícula del Figma.
// No se envían al servidor, ni se confunden con usuarios registrados.
const muestras = [
  ['Edgar Salazar Vega', 'Obregón', 567],
  ['Cristiana Torres Rivera', 'Guaymas', 821],
  ['Jesús Hernández Duarte', 'Obregón', 564],
  ['Marcos Esquer Rojas', 'Obregón', 603],
  ['Christian Gil Soto', 'Obregón', 592],
  ['Ariel Osorio Luna', 'Navojoa', 744],
  ['Alma Chávez Quintero', 'Empalme', 207],
  ['Juan Gabriel Valdés', 'Empalme', 198],
  ['Andrés Martínez López', 'Guaymas', 801],
  ['Marco Solís Ojeda', 'Empalme', 532],
  ['José Morales Ponce', 'Navojoa', 358],
  ['Manuel Domínguez Núñez', 'Obregón', 244],
  ['Natalia Ortega Gil', 'Guaymas', 222],
  ['Isabel Estrada Peña', 'Navojoa', 453],
  ['Emilia Ramírez García', 'Obregón', 352],
  ['Paola Cruz Sánchez', 'Empalme', 127],
  ['Carlos León Ruiz', 'Guaymas', 319],
  ['Marta Díaz Salinas', 'Navojoa', 196],
  ['Mariana Pérez Soto', 'Obregón', 412],
  ['Alejandro Valdez Ríos', 'Guaymas', 255],
  ['Lucía Montaño Castro', 'Obregón', 285],
  ['Héctor Silva Ochoa', 'Empalme', 187],
  ['Daniela Robles Pineda', 'Obregón', 361],
].map(([nombre, campus, aspirantes], index) => ({
  nombre, campus, aspirantes, activo: index < 21, id: index + 1,
}));
const muestraUi = { campus: '', pagina: 0, tamano: 9 };
const tonos = ['#345f81','#64859c','#5a6590','#7d648a','#8a9c71','#a36a70','#6c8298','#86745c','#41788b'];

async function solicitar(ruta, opciones = {}) {
  const respuesta = await fetch(ruta, {
    credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', ...(opciones.body ? { 'Content-Type': 'application/json' } : {}) },
    ...opciones,
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    if (respuesta.status === 401) window.location.replace('/?expired=1');
    const error = new Error(datos.mensaje || 'No se pudo completar la solicitud.');
    error.codigo = datos.codigo;
    throw error;
  }
  return datos;
}

function mostrarMensaje(elemento, texto = '', tipo = 'error') {
  elemento.textContent = texto;
  elemento.className = `registro-mensaje ${tipo}`;
  elemento.hidden = !texto;
}

function iniciales(nombre) {
  const partes = String(nombre || '?').trim().split(/\s+/);
  return `${partes[0]?.[0] || ''}${partes[1]?.[0] || ''}`.toUpperCase();
}

function crearElemento(tag, clase, texto) {
  const el = document.createElement(tag);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function pintarFiltrosMuestra() {
  const filtros = $('filtros-campus');
  filtros.replaceChildren();
  for (const campus of ['Obregón', 'Navojoa', 'Guaymas', 'Empalme']) {
    const boton = crearElemento('button', 'filtro-campus', `${campus}${muestraUi.campus === campus ? ' ×' : ''}`);
    boton.type = 'button';
    boton.classList.toggle('activo', muestraUi.campus === campus);
    boton.setAttribute('aria-pressed', String(muestraUi.campus === campus));
    boton.addEventListener('click', () => {
      muestraUi.campus = muestraUi.campus === campus ? '' : campus;
      muestraUi.pagina = 0;
      pintarFiltrosMuestra();
      pintarMuestra();
    });
    filtros.append(boton);
  }
}

function pintarMuestra() {
  const termino = $('buscar-muestra').value.trim().toLocaleLowerCase('es');
  const incluirInactivos = $('mostrar-inactivos').checked;
  const orden = $('ordenar-muestra').value;
  const registros = muestras.filter((m) =>
    (incluirInactivos || m.activo) && (!muestraUi.campus || m.campus === muestraUi.campus) &&
    m.nombre.toLocaleLowerCase('es').includes(termino)
  ).sort((a,b) => String(a[orden]).localeCompare(String(b[orden]), 'es'));
  const paginas = Math.max(1, Math.ceil(registros.length / muestraUi.tamano));
  muestraUi.pagina = Math.min(muestraUi.pagina, paginas - 1);
  const inicio = muestraUi.pagina * muestraUi.tamano;
  const visibles = registros.slice(inicio, inicio + muestraUi.tamano);
  $('conteo-colaboradores').textContent = String(muestras.filter((m) => m.activo).length);
  $('conteo-pagina').textContent = registros.length ? `${inicio+1}–${inicio+visibles.length} de ${registros.length}` : '0 de 0';
  $('pagina-anterior').disabled = muestraUi.pagina === 0;
  $('pagina-siguiente').disabled = muestraUi.pagina >= paginas - 1;
  const contenedor = $('cuadricula-colaboradores');
  contenedor.replaceChildren();
  if (!visibles.length) {
    contenedor.append(crearElemento('p','cuadricula-vacia','No hay colaboradores de ejemplo con esos filtros.'));
    return;
  }
  for (const m of visibles) {
    const tarjeta = crearElemento('article',`tarjeta-colaborador${m.activo ? '' : ' inactivo'}`);
    const superior = crearElemento('div','superior-tarjeta');
    const avatar = crearElemento('div','avatar-muestra',iniciales(m.nombre));
    avatar.style.setProperty('--tono', tonos[m.id % tonos.length]);
    avatar.setAttribute('aria-hidden','true');
    const datos = crearElemento('div','detalles-muestra');
    datos.append(crearElemento('h3','',m.nombre));
    const campus = crearElemento('p','');
    campus.append(crearElemento('span','', 'Campus: '),crearElemento('strong','',m.campus));
    const carga = crearElemento('p','');
    carga.append(crearElemento('span','', 'Núm. aspirantes (ejemplo): '),crearElemento('strong','',String(m.aspirantes)));
    datos.append(campus,carga);
    superior.append(avatar, datos);
    const contacto = crearElemento('div','contacto-muestra');
    contacto.append(crearElemento('span','',`☎ 644 000 ${String(m.id).padStart(4,'0')} (ficticio)`));
    contacto.append(crearElemento('span','correo-ficticio',`✉ colaborador${m.id}@ejemplo.test`));
    tarjeta.append(superior, contacto);
    contenedor.append(tarjeta);
  }
}

function bloquearBusqueda(bloqueada) {
  $('buscar-colaborador').disabled = bloqueada;
  $('buscar-colaborador').textContent = bloqueada ? 'Buscando…' : 'Buscar';
}

function actualizarPaso1() {
  $('campus').disabled = !estado.perfil;
  $('opciones-campus').querySelectorAll('input').forEach((radio) => { radio.disabled = !estado.perfil; });
  $('continuar').disabled = !puedeContinuar({
    perfil: estado.perfil, campus: estado.campus, campusDisponibles: estado.campusDisponibles,
  });
  $('error-campus').hidden = !estado.perfil || Boolean(estado.campus);
}

function actualizarPaso2() {
  const disponibles = estado.catalogo[estado.campus] || [];
  const manual = $('distribucion-manual').checked;
  const valido = manual && puedeGuardarCarreras({ carreras: [...estado.carreras], disponibles });
  $('guardar-borrador').disabled = !valido;
  $('error-carreras').hidden = !manual || valido;
  $('mensaje-manual').hidden = manual;
  $('lista-carreras').querySelectorAll('input').forEach((input) => { input.disabled = !manual; });
  $('total-carreras').textContent = String(estado.carreras.size);
}

function limpiarPerfil() {
  estado.perfil = null;
  estado.campus = '';
  estado.carreras.clear();
  $('resultado-id').textContent = '';
  $('foto-perfil').hidden = true;
  $('foto-perfil').removeAttribute('src');
  $('iniciales-perfil').textContent = '▧';
  $('campus').value = '';
  $('opciones-campus').querySelectorAll('input').forEach((radio) => { radio.checked = false; });
  for (const id of ['nombre-perfil','apellido-perfil','correo-perfil','telefono-perfil']) $(id).value = 'N/A';
  actualizarPaso1();
}

// El proveedor devuelve nombreCompleto, no campos separados.
// La separación es solo de presentación y NO altera los datos institucionales.
function nombreParaVista(nombreCompleto) {
  const partes = String(nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length < 3) return [nombreCompleto || 'N/A', 'N/A'];
  return [partes.slice(0, -2).join(' '), partes.slice(-2).join(' ')];
}

function mostrarPerfil(perfil) {
  const [nombres, apellidos] = nombreParaVista(perfil.nombreCompleto);
  $('nombre-perfil').value = nombres;
  $('apellido-perfil').value = apellidos;
  $('correo-perfil').value = perfil.correoInstitucional || 'N/A';
  $('telefono-perfil').value = perfil.telefono || 'N/A';
  $('iniciales-perfil').textContent = iniciales(perfil.nombreCompleto);
  const foto = $('foto-perfil');
  foto.hidden = true;
  if (typeof perfil.fotoUrl === 'string' && /^https:\/\//.test(perfil.fotoUrl)) {
    foto.onload = () => { foto.hidden = false; };
    foto.onerror = () => { foto.hidden = true; };
    foto.src = perfil.fotoUrl;
  }
  $('resultado-id').textContent = '✓ ¡Encontrado!';
}

function cambiarPaso(paso) {
  estado.paso = paso;
  $('paso-1').hidden = paso !== 1;
  $('paso-2').hidden = paso !== 2;
  $('indicador-1').removeAttribute('aria-current');
  $('indicador-2').removeAttribute('aria-current');
  $(`indicador-${paso}`).setAttribute('aria-current','step');
  if (paso === 1) $('id-colaborador').focus();
  else $('distribucion-manual').focus();
}

function abrirModal() {
  estado.ultimoFoco = document.activeElement;
  $('capa-registro').hidden = false;
  document.body.style.overflow = 'hidden';
  cambiarPaso(estado.paso);
}
function cerrarModal() {
  // Cancelar cierra el formulario y limpia el estado LOCAL de esta vista.
  // No elimina borradores que ya se hayan guardado en el servidor (EQ-56).
  estado.consulta++;
  $('capa-registro').hidden = true;
  document.body.style.overflow = '';
  $('id-colaborador').value = '';
  limpiarPerfil();
  mostrarMensaje($('mensaje-busqueda'));
  mostrarMensaje($('mensaje-guardado'));
  bloquearBusqueda(false);
  $('distribucion-manual').checked = true;
  estado.paso = 1;
  $('paso-1').hidden = false;
  $('paso-2').hidden = true;
  $('indicador-2').removeAttribute('aria-current');
  $('indicador-1').setAttribute('aria-current', 'step');
  estado.ultimoFoco?.focus?.();
}

async function buscarColaborador(event) {
  event.preventDefault();
  const id = $('id-colaborador').value.trim();
  estado.consulta++;
  const actual = estado.consulta;
  limpiarPerfil();
  mostrarMensaje($('mensaje-busqueda'));
  if (!idValido(id)) {
    mostrarMensaje($('mensaje-busqueda'),'Escribe un ID institucional numérico de 5 a 20 dígitos.');
    return;
  }
  bloquearBusqueda(true);
  try {
    const { perfil } = await solicitar(`/api/v1/colaboradores/registro/perfil/${encodeURIComponent(id)}`);
    if (actual !== estado.consulta) return;
    estado.perfil = perfil;
    mostrarPerfil(perfil);
    actualizarPaso1();
  } catch (error) {
    if (actual === estado.consulta) mostrarMensaje($('mensaje-busqueda'),error.message);
  } finally {
    if (actual === estado.consulta) bloquearBusqueda(false);
  }
}

function dibujarCampus() {
  const contenedor = $('opciones-campus');
  contenedor.replaceChildren();
  const selector = $('campus');
  selector.replaceChildren(new Option('Selecciona un campus',''));
  for (const nombre of estado.campusDisponibles) {
    selector.add(new Option(nombre,nombre));
    const etiqueta = crearElemento('label','opcion-campus');
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'opcion-campus'; radio.value = nombre;
    radio.disabled = !estado.perfil;
    radio.checked = estado.campus === nombre;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      if (estado.campus !== nombre) estado.carreras.clear();
      estado.campus = nombre;
      selector.value = nombre;
      actualizarPaso1();
    });
    etiqueta.append(radio,document.createTextNode(nombre));
    contenedor.append(etiqueta);
  }
  actualizarPaso1();
}

function dibujarCarreras() {
  const lista = $('lista-carreras');
  lista.replaceChildren();
  $('resumen-campus').textContent = estado.campus;
  for (const carrera of estado.catalogo[estado.campus] || []) {
    const etiqueta = crearElemento('label','opcion-carrera');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.value = carrera; checkbox.name = 'carreras';
    checkbox.checked = estado.carreras.has(carrera);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) estado.carreras.add(carrera);
      else estado.carreras.delete(carrera);
      mostrarMensaje($('mensaje-guardado'));
      actualizarPaso2();
    });
    etiqueta.append(checkbox,crearElemento('span','',carrera),crearElemento('small','sin-cantidad','—'));
    lista.append(etiqueta);
  }
  actualizarPaso2();
}

async function continuar() {
  if (!puedeContinuar({ perfil: estado.perfil, campus: estado.campus, campusDisponibles: estado.campusDisponibles })) return;
  $('continuar').disabled = true;
  mostrarMensaje($('mensaje-busqueda'));
  try {
    await solicitar('/api/v1/colaboradores/registro/borrador', {
      method: 'POST', body: JSON.stringify({ idInstitucional: estado.perfil.idInstitucional, campus: estado.campus }),
    });
    dibujarCarreras();
    cambiarPaso(2);
  } catch (error) {
    mostrarMensaje($('mensaje-busqueda'),error.message);
  } finally {
    actualizarPaso1();
  }
}

async function guardar() {
  const disponibles = estado.catalogo[estado.campus] || [];
  const carreras = [...estado.carreras];
  if (!$('distribucion-manual').checked || !puedeGuardarCarreras({ carreras, disponibles })) {
    actualizarPaso2();
    return;
  }
  $('guardar-borrador').disabled = true;
  mostrarMensaje($('mensaje-guardado'));
  try {
    const resultado = await solicitar('/api/v1/colaboradores/registro/borrador', {
      method: 'POST', body: JSON.stringify({ idInstitucional: estado.perfil.idInstitucional, campus: estado.campus, carreras }),
    });
    if (resultado.borrador?.estado === 'BORRADOR') {
      mostrarMensaje($('mensaje-guardado'),`Borrador guardado con ${carreras.length} carrera(s). El colaborador NO está registrado; la confirmación corresponde a EQ-64.`,'exito');
    }
  } catch (error) {
    mostrarMensaje($('mensaje-guardado'),error.message);
  } finally {
    actualizarPaso2();
  }
}

async function cargarCatalogo() {
  const { campus, carrerasPorCampus } = await solicitar('/api/v1/colaboradores/registro/catalogo');
  estado.catalogo = carrerasPorCampus;
  estado.campusDisponibles = campus;
  dibujarCampus();
}

function capturarTeclado(event) {
  if ($('capa-registro').hidden) return;
  if (event.key === 'Escape') { cerrarModal(); return; }
  if (event.key !== 'Tab') return;
  const elementos = [...$('capa-registro').querySelectorAll('button, input:not([type=hidden]), select, a[href]')]
    .filter((e) => !e.disabled && !e.hidden && e.getClientRects().length);
  if (!elementos.length) return;
  const primero = elementos[0], ultimo = elementos.at(-1);
  if (event.shiftKey && document.activeElement === primero) { event.preventDefault(); ultimo.focus(); }
  else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primero.focus(); }
}

async function iniciar() {
  try {
    const { usuario } = await solicitar('/api/v1/auth/session');
    if (usuario.rol !== 'administrador') { window.location.replace('/app'); return; }
    $('nombre-usuario').textContent = usuario.nombreCompleto;
    await cargarCatalogo();
  } catch (error) {
    // Se informa del problema sin inventar un catálogo o habilitar el registro.
    abrirModal();
    mostrarMensaje($('mensaje-busqueda'),error.message);
    return;
  }
  pintarFiltrosMuestra();
  pintarMuestra();
  $('buscar-muestra').addEventListener('input', () => { muestraUi.pagina=0; pintarMuestra(); });
  $('ordenar-muestra').addEventListener('change', () => { muestraUi.pagina=0; pintarMuestra(); });
  $('mostrar-inactivos').addEventListener('change', () => { muestraUi.pagina=0; pintarMuestra(); });
  $('pagina-anterior').addEventListener('click', () => { if (muestraUi.pagina > 0) { muestraUi.pagina--; pintarMuestra(); } });
  $('pagina-siguiente').addEventListener('click', () => { muestraUi.pagina++; pintarMuestra(); });
  $('abrir-registro').addEventListener('click', abrirModal);
  $('cerrar-registro').addEventListener('click', cerrarModal);
  document.querySelectorAll('[data-cancelar]').forEach((b) => b.addEventListener('click', cerrarModal));
  $('capa-registro').addEventListener('click',(e) => { if (e.target === $('capa-registro')) cerrarModal(); });
  document.addEventListener('keydown',capturarTeclado);
  $('form-busqueda').addEventListener('submit',buscarColaborador);
  $('id-colaborador').addEventListener('input',() => {
    estado.consulta++;
    bloquearBusqueda(false);
    limpiarPerfil();
    mostrarMensaje($('mensaje-busqueda'));
  });
  $('continuar').addEventListener('click',continuar);
  $('anterior').addEventListener('click',() => { mostrarMensaje($('mensaje-guardado')); cambiarPaso(1); });
  $('distribucion-manual').addEventListener('change',actualizarPaso2);
  $('guardar-borrador').addEventListener('click',guardar);
  $('cerrar-sesion').addEventListener('click',async () => {
    await solicitar('/api/v1/auth/logout',{method:'POST'});
    window.location.replace('/');
  });
  if (new URLSearchParams(window.location.search).has('registro')) abrirModal();
}

iniciar();
