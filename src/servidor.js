/** Servidor HTTP de SIRA: API de autenticación y entrega de frontend. */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { crearProveedorAutenticacionSimulado, ErrorAutenticacion } from './modulos/autenticacion/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
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

function resolverRol(id, permisos) {
  const administradores = new Set([...(permisos.administradores || []), ...(process.env.SIRA_ADMIN_IDS || '').split(',').map((v) => v.trim()).filter(Boolean)]);
  return administradores.has(id) ? 'administrador' : 'colaborador';
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
  const sinAcceso = new Set([...(permisos.usuariosSinAcceso || []), ...(process.env.SIRA_DENIED_IDS || '').split(',').map((v) => v.trim()).filter(Boolean)]);

  function obtenerSesion(req) {
    const token = cookiesDe(req)[COOKIE_NAME];
    if (!token) return null;
    const sesion = sesiones.get(token);
    if (!sesion) return null;
    if (sesion.expiraEn <= reloj()) { sesiones.delete(token); return null; }
    return { token, ...sesion };
  }

  return http.createServer(async (req, res) => {
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
        if (sinAcceso.has(id)) return responderJson(res, 403, { codigo: 'USUARIO_SIN_ACCESO', mensaje: 'La cuenta no tiene autorización para acceder a SIRA.' });

        const token = randomBytes(32).toString('base64url');
        const ahora = reloj();
        const usuario = { ...resultado.colaborador, rol: resolverRol(id, permisos) };
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

      if (url.pathname === '/' && req.method === 'GET') return servirArchivo(res, path.join(PUBLIC, 'login/index.html'));
      if (url.pathname === '/app' && req.method === 'GET') {
        if (!obtenerSesion(req)) { res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' }); return res.end(); }
        return servirArchivo(res, path.join(PUBLIC, 'app/index.html'));
      }
      if (url.pathname.startsWith('/login/') && req.method === 'GET') {
        const relative = url.pathname.replace(/^\/login\//, '');
        if (!relative || relative.includes('..') || relative.includes('\\')) return responderJson(res, 400, { codigo: 'RUTA_INVALIDA' });
        return servirArchivo(res, path.join(PUBLIC, 'login', relative));
      }
      if (url.pathname.startsWith('/app/') && req.method === 'GET') {
        const relative = url.pathname.replace(/^\/app\//, '');
        if (!relative || relative.includes('..') || relative.includes('\\')) return responderJson(res, 400, { codigo: 'RUTA_INVALIDA' });
        return servirArchivo(res, path.join(PUBLIC, 'app', relative));
      }

      return responderJson(res, 404, { error: 'Ruta no encontrada', path: url.pathname });
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      return responderJson(res, error.status || 500, { codigo: 'ERROR_INTERNO', mensaje: error.status ? error.message : 'Ocurrió un error interno.' });
    }
  });
}
