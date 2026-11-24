/**
 * HU 6 · Administrador de colaboradores.
 *   EQ-62 / EQ-63 · pasos 1 y 2 del registro (perfil, campus, carreras, borrador)
 *   EQ-71 · HU6-12 · listado (módulo compartido listado-colaboradores.js)
 *   EQ-64 · HU6-17 · paso 3: revisión de la distribución y confirmación (EQ-59)
 */
import {
  idValido, puedeContinuar, puedeGuardarCarreras, puedeIrARevision, puedeConfirmar, describirCambioCarga,
} from './validaciones.js';
import { inicialesUsuario } from '../js/usuario.js';
import { iniciarListadoColaboradores, recargarListado } from './listado-colaboradores.js';

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
  vistaPrevia: null,
  confirmado: false,
};

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

// El listado (EQ-71) vive en listado-colaboradores.js; lo comparte la vista de colaborador.

// ---------- Paso 1 (EQ-62) ----------

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

// ---------- Paso 2 (EQ-63) ----------

function actualizarPaso2() {
  const disponibles = estado.catalogo[estado.campus] || [];
  const manual = $('distribucion-manual').checked;
  const carreras = [...estado.carreras];
  const valido = manual && puedeGuardarCarreras({ carreras, disponibles });
  $('guardar-borrador').disabled = !valido;
  $('ir-revision').disabled = !puedeIrARevision({ carreras, disponibles, manual });
  $('error-carreras').hidden = !manual || valido;
  $('mensaje-manual').hidden = manual;
  $('lista-carreras').querySelectorAll('input').forEach((input) => { input.disabled = !manual; });
  $('total-carreras').textContent = String(estado.carreras.size);
}

function limpiarPerfil() {
  estado.perfil = null;
  estado.campus = '';
  estado.carreras.clear();
  estado.vistaPrevia = null;
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

const FOCO_POR_PASO = { 1: 'id-colaborador', 2: 'distribucion-manual', 3: 'confirmar-registro' };

function cambiarPaso(paso) {
  estado.paso = paso;
  for (const n of [1, 2, 3]) {
    $(`paso-${n}`).hidden = paso !== n;
    $(`indicador-${n}`).removeAttribute('aria-current');
  }
  $(`indicador-${paso}`).setAttribute('aria-current', 'step');
  const foco = $(FOCO_POR_PASO[paso]);
  if (foco && !foco.disabled) foco.focus();
  else $(`paso-${paso}`).querySelector('button:not([disabled])')?.focus();
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
  mostrarMensaje($('mensaje-confirmacion'));
  bloquearBusqueda(false);
  $('distribucion-manual').checked = true;
  estado.confirmado = false;
  $('confirmar-registro').textContent = 'Confirmar registro';
  $('anterior-3').disabled = false;
  for (const n of [1, 2, 3]) {
    $(`paso-${n}`).hidden = n !== 1;
    $(`indicador-${n}`).removeAttribute('aria-current');
  }
  estado.paso = 1;
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
      if (estado.campus !== nombre) { estado.carreras.clear(); estado.vistaPrevia = null; }
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
      estado.vistaPrevia = null;
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
      mostrarMensaje($('mensaje-guardado'),`Borrador guardado con ${carreras.length} carrera(s). El colaborador todavía NO está registrado: revisa y confirma en el paso 3.`,'exito');
    }
  } catch (error) {
    mostrarMensaje($('mensaje-guardado'),error.message);
  } finally {
    actualizarPaso2();
  }
}

// ---------- Paso 3 (EQ-64) ----------

function celda(texto, clase) {
  const td = crearElemento('td', clase, texto);
  return td;
}

