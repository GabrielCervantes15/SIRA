/**
 * HU6-18 · HU7: modal «Baja de colaborador» (Figma).
 *   1. Al abrir, pide la vista previa: el servidor calcula la reasignación por campus.
 *   2. El administrador elige la duración (indefinida o periodo).
 *   3. «Dar de baja» confirma; el servidor vuelve a calcular con el estado actual.
 */
import { errorDuracionBaja, puedeDarDeBaja, formatearFecha } from './validaciones.js';

const $ = (id) => document.getElementById(id);
const hoy = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD en hora local

function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}
const iniciales = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase();

/**
 * @param {{ solicitar: Function, alConfirmar?: () => void }} dependencias
 * @returns {{ abrir: (colaborador: Object) => Promise<void> }}
 */
export function iniciarBaja({ solicitar, alConfirmar = () => {} }) {
  const estado = { colaborador: null, vistaPrevia: null, enviando: false, ultimoFoco: null, consulta: 0, hecho: false };

  const duracion = () => ({
    tipo: document.querySelector('input[name="baja-tipo"]:checked')?.value ?? 'indefinido',
    inicio: $('baja-inicio').value,
    fin: $('baja-fin').value,
  });

  function mensaje(texto = '', tipo = 'error') {
    const p = $('baja-estado');
    p.textContent = texto;
    p.className = `registro-mensaje ${tipo}`;
    p.hidden = !texto;
  }

  function actualizar() {
    const d = duracion();
    const periodo = d.tipo === 'periodo';
    $('baja-inicio').disabled = !periodo;
    $('baja-fin').disabled = !periodo;
    const error = periodo && (d.inicio || d.fin) ? errorDuracionBaja(d, hoy()) : null;
    $('baja-error-duracion').textContent = error ?? '';
    $('baja-error-duracion').hidden = !error;
    $('baja-confirmar').disabled = estado.hecho || !puedeDarDeBaja({ vistaPrevia: estado.vistaPrevia, duracion: d, hoy: hoy(), enviando: estado.enviando });
  }

  function pintarDistribucion(vista) {
    $('baja-campus').textContent = vista.informacionActual.campus ?? '—';
    $('baja-aspirantes').textContent = String(vista.informacionActual.aspirantes);
    $('baja-carreras').textContent = String(vista.informacionActual.carreras);
    const lista = $('baja-distribucion');
    lista.replaceChildren();
    if (!vista.distribucion.length) {
      lista.append(el('p', 'cuadricula-vacia', 'No tiene carreras ni aspirantes por reasignar.'));
      return;
    }
    for (const r of vista.distribucion) {
      const tarjeta = el('article', 'baja-receptor');
      const avatar = el('div', 'baja-avatar', iniciales(r.nombreCompleto));
      avatar.setAttribute('aria-hidden', 'true');
      const quien = el('div', 'baja-receptor-datos');
      quien.append(el('strong', '', r.nombreCompleto ?? `ID ${r.colaboradorId}`), el('small', '', r.campus ?? ''));
      const nuevos = el('span', '', 'Nuevos Aspirantes: ');
      nuevos.append(el('b', '', `+${r.nuevosAspirantes}`));
      quien.append(nuevos, el('small', '', `Carga: ${r.antes} → ${r.despues}`));
      const carreras = el('ul', 'baja-receptor-carreras');
      for (const c of r.carreras) {
        const li = el('li');
        const nombre = el('span', '', c.carrera);
        nombre.title = c.carrera;
        li.append(nombre, el('b', '', String(c.aspirantes)));
        carreras.append(li);
      }
      tarjeta.append(avatar, quien, carreras);
      lista.append(tarjeta);
    }
  }

  async function abrir(colaborador) {
    estado.colaborador = colaborador;
    estado.vistaPrevia = null;
    estado.hecho = false;
    estado.enviando = false;
    estado.ultimoFoco = document.activeElement;
    const consulta = ++estado.consulta;
    const nombre = colaborador.nombreCompleto ?? `ID ${colaborador.idInstitucional}`;
    $('baja-titulo').textContent = `Baja de ${nombre}`;
    document.querySelector('input[name="baja-tipo"][value="indefinido"]').checked = true;
    $('baja-inicio').value = hoy();
    $('baja-fin').value = '';
    $('baja-inicio').min = hoy();
    $('baja-fin').min = hoy();
    $('baja-distribucion').replaceChildren(el('p', 'cuadricula-vacia', 'Calculando la reasignación…'));
    for (const id of ['baja-campus', 'baja-aspirantes', 'baja-carreras']) $(id).textContent = '—';
    $('baja-confirmar').textContent = 'Dar de baja';
    $('baja-cancelar').textContent = 'Cancelar';
    mensaje();
    $('capa-baja').hidden = false;
    document.body.style.overflow = 'hidden';
    actualizar();
    $('baja-cancelar').focus();
    try {
      const vista = await solicitar(`/api/v1/colaboradores/${encodeURIComponent(colaborador.idInstitucional)}/baja/vista-previa`, { method: 'POST', body: '{}' });
      if (consulta !== estado.consulta) return;
      estado.vistaPrevia = vista;
      pintarDistribucion(vista);
    } catch (error) {
      if (consulta !== estado.consulta) return;
      $('baja-distribucion').replaceChildren();
      mensaje(error.message); // p. ej. SIN_COLABORADOR_RELEVO: no se permite la baja
    }
    actualizar();
  }

  function cerrar() {
    estado.consulta++;
    $('capa-baja').hidden = true;
    document.body.style.overflow = '';
    estado.ultimoFoco?.focus?.();
  }

  async function confirmar() {
    const d = duracion();
    if (!puedeDarDeBaja({ vistaPrevia: estado.vistaPrevia, duracion: d, hoy: hoy() })) return actualizar();
    estado.enviando = true;
    $('baja-confirmar').textContent = 'Dando de baja…';
    mensaje();
    actualizar();
    try {
      const r = await solicitar(`/api/v1/colaboradores/${encodeURIComponent(estado.colaborador.idInstitucional)}/baja`, {
        method: 'POST',
        body: JSON.stringify(d.tipo === 'periodo' ? d : { tipo: 'indefinido' }),
      });
      estado.hecho = true;
      const hasta = r.colaborador.periodoBaja.hasta;
      mensaje(`Baja confirmada${hasta ? ` hasta el ${formatearFecha(hasta)}` : ' de forma indefinida'}: ${r.reasignacion.totalAspirantes} aspirante(s) reasignados a ${r.reasignacion.receptores.length} colaborador(es). Se les notificará por correo.`, 'exito');
      $('baja-confirmar').textContent = 'Baja registrada ✓';
      $('baja-cancelar').textContent = 'Cerrar';
      alConfirmar();
    } catch (error) {
      $('baja-confirmar').textContent = 'Dar de baja';
      mensaje(error.message);
    } finally {
      estado.enviando = false;
      actualizar();
    }
  }

  $('cerrar-baja').addEventListener('click', cerrar);
  $('baja-cancelar').addEventListener('click', cerrar);
  $('baja-confirmar').addEventListener('click', confirmar);
  $('capa-baja').addEventListener('click', (e) => { if (e.target === $('capa-baja')) cerrar(); });
  document.querySelectorAll('input[name="baja-tipo"], #baja-inicio, #baja-fin').forEach((i) => i.addEventListener('input', actualizar));
  document.addEventListener('keydown', (e) => {
    if ($('capa-baja').hidden) return;
    if (e.key === 'Escape') { cerrar(); return; }
    if (e.key !== 'Tab') return;
    const f = [...$('capa-baja').querySelectorAll('button, input, a[href]')].filter((x) => !x.disabled && x.getClientRects().length);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  });

  return { abrir };
}
