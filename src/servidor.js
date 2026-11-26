/** Servidor HTTP de SIRA: API de autenticación y entrega de frontend. */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { crearProveedorAutenticacionSimulado, ErrorAutenticacion } from './modulos/autenticacion/index.js';
import { crearModuloMonitoreo } from './modulos/monitoreo/index.js';
import {
  crearModuloMensajes,
  crearValidadorHorarioEnvio,
  ErrorFueraDeHorarioPermitido,
} from './modulos/mensajes/index.js';
import { crearServicioBorradores } from './modulos/colaboradores/borradores.js';
import { crearCatalogoRegistroDemo } from './modulos/colaboradores/catalogo-registro-demo.js';
import { crearModuloColaboradores } from './modulos/colaboradores/index.js';
import { crearModuloNotificaciones } from './modulos/notificaciones/index.js';
import { crearBusEnMemoria } from './compartido/eventos/bus-en-memoria.js';
import { crearRepositorioConfiguracionEnvio, validarConfiguracion } from './modulos/configuracion-envio/configuracion-envio.js';
import { crearModuloCatalogoMensajes } from './modulos/mensajes-ia/index.js';
import { CrearLoteEnvioCasoUso } from './modulos/disparo-automatico/aplicacion/crear-lote-envio.caso-uso.js';
import { ErrorLoteEnvio } from './modulos/disparo-automatico/dominio/lote-envio.js';
import { RepositorioLotesMemoria } from './modulos/disparo-automatico/infraestructura/repositorio-lotes-memoria.js';
import { conectarConsumidorEnvioSimulado } from './modulos/disparo-automatico/infraestructura/consumidor-envio-simulado.js';
import { crearColaEnvioWhatsApp } from './modulos/disparo-automatico/aplicacion/cola-envio-whatsapp.js';
import { TIPO_ENVIO_SOLICITADO } from './modulos/disparo-automatico/eventos.js';
import { crearProveedorWhatsAppCloudApi, crearProveedorWhatsAppSimulado, leerConfiguracionCloudApi } from './modulos/whatsapp/index.js';
import { crearGeneradorMensajeReactivacion, ErrorMensajeReactivacion, TITULO_FALLO } from './modulos/disparo-automatico/mensaje-reactivacion.js';
import { crearServicioVistaPreviaLote } from './modulos/disparo-automatico/vista-previa-lote.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const FRONTEND_GABRIEL = path.join(ROOT, 'frontend');
const COOKIE_NAME = 'sira_session';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function leerJson(ruta, fallback) {
  try { return JSON.parse(readFileSync(ruta, 'utf8')); } catch { return fallback; }
}