function pintarRevision(vista) {
  $('revision-nombre').textContent = vista.colaborador.nombreCompleto;
  $('revision-id').textContent = vista.colaborador.idInstitucional;
  $('revision-campus').textContent = vista.campus;
  $('revision-total').textContent = String(vista.totalAspirantes);

  $('revision-carreras').replaceChildren(...vista.carreras.map((c) => {
    const fila = document.createElement('tr');
    const responsables = c.responsablesActuales.map((r) => `${r.nombreCompleto ?? `ID ${r.colaboradorId}`} (${r.aspirantes})`);
    if (c.sinResponsable) responsables.push(`Sin asignar (${c.sinResponsable})`);
    fila.append(celda(c.carrera), celda(String(c.totalAspirantes), 'num'), celda(responsables.join(', ') || '—'));
    return fila;
  }));

  $('revision-cargas').replaceChildren(...vista.cargas.map((carga) => {
    const fila = document.createElement('tr');
    if (carga.esNuevo) fila.className = 'es-nuevo';
    const nombre = `${carga.nombreCompleto ?? `ID ${carga.colaboradorId}`}${carga.esNuevo ? ' (nuevo registro)' : ''}`;
    const despues = celda(`${carga.despues} `, 'num');
    const cambio = describirCambioCarga(carga);
    despues.append(crearElemento('small', carga.despues >= carga.antes ? 'cambio-sube' : 'cambio-baja', `(${cambio})`));
    fila.append(celda(nombre), celda(String(carga.antes), 'num'), despues);
    return fila;
  }));

  $('aviso-sin-aspirantes').hidden = vista.totalAspirantes > 0;
}

function actualizarPaso3() {
  $('confirmar-registro').disabled = estado.confirmado || !puedeConfirmar({
    vistaPrevia: estado.vistaPrevia,
    idInstitucional: estado.perfil?.idInstitucional,
    campus: estado.campus,
    carreras: [...estado.carreras],
  });
}

async function irARevision() {
  const disponibles = estado.catalogo[estado.campus] || [];
  const carreras = [...estado.carreras];
  if (!puedeIrARevision({ carreras, disponibles, manual: $('distribucion-manual').checked })) {
    actualizarPaso2();
    return;
  }
  $('ir-revision').disabled = true;
  mostrarMensaje($('mensaje-guardado'));
  try {
    estado.vistaPrevia = await solicitar('/api/v1/colaboradores/registro/vista-previa', {
      method: 'POST',
      body: JSON.stringify({ idInstitucional: estado.perfil.idInstitucional, campus: estado.campus, carreras }),
    });
    pintarRevision(estado.vistaPrevia);
    mostrarMensaje($('mensaje-confirmacion'));
    actualizarPaso3();
    cambiarPaso(3);
  } catch (error) {
    mostrarMensaje($('mensaje-guardado'), error.message);
  } finally {
    actualizarPaso2();
  }
}

async function confirmarRegistro() {
  actualizarPaso3();
  if ($('confirmar-registro').disabled) return;
  $('confirmar-registro').disabled = true;
  $('anterior-3').disabled = true;
  mostrarMensaje($('mensaje-confirmacion'));
  try {
    const resultado = await solicitar('/api/v1/colaboradores/registro', {
      method: 'POST',
      body: JSON.stringify({
        idInstitucional: estado.perfil.idInstitucional,
        campus: estado.campus,
        carreras: [...estado.carreras],
      }),
    });
    estado.confirmado = true;
    mostrarMensaje($('mensaje-confirmacion'),
      `Registro confirmado: ${resultado.colaborador.nombreCompleto} ahora atiende ${resultado.asignacion.totalAspirantesAsignados} aspirante(s). Se le enviará un correo de bienvenida.`,
      'exito');
    $('confirmar-registro').textContent = 'Registrado ✓';
    recargarListado();
  } catch (error) {
    $('anterior-3').disabled = false;
    mostrarMensaje($('mensaje-confirmacion'), error.message);
    actualizarPaso3();
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
    $('avatar-usuario').textContent = inicialesUsuario(usuario.nombreCompleto);
    await cargarCatalogo();
  } catch (error) {
    // Se informa del problema sin inventar un catálogo o habilitar el registro.
    abrirModal();
    mostrarMensaje($('mensaje-busqueda'),error.message);
    return;
  }
  iniciarListadoColaboradores({ esAdministrador: true });
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
  $('ir-revision').addEventListener('click', irARevision);
  $('anterior-3').addEventListener('click', () => { mostrarMensaje($('mensaje-confirmacion')); cambiarPaso(2); });
  $('confirmar-registro').addEventListener('click', confirmarRegistro);
  $('cerrar-sesion').addEventListener('click',async () => {
    await solicitar('/api/v1/auth/logout',{method:'POST'});
    window.location.replace('/');
  });
  if (new URLSearchParams(window.location.search).has('registro')) abrirModal();
}

iniciar();
