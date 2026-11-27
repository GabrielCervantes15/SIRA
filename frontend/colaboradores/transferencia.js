/**
 * EQ-73 · HU6-19: Pantalla de transferencia manual de expedientes entre campus.
 *
 * Conectada directamente al backend real de EQ-70:
 *   - GET  /api/v1/auth/session
 *   - GET  /api/v1/colaboradores
 *   - POST /api/v1/colaboradores/transferencias-manuales
 */
import {
  aspiranteIdValido,
  filtrarColaboradoresCasosEspeciales,
  puedeTransferirManual,
  describirErrorTransferencia,
  etiquetaCampus,
} from './validaciones.js';
import { inicialesUsuario } from '../js/usuario.js';

const $ = (id) => document.getElementById(id);

const estado = {
  colaboradores: [],
  campusDisponibles: [],
  filtroCampus: '',
  busqueda: '',
  aspiranteId: '',
  colaboradorDestino: '',
  tocadoAspirante: false,
  enviando: false,
  transferenciasSesion: [],
};

function crearElemento(tag, clase, texto) {
  const el = document.createElement(tag);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

async function solicitar(ruta, opciones = {}) {
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
    const error = new Error(datos.mensaje || 'No se pudo completar la solicitud.');
    error.codigo = datos.codigo;
    error.status = respuesta.status;
    throw error;
  }
  return datos;
}

function mostrarMensaje(texto = '', tipo = 'error') {
  const alerta = $('mensaje-transferencia');
  alerta.textContent = texto;
  alerta.className = `registro-mensaje ${tipo}`;
  alerta.hidden = !texto;
}

function obtenerColaboradorSeleccionado() {
  return (
    estado.colaboradores.find(
      (c) =>
        c.idInstitucional === estado.colaboradorDestino &&
        c.activo === true &&
        c.casosEspeciales === true
    ) || null
  );
}

function actualizarResumenYBoton() {
  const idLimpio = estado.aspiranteId.trim();
  const idEsValido = aspiranteIdValido(idLimpio);
  $('error-aspirante-id').hidden = !estado.tocadoAspirante || idEsValido;

  const destino = obtenerColaboradorSeleccionado();
  $('resumen-aspirante-id').textContent = idEsValido ? idLimpio : '—';
  $('resumen-colaborador-destino').textContent = destino
    ? `${destino.nombreCompleto ?? `ID ${destino.idInstitucional}`} (${destino.idInstitucional})`
    : '—';
  $('resumen-campus-destino').textContent = destino?.campus || '—';

  const habilitado = puedeTransferirManual({
    aspiranteId: idLimpio,
    colaboradorDestino: estado.colaboradorDestino,
    colaboradores: estado.colaboradores,
    enviando: estado.enviando,
  });
  $('confirmar-transferencia').disabled = !habilitado;
  $('confirmar-transferencia').textContent = estado.enviando
    ? 'Transfiriendo…'
    : 'Transferir expediente';
}

function pintarSelectorCampus() {
  const select = $('filtro-campus-destino');
  const valorActual = estado.filtroCampus;
  select.replaceChildren(new Option('Todos los campus', ''));
  for (const campus of estado.campusDisponibles) {
    select.add(new Option(campus, campus));
  }
  select.value = estado.campusDisponibles.includes(valorActual) ? valorActual : '';
}

function pintarColaboradoresDestino() {
  const todosLosAutorizados = filtrarColaboradoresCasosEspeciales(estado.colaboradores);
  $('conteo-autorizados').textContent = String(todosLosAutorizados.length);
  $('aviso-sin-autorizados').hidden = todosLosAutorizados.length > 0;

  // Si el colaborador previamente seleccionado dejó de estar autorizado, limpiar selección
  if (
    estado.colaboradorDestino &&
    !todosLosAutorizados.some((c) => c.idInstitucional === estado.colaboradorDestino)
  ) {
    estado.colaboradorDestino = '';
  }

  const filtrados = filtrarColaboradoresCasosEspeciales(estado.colaboradores, {
    campus: estado.filtroCampus,
    busqueda: estado.busqueda,
  });

  const contenedor = $('lista-colaboradores-destino');
  contenedor.replaceChildren();

  if (todosLosAutorizados.length === 0) {
    contenedor.append(
      crearElemento(
        'p',
        'cuadricula-vacia',
        'Ningún colaborador activo tiene habilitada la casilla «Casos especiales».'
      )
    );
    actualizarResumenYBoton();
    return;
  }

  if (filtrados.length === 0) {
    contenedor.append(
      crearElemento(
        'p',
        'cuadricula-vacia',
        'No hay colaboradores autorizados que coincidan con el filtro seleccionado.'
      )
    );
    actualizarResumenYBoton();
    return;
  }

  for (const colab of filtrados) {
    const nombre = colab.nombreCompleto ?? `ID ${colab.idInstitucional}`;
    const etiqueta = crearElemento('label', 'opcion-colaborador-destino');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'colaboradorDestino';
    radio.value = colab.idInstitucional;
    radio.checked = estado.colaboradorDestino === colab.idInstitucional;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      estado.colaboradorDestino = colab.idInstitucional;
      actualizarResumenYBoton();
    });

    const datos = crearElemento('div', 'datos-destino-item');
    const cabecera = crearElemento('div', 'cabecera-destino-item');
    cabecera.append(
      crearElemento('strong', '', `${nombre} · ${colab.idInstitucional}`),
      crearElemento('span', 'insignia-casos-especiales', 'Casos especiales')
    );

    const meta = crearElemento(
      'div',
      'meta-destino-item',
      `Campus base: ${etiquetaCampus(colab.campus) || colab.campus || '—'} · Cartera actual: ${colab.totalAspirantes ?? 0} aspirante(s)`
    );
    const carreras = crearElemento(
      'div',
      'carreras-destino-item',
      `Carreras: ${(colab.carreras ?? []).join(' · ') || 'Sin carreras'}`
    );

    datos.append(cabecera, meta, carreras);
    etiqueta.append(radio, datos);
    contenedor.append(etiqueta);
  }

  actualizarResumenYBoton();
}