function leerCuerpo(req, maxBytes = 16_384) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(Object.assign(new Error('Solicitud demasiado grande.'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(Object.assign(new Error('El cuerpo de la solicitud no contiene JSON válido.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function cookiesDe(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function responderJson(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(payload));
}

function normalizarIdentificador(identificador, usuarios) {
  const valor = String(identificador || '').trim();
  if (!valor) return '';
  if (!valor.includes('@')) return valor;
  const usuario = usuarios.find((item) => String(item.correoInstitucional || '').toLowerCase() === valor.toLowerCase());
  return usuario?.idInstitucional || valor;
}

function resolverRol(id, permisos, usuariosCrm) {
  if (Array.isArray(usuariosCrm)) {
    const usuario = usuariosCrm.find(
      (item) => String(item.idInstitucional) === String(id)
    );

    if (usuario) {
      if (usuario.activo === false) {
        return 'sin_acceso';
      }

      return usuario.rol === 'administrador'
        ? 'administrador'
        : 'colaborador';
    }
  }

  const administradores = new Set([
    ...(permisos.administradores || []),
    ...(process.env.SIRA_ADMIN_IDS || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  ]);

  return administradores.has(id)
    ? 'administrador'
    : 'colaborador';
}

// EQ-17: Validación de acceso según el rol del usuario.
function verificarAccesoRol(sesion, rolesPermitidos = []) {
  if (!sesion) {
    return {
      status: 401,
      codigo: 'SESION_NO_VALIDA',
      mensaje: 'Debes iniciar sesión para acceder a esta funcionalidad.'
    };
  }

  if (!rolesPermitidos.includes(sesion.usuario?.rol)) {
    return {
      status: 403,
      codigo: 'SIN_PERMISO',
      mensaje: 'No tienes permisos para acceder a esta funcionalidad.'
    };
  }

  return null;
}

function servirArchivo(res, ruta) {
  try {
    const contenido = readFileSync(ruta);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(ruta)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    res.end(contenido);
  } catch {
    responderJson(res, 404, { codigo: 'NO_ENCONTRADO', mensaje: 'Recurso no encontrado.' });
  }
}

export function crearServidor(opciones = {}) {
  const NODE_ENV = process.env.NODE_ENV || 'development';
  const semilla = opciones.usuarios || leerJson(path.join(ROOT, 'datos-semilla/autenticacion.json'), { usuarios: [] }).usuarios;
  const permisos = opciones.permisos || leerJson(path.join(ROOT, 'datos-semilla/permisos-sira.json'), { administradores: [], usuariosSinAcceso: [] });
  const proveedor = opciones.proveedor || crearProveedorAutenticacionSimulado({ usuarios: semilla, indisponible: process.env.SIRA_IDENTITY_UNAVAILABLE === 'true' });
  const duracionSesionMs = opciones.duracionSesionMs ?? Number(process.env.SIRA_SESSION_TTL_MS || 1_800_000);
  const sesiones = new Map();
  const reloj = opciones.reloj || Date.now;
  const obtenerFechaReloj = () => {
    const valor = reloj();
    return valor instanceof Date ? new Date(valor.getTime()) : new Date(valor);
  };
  const sinAcceso = new Set([...(permisos.usuariosSinAcceso || []), ...(process.env.SIRA_DENIED_IDS || '').split(',').map((v) => v.trim()).filter(Boolean)]);
  const moduloMonitoreo = opciones.moduloMonitoreo || crearModuloMonitoreo();
  // HU 8 (EQ-95..97): catálogo de mensajes aprobado en EQ-93.
  const moduloCatalogoMensajes = opciones.moduloCatalogoMensajes || crearModuloCatalogoMensajes();
  // EQ-62/EQ-63: adaptadores TEMPORALES hasta integrar EQ-55 y EQ-57.
  const aspirantesDemo = leerJson(path.join(ROOT, 'datos-semilla/aspirantes.json'), { aspirantes: [] }).aspirantes;
  const catalogoRegistro = opciones.catalogoRegistro || crearCatalogoRegistroDemo(aspirantesDemo);
  const borradoresRegistro = opciones.borradoresRegistro || crearServicioBorradores();
  const busEventos = opciones.busEventos || opciones.bus || crearBusEnMemoria();
  // HU 6: módulo Colaboradores (EQ-55, EQ-59, EQ-64, EQ-71). La semilla de colaboradores
  // registrados solo acompaña a los usuarios semilla; si una prueba inyecta sus propios
  // usuarios, arranca sin colaboradores salvo los de idsColaboradoresYaRegistrados.
  const colaboradoresSemilla = opciones.colaboradores
    ?? (opciones.usuarios ? [] : leerJson(path.join(ROOT, 'datos-semilla/colaboradores.json'), { colaboradores: [] }).colaboradores);
  const moduloColaboradores = opciones.moduloColaboradores || crearModuloColaboradores({
    proveedorAutenticacion: proveedor,
    cartera: moduloMonitoreo.cartera,
    catalogo: catalogoRegistro,
    bus: busEventos,
    borradores: borradoresRegistro,
    repositorio: opciones.repositorioColaboradores,
    colaboradores: [
      ...colaboradoresSemilla,
      ...(opciones.idsColaboradoresYaRegistrados || []).map((idInstitucional) => ({ idInstitucional })),
    ],
  });
  // HU6-14 (EQ-61): correo de bienvenida al confirmar el registro (correo simulado).
  const moduloNotificaciones = opciones.moduloNotificaciones || crearModuloNotificaciones({
    bus: busEventos,
    servicioCorreo: opciones.servicioCorreo,
    opcionesConsumidor: opciones.opcionesNotificaciones,
  });
  // HU9: una sola instancia del módulo Mensajes para administrar y consultar
  // la configuración; en pruebas puede inyectarse mediante opciones.moduloMensajes.
  const moduloMensajes = opciones.moduloMensajes || crearModuloMensajes({
    repositorio: opciones.repositorioConfiguracionMensajes,
    busEventos,
    reloj: obtenerFechaReloj,
  });
  // EQ-82 (HU1-6): Validador de horario permitido en el servidor conectado a HU9-4.
  const validadorHorarioEnvio = opciones.validadorHorarioEnvio || crearValidadorHorarioEnvio({
    interfazLectura: moduloMensajes.interfazLectura,
    reloj: obtenerFechaReloj,
  });
  // EQ-81 (HU1-5): vista previa del lote; el envío usa las mismas reglas para que el conteo coincida.
  const servicioVistaPreviaLote = opciones.servicioVistaPreviaLote || crearServicioVistaPreviaLote({
    repositorioMonitoreo: moduloMonitoreo.repositorio,
    interfazLecturaConfiguracion: moduloMensajes.interfazLectura,
    reloj: obtenerFechaReloj,
  });
  // EQ-84 (HU1-8): texto del lote desde el mensaje de reactivación del catálogo de HU8.
  const generadorMensajeReactivacion = opciones.generadorMensajeReactivacion || crearGeneradorMensajeReactivacion({
    repositorioCatalogo: moduloCatalogoMensajes.repositorio,
  });
  const repositorioConfiguracionEnvio = opciones.repositorioConfiguracionEnvio || crearRepositorioConfiguracionEnvio();
  const historialMonitoreo = Array.isArray(opciones.historialMonitoreo) ? opciones.historialMonitoreo : null;

  // EQ-83 (HU1-7): lote de envío. Los eventos los atiende, por ahora, el consumidor simulado
  // (mismo comportamiento que antes); EQ-85 conecta WhatsApp real en su lugar.
  const repositorioLotes = opciones.repositorioLotes || new RepositorioLotesMemoria();
  const crearLoteEnvio = new CrearLoteEnvioCasoUso({
    repositorioLotes,
    servicioVistaPreviaLote,
    generadorMensaje: generadorMensajeReactivacion,
    validadorHorario: validadorHorarioEnvio,
    bus: busEventos,
    reloj: obtenerFechaReloj,
    obtenerNombreAspirante: async (id) => (await moduloMonitoreo.repositorio.obtenerAspirantePorId?.(id))?.nombreCompleto ?? null,
    // EQ-84: a quien le falta un dato del mensaje se le deja nota en su historial.
    alRegistrarNoEnviables: async (envios, lote) => {
      const vistos = new Set();
      for (const envio of envios) {
        if (envio.codigoMotivo !== 'VARIABLE_FALTANTE' || vistos.has(envio.aspiranteId)) continue;
        vistos.add(envio.aspiranteId);
        const fallo = {
          id: `h-mia-fallo-${lote.id}-${envio.aspiranteId}`, aspiranteId: envio.aspiranteId, tipoEvento: 'NOTA_SEGUIMIENTO',
          titulo: TITULO_FALLO, detalle: envio.motivo, motivoRechazo: null, autorTipo: 'SISTEMA', fechaEvento: lote.creadoEn,
        };
        await moduloMonitoreo.repositorio.registrarActividad?.(fallo);
        if (historialMonitoreo) historialMonitoreo.push(fallo);
      }
    },
  });
  // EQ-85 (HU1-9): la cola envía por WhatsApp (Cloud API si está configurada; si no, el
  // simulador de BASE-10) con ritmo, reintentos, límite de 24 h y horario de HU9.
  const configuracionCloudApi = opciones.proveedorWhatsApp ? null : leerConfiguracionCloudApi(process.env);
  const proveedorWhatsApp = opciones.proveedorWhatsApp
    || (configuracionCloudApi ? crearProveedorWhatsAppCloudApi(configuracionCloudApi) : crearProveedorWhatsAppSimulado());
  const numeroEntorno = (nombre) => (process.env[nombre] ? Number(process.env[nombre]) : undefined);
  const colaEnvioWhatsApp = opciones.colaEnvioWhatsApp?.encolar ? opciones.colaEnvioWhatsApp : crearColaEnvioWhatsApp({
    proveedor: proveedorWhatsApp,
    bus: busEventos,
    validadorHorario: validadorHorarioEnvio,
    reloj: obtenerFechaReloj,
    plantilla: {
      nombre: process.env.WHATSAPP_PLANTILLA_REACTIVACION || 'reactivacion_hu1',
      idioma: process.env.WHATSAPP_IDIOMA_PLANTILLA || 'es_MX',
    },
    mensajesPorSegundo: numeroEntorno('WHATSAPP_MENSAJES_POR_SEGUNDO'),
    limiteContactos24h: numeroEntorno('WHATSAPP_LIMITE_CONTACTOS_24H'),
    maxIntentos: numeroEntorno('WHATSAPP_MAX_INTENTOS'),
    ...(opciones.colaEnvioWhatsApp || {}),
  });
  busEventos.suscribir(`${TIPO_ENVIO_SOLICITADO}.whatsapp`, (evento) => { colaEnvioWhatsApp.encolar(evento); });

  // Provisional hasta EQ-87: registra en Chat y Actividades lo que la cola confirmó como enviado.
  if (opciones.simularEnvios !== false) {
    conectarConsumidorEnvioSimulado({ bus: busEventos, repositorioMonitoreo: moduloMonitoreo.repositorio, historialMonitoreo });
  }

  function obtenerSesion(req) {
    const token = cookiesDe(req)[COOKIE_NAME];
    if (!token) return null;
    const sesion = sesiones.get(token);
    if (!sesion) return null;
    if (sesion.expiraEn <= obtenerFechaReloj().getTime()) { sesiones.delete(token); return null; }
    return { token, ...sesion };
  }

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if ((url.pathname === '/health' || url.pathname === '/api/v1/health') && req.method === 'GET') {
        return responderJson(res, 200, { status: 'UP', service: 'sira-crm-backend', environment: NODE_ENV, timestamp: new Date().toISOString(), uptimeSeconds: Math.floor(process.uptime()), database: { host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'sira_db', schemasConfigured: ['usuarios', 'aspirantes', 'alertas', 'conocimiento'] }, eventBus: { type: process.env.RABBITMQ_HOST ? 'rabbitmq' : 'memoria', host: process.env.RABBITMQ_HOST || 'memoria' } });
      }

      if (url.pathname === '/api/v1/auth/login' && req.method === 'POST') {
        const body = await leerCuerpo(req);
        const identificador = normalizarIdentificador(body.identificador, semilla);
        const password = typeof body.password === 'string' ? body.password : '';
        if (!identificador || !password) return responderJson(res, 400, { codigo: 'CAMPOS_REQUERIDOS', mensaje: 'Ingresa tu correo o ID y contraseña.' });

        let resultado;
        try { resultado = await proveedor.autenticar(identificador, password); }
        catch (error) {
          if (error instanceof ErrorAutenticacion && error.codigo === 'SERVICIO_NO_DISPONIBLE') {
            return responderJson(res, 503, { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'El servicio de identidad no está disponible.' });
          }
          throw error;
        }

        if (!resultado.autenticado || !resultado.colaborador) {
          const codigo = resultado.motivoFalla === 'CUENTA_BLOQUEADA' ? 'CUENTA_BLOQUEADA' : 'CREDENCIALES_INVALIDAS';
          return responderJson(res, 401, { codigo, mensaje: 'No fue posible validar las credenciales.' });
        }

        const id = resultado.colaborador.idInstitucional;
        const usuarioCrm = Array.isArray(opciones.usuariosCrm)
          ? opciones.usuariosCrm.find(
            (usuario) => String(usuario.idInstitucional) === String(id)
          )
          : null;

        if (usuarioCrm?.activo === false) {
          return responderJson(res, 403, {
            codigo: 'USUARIO_SIN_ACCESO',
            mensaje: 'La cuenta está inactiva.'
          });
        }
        if (sinAcceso.has(id)) return responderJson(res, 403, { codigo: 'USUARIO_SIN_ACCESO', mensaje: 'La cuenta no tiene autorización para acceder a SIRA.' });

        const token = randomBytes(32).toString('base64url');
        const ahora = obtenerFechaReloj().getTime();
        const usuario = {
          ...resultado.colaborador,
          rol: resolverRol(id, permisos, opciones.usuariosCrm)
        };
        sesiones.set(token, { usuario, creadoEn: ahora, expiraEn: ahora + duracionSesionMs });
        const maxAge = Math.max(1, Math.floor(duracionSesionMs / 1000));
        const secure = NODE_ENV === 'production' ? '; Secure' : '';
        return responderJson(res, 200, { autenticado: true, usuario: { idInstitucional: usuario.idInstitucional, nombreCompleto: usuario.nombreCompleto, rol: usuario.rol } }, {
          'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`,
        });
      }

      if (url.pathname === '/api/v1/auth/session' && req.method === 'GET') {
        const sesion = obtenerSesion(req);
        if (!sesion) return responderJson(res, 401, { codigo: 'SESION_NO_VALIDA', mensaje: 'La sesión no existe o expiró.' });
        return responderJson(res, 200, { autenticado: true, expiraEn: new Date(sesion.expiraEn).toISOString(), usuario: sesion.usuario });
      }

      if (url.pathname === '/api/v1/auth/logout' && req.method === 'POST') {
        const token = cookiesDe(req)[COOKIE_NAME];
        if (token) sesiones.delete(token);
        return responderJson(res, 200, { cerrado: true }, { 'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${NODE_ENV === 'production' ? '; Secure' : ''}` });
      }

      // EQ-71 (Figma «Vista de colaborador»): cualquier usuario con sesión consulta el listado de
      // colaboradores. Registrar, inactivar y ver inactivos sigue siendo solo del administrador.
      const recursosListado = new Set(['listado.html', 'listado.js', 'listado-colaboradores.js', 'registro.css', 'validaciones.js']);
      const recursoColaboradores = url.pathname.replace(/^\/app\/colaboradores\//, '');
      const esListadoApi = /^\/api\/(?:v1\/)?colaboradores\/?$/.test(url.pathname) && req.method === 'GET';
      const esListadoFrontend = url.pathname.startsWith('/app/colaboradores/') && req.method === 'GET' && recursosListado.has(recursoColaboradores);
      if (esListadoApi || esListadoFrontend) {
        const sesion = obtenerSesion(req);
        if (!sesion) return responderJson(res, 401, { codigo: 'SESION_NO_VALIDA', mensaje: 'Debes iniciar sesión para acceder a esta funcionalidad.' });
        if (esListadoFrontend) return servirArchivo(res, path.join(FRONTEND_GABRIEL, 'colaboradores', recursoColaboradores));
        if (await moduloColaboradores.enrutador(req, res, { usuario: sesion.usuario })) return;
      }

      // EQ-17: Rutas exclusivas del administrador.
      const rutaAdminApi =
        /^\/api\/(?:v1\/)?colaboradores(?:\/|$)/.test(url.pathname);

      const rutaAdminFrontend =
        /^\/app\/colaboradores(?:\/|$)/.test(url.pathname);

      if (rutaAdminApi || rutaAdminFrontend) {
        const sesion = obtenerSesion(req);

        const acceso = verificarAccesoRol(
          sesion,
          ['administrador']
        );

        if (acceso) {
          return responderJson(res, acceso.status, {
            codigo: acceso.codigo,
            mensaje: acceso.mensaje
          });
        }

        const recursosRegistro = new Set([
          'registro.html', 'registro.js', 'registro.css', 'validaciones.js'
        ]);
        const recursoRegistro = url.pathname.replace(/^\/app\/colaboradores\//, '');
        if (rutaAdminFrontend && req.method === 'GET' && recursosRegistro.has(recursoRegistro)) {
          return servirArchivo(res, path.join(FRONTEND_GABRIEL, 'colaboradores', recursoRegistro));
        }

        // HU 6: listado (EQ-71), perfil (EQ-55), vista previa (EQ-64) y confirmación (EQ-59).
        if (rutaAdminApi && await moduloColaboradores.enrutador(req, res, { usuario: sesion.usuario })) return;

        const raizRegistro = '/api/v1/colaboradores/registro';
        if (url.pathname === `${raizRegistro}/catalogo` && req.method === 'GET') {
          const campus = catalogoRegistro.listarCampus();
          return responderJson(res, 200, {
            campus, carrerasPorCampus: Object.fromEntries(campus.map((c) => [c, catalogoRegistro.listarCarreras(c)])),
            origen: catalogoRegistro.origen || 'ADAPTADOR_TEMPORAL'
          });
        }

        if (url.pathname === `${raizRegistro}/borrador` && req.method === 'POST') {
          const body = await leerCuerpo(req);
          const id = String(body.idInstitucional ?? '').trim();
          const campus = typeof body.campus === 'string' ? body.campus.trim() : '';
          if (!/^\d{5,20}$/.test(id)) return responderJson(res, 400, { codigo: 'ID_INVALIDO', mensaje: 'El ID institucional es obligatorio y debe ser numérico.' });
          if (await moduloColaboradores.repositorio.existe(id)) return responderJson(res, 409, { codigo: 'YA_REGISTRADO', mensaje: 'Este colaborador ya está registrado.' });
          let perfil;
          try { perfil = await proveedor.obtenerPorIdInstitucional(id); }
          catch (error) {
            if (error instanceof ErrorAutenticacion && error.codigo === 'SERVICIO_NO_DISPONIBLE') {
              return responderJson(res, 503, { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'El directorio institucional no está disponible.' });
            }
            throw error;
          }
          if (!perfil) return responderJson(res, 404, { codigo: 'ID_NO_ENCONTRADO', mensaje: 'No se encontró un colaborador con ese ID.' });
          if (!campus) return responderJson(res, 422, { codigo: 'CAMPUS_OBLIGATORIO', mensaje: 'Selecciona un campus para continuar.' });
          if (!catalogoRegistro.contieneCampus(campus)) return responderJson(res, 422, { codigo: 'CAMPUS_INVALIDO', mensaje: 'El campus seleccionado no está disponible.' });

          let carreras;
          if (body.carreras !== undefined) {
            if (!Array.isArray(body.carreras) || body.carreras.length === 0) {
              return responderJson(res, 422, { codigo: 'CARRERAS_OBLIGATORIAS', mensaje: 'Selecciona al menos una carrera para guardar el borrador.' });
            }
            carreras = [...new Set(body.carreras)];
            if (carreras.length > 100 || !carreras.every((c) => typeof c === 'string' && catalogoRegistro.contieneCarrera(campus, c))) {
              return responderJson(res, 422, { codigo: 'CARRERA_INVALIDA', mensaje: 'Una o más carreras no corresponden al campus seleccionado.' });
            }
          }
          const borrador = borradoresRegistro.guardarBorrador({ idInstitucional: id, campus, ...(carreras ? { carreras } : {}) });
          return responderJson(res, 200, { borrador, confirmado: false });
        }

        const rutaBorrador = url.pathname.match(/^\/api\/v1\/colaboradores\/registro\/borrador\/([^/]+)$/);
        if (rutaBorrador && req.method === 'GET') {
          const borrador = borradoresRegistro.obtenerBorrador(decodeURIComponent(rutaBorrador[1]));
          if (!borrador) return responderJson(res, 404, { codigo: 'NO_ENCONTRADO', mensaje: 'Borrador no encontrado.' });
          return responderJson(res, 200, { borrador });
        }

        return responderJson(res, 404, {
          codigo: 'NO_ENCONTRADO',
          mensaje: 'La funcionalidad administrativa aún no está disponible.'
        });
      }

      // Listado general de conversaciones reales de la cartera del colaborador (HU 3 / HU 4).
      const rutaColeccionChat = url.pathname.match(/^\/api\/(?:v1\/)?monitoreo\/conversaciones\/?$/);
      if (rutaColeccionChat && req.method === 'GET') {
        const sesion = obtenerSesion(req);
        if (!sesion) return responderJson(res, 401, { codigo: 'NO_AUTORIZADO', mensaje: 'Inicia sesión para consultar monitoreo.' });

        const repositorio = moduloMonitoreo.repositorio;
        const idsCartera = typeof repositorio?._obtenerIdsColaborador === 'function'
          ? repositorio._obtenerIdsColaborador(sesion.usuario.idInstitucional)
          : new Set([sesion.usuario.idInstitucional]);

        const aspirantesCartera = (repositorio?.aspirantes || []).filter((a) => idsCartera.has(a.colaboradorId));
        const conversacionesCartera = [];

        for (const asp of aspirantesCartera) {
          const mensajes = typeof repositorio?.obtenerConversacionAspirante === 'function'
            ? await repositorio.obtenerConversacionAspirante(asp.id)
            : [];
          if (mensajes.length === 0) continue;

          const mensajesFormateados = mensajes.map((m) => ({
            id: m.id,
            aspiranteId: asp.id,
            direccion: m.direccion,
            remitenteTipo: m.remitenteTipo,
            remitenteId: m.remitenteId,
            contenido: m.contenido,
            tipoContenido: m.tipoContenido || 'TEXTO',
            estadoEntrega: m.estadoEntrega || 'ENTREGADO',
            whatsappMessageId: m.whatsappMessageId || null,
            fecha: m.fechaEnvio ?? m.fecha,
          }));

          const ultimo = mensajesFormateados[mensajesFormateados.length - 1];
          const tieneEntrantes = mensajesFormateados.some((m) => m.direccion === 'ENTRANTE');
          const tieneColaborador = mensajesFormateados.some((m) => m.remitenteTipo === 'COLABORADOR');

          let noLeidos = 0;
          for (let i = mensajesFormateados.length - 1; i >= 0; i--) {
            if (mensajesFormateados[i].remitenteTipo === 'COLABORADOR') break;
            if (mensajesFormateados[i].direccion === 'ENTRANTE') noLeidos++;
          }

          conversacionesCartera.push({
            aspirante: {
              id: asp.id,
              folioSolicitud: asp.folioSolicitud,
              nombre: asp.nombreCompleto ?? asp.nombre,
              carrera: asp.carreraSolicitada ?? asp.carrera,
              preparatoria: asp.preparatoriaProcedencia ?? asp.preparatoria,
              periodo: asp.periodo,
              telefono: asp.telefono,
              correo: asp.correo,
              estadoSolicitud: asp.estadoSolicitud,
              semaforo: asp.semaforo,
            },
            mensajes: mensajesFormateados,
            ultimoMensaje: ultimo,
            fechaUltimoMensaje: ultimo?.fecha ?? asp.fechaUltimaActividad,
            tieneRespuestaAspirante: tieneEntrantes,
            tieneColaborador,
            noLeidos,
          });
        }

        conversacionesCartera.sort(
          (a, b) => Date.parse(b.fechaUltimoMensaje || 0) - Date.parse(a.fechaUltimoMensaje || 0)
        );

        return responderJson(res, 200, {
          conversaciones: conversacionesCartera,
          total: conversacionesCartera.length,
        });
      }

      // Adaptador de lectura y envío de mensajes para el expediente de Gabriel (EQ-40 / EQ-46).
      // El detalle (EQ-42) y las actividades (EQ-43) ya los atiende el módulo Monitoreo.
      const rutaExpediente = url.pathname.match(/^\/api\/(?:v1\/)?monitoreo\/aspirantes\/([^/]+)\/(conversacion)\/?$/);
      if (rutaExpediente && (req.method === 'GET' || (req.method === 'POST' && rutaExpediente[2] === 'conversacion'))) {
        const sesion = obtenerSesion(req);
        if (!sesion) return responderJson(res, 401, { codigo: 'NO_AUTORIZADO', mensaje: 'Inicia sesión para consultar el expediente.' });

        let aspiranteId;
        try { aspiranteId = decodeURIComponent(rutaExpediente[1]); }
        catch { return responderJson(res, 400, { codigo: 'PARAMETRO_INVALIDO', mensaje: 'Identificador inválido.' }); }
        const repositorio = moduloMonitoreo.repositorio;
        if (typeof repositorio?.obtenerAspirantePorId !== 'function') {
          return responderJson(res, 501, { codigo: 'NO_IMPLEMENTADO', mensaje: 'El repositorio no ofrece lectura de expedientes.' });
        }
        const aspirante = await repositorio.obtenerAspirantePorId(aspiranteId);
        if (!aspirante) return responderJson(res, 404, { codigo: 'NO_ENCONTRADO', mensaje: 'Aspirante no encontrado.' });

        const idsCartera = typeof repositorio._obtenerIdsColaborador === 'function'
          ? repositorio._obtenerIdsColaborador(sesion.usuario.idInstitucional)
          : new Set([sesion.usuario.idInstitucional]);
        if (!idsCartera.has(aspirante.colaboradorId)) {
          return responderJson(res, 403, { codigo: 'SIN_PERMISO', mensaje: 'Este aspirante no pertenece a tu cartera.' });
        }

        if (req.method === 'POST' && rutaExpediente[2] === 'conversacion') {
          const body = await leerCuerpo(req);
          const contenido = String(body.contenido ?? '').trim();
          if (!contenido) {
            return responderJson(res, 400, { codigo: 'MENSAJE_VACIO', mensaje: 'El contenido del mensaje es obligatorio.' });
          }
          const ahoraIso = obtenerFechaReloj().toISOString();
          const nuevoMensaje = {
            id: `msg-${randomBytes(8).toString('hex')}`,
            aspiranteId: aspirante.id,
            direccion: 'SALIENTE',
            remitenteTipo: 'COLABORADOR',
            remitenteId: sesion.usuario.idInstitucional,
            contenido,
            tipoContenido: 'TEXTO',
            estadoEntrega: 'ENVIADO',
            whatsappMessageId: `wamid.HBgN${randomBytes(10).toString('hex').toUpperCase()}`,
            fechaEnvio: ahoraIso,
          };
          if (Array.isArray(repositorio.conversaciones)) {
            repositorio.conversaciones.push(nuevoMensaje);
          }
          aspirante.fechaUltimaActividad = ahoraIso;
          const actividad = {
            id: `ev-${randomBytes(8).toString('hex')}`,
            aspiranteId: aspirante.id,
            tipoEvento: 'MENSAJE_ENVIADO',
            titulo: 'Mensaje enviado por colaborador',
            detalle: contenido,
            autorTipo: 'COLABORADOR',
            autorId: sesion.usuario.idInstitucional,
            fechaEvento: ahoraIso,
          };
          // EQ-43: el envío queda en el historial del módulo Monitoreo.
          await repositorio.registrarActividad?.(actividad);
          if (historialMonitoreo) historialMonitoreo.push(actividad);

          return responderJson(res, 201, {
            mensaje: {
              id: nuevoMensaje.id,
              aspiranteId: nuevoMensaje.aspiranteId,
              direccion: nuevoMensaje.direccion,
              remitenteTipo: nuevoMensaje.remitenteTipo,
              remitenteId: nuevoMensaje.remitenteId,
              contenido: nuevoMensaje.contenido,
              tipoContenido: nuevoMensaje.tipoContenido,
              estadoEntrega: nuevoMensaje.estadoEntrega,
              whatsappMessageId: nuevoMensaje.whatsappMessageId,
              fecha: nuevoMensaje.fechaEnvio,
            },
          });
        }

        if (rutaExpediente[2] === 'conversacion') {
          if (typeof repositorio?.obtenerConversacionAspirante !== 'function') {
            return responderJson(res, 501, { codigo: 'NO_IMPLEMENTADO', mensaje: 'El repositorio no ofrece la conversación del aspirante.' });
          }
          const mensajes = await repositorio.obtenerConversacionAspirante(aspirante.id);
          return responderJson(res, 200, {
            mensajes: mensajes.map((m) => ({
              id: m.id,
              direccion: m.direccion,
              remitenteTipo: m.remitenteTipo,
              remitenteId: m.remitenteId,
              contenido: m.contenido,
              tipoContenido: m.tipoContenido || 'TEXTO',
              estadoEntrega: m.estadoEntrega || 'ENTREGADO',
              whatsappMessageId: m.whatsappMessageId || null,
              fecha: m.fechaEnvio,
            })),
          });
        }
      }

      // Módulo Mensajes: /api/mensajes/... y /api/v1/mensajes/... (HU 9: EQ-106, EQ-107, EQ-108)
      // Ojo: «/api/v1/mensajes-ia» (catálogo de HU 8) NO es de este módulo; antes startsWith lo atrapaba.
      if (/^\/api\/(?:v1\/)?mensajes(?:\/|$)/.test(url.pathname)) {
        const sesion = obtenerSesion(req);
        const acceso = verificarAccesoRol(sesion, ['administrador']);
        if (acceso) {
          return responderJson(res, acceso.status, {
            codigo: acceso.codigo,
            mensaje: acceso.mensaje,
          });
        }
        const manejado = await moduloMensajes.enrutador(req, res, {
          usuario: sesion?.usuario ?? null,
        });
        if (manejado) return;
      }

      // Módulo Monitoreo: /api/monitoreo/... y /api/v1/monitoreo/...
      if (url.pathname.startsWith('/api/monitoreo') || url.pathname.startsWith('/api/v1/monitoreo')) {
        const sesion = obtenerSesion(req);
        if (!sesion) return responderJson(res, 401, { codigo: 'NO_AUTORIZADO', mensaje: 'Inicia sesión para consultar monitoreo.' });
        const contexto = { usuario: sesion.usuario };
        const manejado = await moduloMonitoreo.enrutador(req, res, contexto);
        if (manejado) return;
      }

      if (url.pathname === '/' && req.method === 'GET') return servirArchivo(res, path.join(PUBLIC, 'login/index.html'));
      // HU 9 (EQ-109, EQ-110): configuración de envío, solo para administradores.
      if (url.pathname === '/api/v1/configuracion/envio' && (req.method === 'GET' || req.method === 'PUT')) {
        const sesion = obtenerSesion(req);
        if (!sesion) return responderJson(res, 401, { codigo: 'SESION_NO_VALIDA', mensaje: 'La sesión no existe o expiró.' });
        if (sesion.usuario.rol !== 'administrador') {
          return responderJson(res, 403, { codigo: 'SIN_PERMISO', mensaje: 'Solo un administrador puede ver o cambiar esta configuración.' });
        }
        if (req.method === 'GET') return responderJson(res, 200, repositorioConfiguracionEnvio.leer());

        const cuerpo = await leerCuerpo(req);
        const { valida, errores, datos } = validarConfiguracion(cuerpo);
        if (!valida) return responderJson(res, 400, { codigo: 'CONFIGURACION_INVALIDA', mensaje: 'Revisa los campos marcados.', errores });
        return responderJson(res, 200, repositorioConfiguracionEnvio.guardar(datos));
      }

      // HU 1 (EQ-82, EQ-86, EQ-88, EQ-89): disparo de mensajes automáticos conectado a HU 9-4.
      if (url.pathname === '/api/v1/disparo-mensajes/vista-previa' && req.method === 'GET') {
        const sesion = obtenerSesion(req);
        if (!sesion) return responderJson(res, 401, { codigo: 'SESION_NO_VALIDA', mensaje: 'La sesión no existe o expiró.' });

        // EQ-81: la cartera sale de la sesión; los parámetros solo traen filtros.
        const p = url.searchParams;
        const vista = await servicioVistaPreviaLote.calcular(sesion.usuario.idInstitucional, {
          semaforos: p.get('semaforos'),
          carreras: p.get('carreras'),
          inactividadValor: p.get('inactividadValor'),
          inactividadUnidad: p.get('inactividadUnidad'),
        });
        const estadoHorario = validadorHorarioEnvio.obtenerEstadoHorario();

        // EQ-84: ejemplos con el mensaje de reactivación ya personalizado; cuenta a quienes les falta un dato.
        let mensajesEjemplo = [];
        let sinDatosParaMensaje = 0;
        let mensajeReactivacionDisponible = true;
        if (vista.valido && vista.elegibles.length > 0) {
          try {
            const personalizados = await generadorMensajeReactivacion.personalizarLote(vista.elegibles);
            mensajesEjemplo = [...new Set(personalizados.filter((p) => p.enviable).map((p) => p.texto))].slice(0, 5);
            sinDatosParaMensaje = personalizados.filter((p) => !p.enviable).length;
          } catch (error) {
            if (!(error instanceof ErrorMensajeReactivacion)) throw error;
            mensajeReactivacionDisponible = false;
          }
        }

        // Con filtros inválidos responde 200 y valido:false: el modal usa las opciones para pintarse.
        return responderJson(res, 200, {
          valido: vista.valido,
          errores: vista.errores,
          carrerasDisponibles: vista.opciones.carreras,
          semaforosDisponibles: vista.opciones.semaforos,
          fechaCorte: vista.fechaCorte ? vista.fechaCorte.toISOString() : null,
          horasContactoPrevio: vista.horasContactoPrevio,
          dentroDeHorario: estadoHorario.permitido,
          estadoHorario,
          mensajeHorario: estadoHorario.mensaje,
          total: vista.total,
          excluidos: vista.excluidos,
          mensajesEjemplo,
          sinDatosParaMensaje,
          mensajeReactivacionDisponible,
        });
      }

      if (url.pathname === '/api/v1/disparo-mensajes/enviar' && req.method === 'POST') {
        const sesion = obtenerSesion(req);
        if (!sesion) return responderJson(res, 401, { codigo: 'SESION_NO_VALIDA', mensaje: 'La sesión no existe o expiró.' });
        if (sesion.usuario?.rol !== 'colaborador') {
          return responderJson(res, 403, { codigo: 'SIN_PERMISO', mensaje: 'Solo un colaborador puede iniciar un lote de envío de mensajes.' });
        }

        const cuerpo = await leerCuerpo(req);

        // EQ-83 (HU1-7): crea el lote en una transacción y publica un evento por aspirante y canal.
        // El horario (EQ-82) se valida con el reloj del servidor; nunca con fechas del cliente.
        try {
          const r = await crearLoteEnvio.ejecutar({
            colaboradorId: sesion.usuario.idInstitucional,
            claveIdempotencia: req.headers['idempotency-key'],
            cuerpo,
          });
          return responderJson(res, 200, { ...r.resumen, repetido: r.repetido, estadoHorario: r.estadoHorario });
        } catch (error) {
          if (error instanceof ErrorFueraDeHorarioPermitido || error?.codigo === 'FUERA_DE_HORARIO_PERMITIDO') {
            return responderJson(res, error.status || 409, { codigo: error.codigo, mensaje: error.message, detalle: error.detalle });
          }
          if (error instanceof ErrorLoteEnvio || error instanceof ErrorMensajeReactivacion) {
            return responderJson(res, error.status, { codigo: error.codigo, mensaje: error.message, ...(error.errores ? { errores: error.errores } : {}) });
          }
          throw error;
        }
      }

      // HU 8 (EQ-96, EQ-97): catálogo de mensajes predefinidos, solo lectura para ambos roles.
      if (url.pathname.startsWith('/api/v1/mensajes-ia')) {
        if (!obtenerSesion(req)) return responderJson(res, 401, { codigo: 'SESION_NO_VALIDA', mensaje: 'La sesión no existe o expiró.' });
        if (await moduloCatalogoMensajes.enrutador(req, res)) return;
      }

      if ((url.pathname === '/app' || url.pathname === '/app/') && req.method === 'GET') {
        if (!obtenerSesion(req)) { res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' }); return res.end(); }
        return servirArchivo(res, path.join(FRONTEND_GABRIEL, 'index.html'));
      }
      if (url.pathname.startsWith('/login/') && req.method === 'GET') {
        const relative = url.pathname.replace(/^\/login\//, '');
        if (!relative || relative.includes('..') || relative.includes('\\')) return responderJson(res, 400, { codigo: 'RUTA_INVALIDA' });
        return servirArchivo(res, path.join(PUBLIC, 'login', relative));
      }
      if (url.pathname.startsWith('/app/') && req.method === 'GET') {
        if (!obtenerSesion(req)) return responderJson(res, 401, { codigo: 'SESION_NO_VALIDA', mensaje: 'Inicia sesión para acceder al monitoreo.' });
        const relative = url.pathname.replace(/^\/app\//, '');
        if (!relative || relative.includes('..') || relative.includes('\\')) return responderJson(res, 400, { codigo: 'RUTA_INVALIDA' });
        const archivo = path.resolve(FRONTEND_GABRIEL, relative);
        if (!archivo.startsWith(FRONTEND_GABRIEL + path.sep)) return responderJson(res, 400, { codigo: 'RUTA_INVALIDA' });
        return servirArchivo(res, archivo);
      }

      return responderJson(res, 404, { error: 'Ruta no encontrada', path: url.pathname });
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      return responderJson(res, error.status || 500, { codigo: 'ERROR_INTERNO', mensaje: error.status ? error.message : 'Ocurrió un error interno.' });
    }
  });

  // Acceso a los módulos para pruebas y demos (p. ej. revisar la bandeja de correo simulada).
  servidor.modulos = {
    monitoreo: moduloMonitoreo,
    colaboradores: moduloColaboradores,
    notificaciones: moduloNotificaciones,
    mensajes: moduloMensajes,
    bus: busEventos,
  };
  servidor.on('close', () => moduloNotificaciones.detener?.());
  // Para pruebas y diagnóstico: permite esperar a que la cola termine de enviar.
  servidor.colaEnvioWhatsApp = colaEnvioWhatsApp;
  return servidor;
}