function pintarConfirmacionTransferencia(transferencia, destinoObj) {
  const nombreAspirante = transferencia.nombreCompleto
    ? `${transferencia.nombreCompleto} (${transferencia.aspiranteId})`
    : transferencia.aspiranteId;
  const nombreDestino = destinoObj?.nombreCompleto
    ? `${destinoObj.nombreCompleto} (${transferencia.colaboradorDestino})`
    : transferencia.colaboradorDestino;

  $('conf-aspirante').textContent = nombreAspirante;
  $('conf-campus-origen').textContent = transferencia.campusOrigen || '—';
  $('conf-origen').textContent = transferencia.colaboradorOrigen || 'Sin asignar';
  $('conf-destino').textContent = nombreDestino;
  $('conf-campus-destino').textContent = transferencia.campusDestino || '—';
  $('conf-motivo').textContent = transferencia.motivo || 'manual';
  $('conf-fecha').textContent = transferencia.fechaTransferencia
    ? new Date(transferencia.fechaTransferencia).toLocaleString('es-MX')
    : '—';
  $('tarjeta-ultima-transferencia').hidden = false;

  estado.transferenciasSesion.unshift({
    ...transferencia,
    nombreDestino,
  });

  const lista = $('historial-transferencias-sesion');
  lista.replaceChildren();
  for (const item of estado.transferenciasSesion) {
    const li = crearElemento('li', 'item-historial-sesion');
    const lineaPrincipal = crearElemento(
      'div',
      '',
      `Expediente ${item.aspiranteId}${item.nombreCompleto ? ` (${item.nombreCompleto})` : ''} → ${item.nombreDestino}`
    );
    const lineaCampus = crearElemento(
      'small',
      '',
      `De ${item.campusOrigen || '—'} (resp. ${item.colaboradorOrigen || 'N/A'}) a ${item.campusDestino || '—'} · Motivo: ${item.motivo || 'manual'}`
    );
    li.append(lineaPrincipal, lineaCampus);
    lista.append(li);
  }
}

async function cargarColaboradores() {
  const respuesta = await solicitar('/api/v1/colaboradores');
  estado.colaboradores = Array.isArray(respuesta.colaboradores) ? respuesta.colaboradores : [];
  estado.campusDisponibles = Array.isArray(respuesta.campus) ? respuesta.campus : [];
  pintarSelectorCampus();
  pintarColaboradoresDestino();
}

async function enviarTransferencia(event) {
  event.preventDefault();
  estado.tocadoAspirante = true;
  const idLimpio = estado.aspiranteId.trim();

  if (
    !puedeTransferirManual({
      aspiranteId: idLimpio,
      colaboradorDestino: estado.colaboradorDestino,
      colaboradores: estado.colaboradores,
      enviando: estado.enviando,
    })
  ) {
    actualizarResumenYBoton();
    return;
  }

  const destinoAntes = obtenerColaboradorSeleccionado();
  estado.enviando = true;
  mostrarMensaje();
  actualizarResumenYBoton();

  try {
    const resultado = await solicitar('/api/v1/colaboradores/transferencias-manuales', {
      method: 'POST',
      body: JSON.stringify({
        aspiranteId: idLimpio,
        colaboradorDestino: estado.colaboradorDestino,
      }),
    });

    pintarConfirmacionTransferencia(resultado.transferencia, destinoAntes);
    mostrarMensaje(
      `Transferencia completada: el expediente ${resultado.transferencia.aspiranteId} (${resultado.transferencia.campusOrigen}) ahora está asignado a ${destinoAntes?.nombreCompleto ?? resultado.transferencia.colaboradorDestino} (${resultado.transferencia.campusDestino}).`,
      'exito'
    );

    estado.aspiranteId = '';
    estado.tocadoAspirante = false;
    $('aspirante-id').value = '';
    await cargarColaboradores();
  } catch (error) {
    mostrarMensaje(describirErrorTransferencia(error.codigo, error.message), 'error');
  } finally {
    estado.enviando = false;
    actualizarResumenYBoton();
  }
}

async function iniciar() {
  try {
    const { usuario } = await solicitar('/api/v1/auth/session');
    if (usuario.rol !== 'administrador') {
      window.location.replace('/app');
      return;
    }
    $('nombre-usuario').textContent = usuario.nombreCompleto;
    $('avatar-usuario').textContent = inicialesUsuario(usuario.nombreCompleto);
    await cargarColaboradores();
  } catch (error) {
    mostrarMensaje(error.message, 'error');
    return;
  }

  $('aspirante-id').addEventListener('input', (e) => {
    estado.aspiranteId = e.target.value;
    estado.tocadoAspirante = true;
    mostrarMensaje();
    actualizarResumenYBoton();
  });

  $('filtro-campus-destino').addEventListener('change', (e) => {
    estado.filtroCampus = e.target.value;
    pintarColaboradoresDestino();
  });

  $('buscar-destino').addEventListener('input', (e) => {
    estado.busqueda = e.target.value;
    pintarColaboradoresDestino();
  });

  $('form-transferencia-manual').addEventListener('submit', enviarTransferencia);

  $('cerrar-sesion').addEventListener('click', async () => {
    await solicitar('/api/v1/auth/logout', { method: 'POST' });
    window.location.replace('/');
  });
}

iniciar();
