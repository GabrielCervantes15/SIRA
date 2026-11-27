/**
 * [HU6-21] Pruebas de integración de HU 6 (registro y baja de colaboradores).
 *
 * Se levanta el servidor completo con piezas REALES (Usuarios, Aspirantes/Monitoreo, bus, consumidores
 * de correo) y el adaptador SIMULADO de Autenticación. El correo sale por SMTP hacia un servidor de
 * pruebas local (como Mailpit). Se comprueba:
 *   1. Confirmación (alta y baja) sobre Usuarios y Aspirantes a la vez, con bitácora.
 *   2. Reversión: si algo falla a la mitad, ni Usuarios ni Aspirantes cambian, y se puede reintentar.
 *   3. Adaptador de Autenticación: perfil del directorio, login del nuevo colaborador y caída del directorio.
 *   4. Eventos: publicación solo tras confirmar y consumo independiente (un fallo de correo no deshace nada).
 *   5. Correo: llega al servidor SMTP con el contenido correcto y sin duplicarse.
 *   6. Concurrencia: dos bajas simultáneas del mismo colaborador, solo una gana.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { Readable } from 'node:stream';
import { crearServidor } from '../src/servidor.js';
import { crearProveedorAutenticacionSimulado } from '../src/modulos/autenticacion/index.js';
import { crearModuloMonitoreo } from '../src/modulos/monitoreo/index.js';
import { crearBusEnMemoria } from '../src/compartido/eventos/bus-en-memoria.js';
import { crearServicioCorreoSmtp } from '../src/modulos/notificaciones/index.js';
import { RepositorioColaboradoresMemoria } from '../src/modulos/colaboradores/infraestructura/repositorio-colaboradores-memoria.js';

const X = 'Campus Obregón Náinari';
const Y = 'Campus Navojoa';
const SOFT = 'Ingeniería en Software';
const IND = 'Ingeniería Industrial';
const ADM = 'Licenciatura en Administración';

const ADMIN = '00000100001';
const A = '00000200001'; // campus X: Software + Industrial (se da de baja)
const B = '00000200002'; // campus X: Administración
const C = '00000200003'; // campus Y: Software (único en su campus)
const N = '00000200004'; // nuevo, solo existe en el directorio

const directorio = [
  { idInstitucional: ADMIN, password: 'AdminPassword2026!', nombreCompleto: 'Alma Admin Chávez', correoInstitucional: 'alma@itson.edu.mx', telefono: '+526440000001' },
  { idInstitucional: A, password: 'Password123!', nombreCompleto: 'Ana Álvarez Uno', correoInstitucional: 'ana@itson.edu.mx', telefono: '+526440000002' },
  { idInstitucional: B, password: 'Password123!', nombreCompleto: 'Beto Barrera Dos', correoInstitucional: 'beto@itson.edu.mx', telefono: '+526440000003' },
  { idInstitucional: C, password: 'Password123!', nombreCompleto: 'Carla Campos Tres', correoInstitucional: 'carla@itson.edu.mx', telefono: '+526440000004' },
  { idInstitucional: N, password: 'Password123!', nombreCompleto: 'Nora Nueva Díaz', correoInstitucional: 'nora@itson.edu.mx', telefono: '+526440000005' },
];
const usuariosCrm = [
  { idInstitucional: ADMIN, rol: 'administrador', activo: true },
  ...[A, B, C, N].map((idInstitucional) => ({ idInstitucional, rol: 'colaborador', activo: true })),
];

let contador = 0;
const aspirante = (campus, carrera, colaboradorId) => {
  contador += 1;
  return {
    id: `asp-int-${contador}`, folioSolicitud: `FOL-INT-${contador}`, nombreCompleto: `Aspirante ${contador}`, correo: `a${contador}@x.mx`,
    telefono: `+52644100${String(contador).padStart(4, '0')}`, campus, carreraSolicitada: carrera, preparatoriaProcedencia: 'CBTIS 37',
    periodo: '2027-1', fechaSolicitud: '2026-10-15T09:00:00Z', estadoSolicitud: 'EN_REVISION', semaforo: 'ROJO', colaboradorId,
    fechaUltimaActividad: '2026-10-25T14:30:00Z',
  };
};
const semillaAspirantes = () => {
  contador = 0;
  return [
    ...Array.from({ length: 4 }, () => aspirante(X, SOFT, A)),
    ...Array.from({ length: 3 }, () => aspirante(X, IND, A)),
    ...Array.from({ length: 2 }, () => aspirante(X, ADM, B)),
    ...Array.from({ length: 2 }, () => aspirante(Y, SOFT, C)),
  ];
};

// ---------- Servidor SMTP de pruebas (equivale a Mailpit) ----------
async function crearSmtpDePruebas() {
  const correos = [];
  const servidor = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let actual = null; let enDatos = false; let buffer = '';
    socket.write('220 pruebas listo\r\n');
    socket.on('data', (t) => {
      buffer += t; let i;
      while ((i = buffer.indexOf('\r\n')) !== -1) {
        const linea = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        if (enDatos) {
          if (linea === '.') { enDatos = false; correos.push(actual); socket.write('250 guardado\r\n'); } else actual.crudo += `${linea}\n`;
        } else if (linea.startsWith('EHLO')) socket.write('250 pruebas\r\n');
        else if (linea.startsWith('MAIL')) { actual = { para: null, crudo: '' }; socket.write('250 ok\r\n'); }
        else if (linea.startsWith('RCPT')) { actual.para = /<(.+)>/.exec(linea)[1]; socket.write('250 ok\r\n'); }
        else if (linea === 'DATA') { enDatos = true; socket.write('354 adelante\r\n'); }
        else if (linea === 'QUIT') { socket.write('221 adiós\r\n'); socket.end(); }
      }
    });
    socket.on('error', () => {});
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const port = servidor.address().port;
  const decodificar = (c) => {
    const asunto = /^Subject: =\?UTF-8\?B\?(.+)\?=$/m.exec(c.crudo)?.[1];
    const partes = [...c.crudo.matchAll(/Content-Type: text\/plain; charset=utf-8\nContent-Transfer-Encoding: base64\n\n([A-Za-z0-9+/=\n]+)/g)];
    return {
      para: c.para,
      asunto: asunto ? Buffer.from(asunto, 'base64').toString('utf8') : '',
      texto: partes[0] ? Buffer.from(partes[0][1].replace(/\n/g, ''), 'base64').toString('utf8') : '',
    };
  };
  return {
    port,
    correos: () => correos.map(decodificar),
    cerrar: () => new Promise((r) => { servidor.close(r); servidor.closeAllConnections?.(); }),
  };
}

// ---------- Escenario ----------
async function crearEscenario({ smtpPort, repositorioColaboradores } = {}) {
  const proveedor = crearProveedorAutenticacionSimulado({ usuarios: directorio });
  const bus = crearBusEnMemoria();
  const eventos = [];
  bus.suscribir('colaboradores.#', (e) => { eventos.push(e); });
  const moduloMonitoreo = crearModuloMonitoreo({ datosSemilla: { aspirantes: semillaAspirantes(), conversaciones: [
    { id: 'msg-1', aspiranteId: 'asp-int-1', direccion: 'SALIENTE', remitenteTipo: 'BOT_IA', contenido: 'Bienvenido al proceso de admisión.', fechaEnvio: '2026-10-16T10:00:00Z' },
    { id: 'msg-2', aspiranteId: 'asp-int-1', direccion: 'ENTRANTE', remitenteTipo: 'ASPIRANTE', contenido: 'Gracias, subo mi constancia hoy.', fechaEnvio: '2026-10-16T10:05:00Z' },
  ] } });
  const repo = repositorioColaboradores ?? new RepositorioColaboradoresMemoria({ colaboradores: [
    { idInstitucional: A, campus: X, carreras: [SOFT, IND], fechaRegistro: '2026-01-01T00:00:00Z' },
    { idInstitucional: B, campus: X, carreras: [ADM], fechaRegistro: '2026-02-01T00:00:00Z' },
    { idInstitucional: C, campus: Y, carreras: [SOFT], fechaRegistro: '2026-03-01T00:00:00Z' },
  ] });
  const servidor = crearServidor({
    usuarios: directorio, usuariosCrm, proveedor, moduloMonitoreo, bus, repositorioColaboradores: repo,
    servicioCorreo: smtpPort ? crearServicioCorreoSmtp({ host: '127.0.0.1', port: smtpPort, timeoutMs: 1000 }) : undefined,
    opcionesNotificaciones: { intentos: 2, esperaBaseMs: 1, registrar: () => {} },
  });
  const cookie = await login(servidor, ADMIN, 'AdminPassword2026!');
  return { servidor, bus, eventos, repo, proveedor, moduloMonitoreo, cookie, aspirantes: moduloMonitoreo.repositorio.aspirantes };
}

async function invocar(servidor, { method = 'GET', url, headers = {}, body }) {
  const req = new Readable({ read() { if (body !== undefined) this.push(Buffer.from(JSON.stringify(body), 'utf8')); this.push(null); } });
  req.url = url; req.method = method; req.destroy = () => {};
  req.headers = { host: 'localhost', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers };
  return new Promise((resolve) => {
    const h = {}; let status = 200; let texto = '';
    const res = {
      headersSent: false, destroyed: false,
      writeHead(s, hs = {}) { status = s; this.headersSent = true; for (const [k, v] of Object.entries(hs)) h[k.toLowerCase()] = v; },
      end(c = '') { texto += c; let json = null; try { json = texto ? JSON.parse(texto) : null; } catch { /* no JSON */ } resolve({ status, headers: h, body: json }); },
    };
    servidor.emit('request', req, res);
  });
}
async function login(servidor, id, password) {
  const r = await invocar(servidor, { method: 'POST', url: '/api/v1/auth/login', body: { identificador: id, password } });
  assert.equal(r.status, 200, `login de ${id}`);
  return r.headers['set-cookie'].split(';')[0];
}
const post = (e, url, body = {}) => invocar(e.servidor, { method: 'POST', url, headers: { cookie: e.cookie }, body });
const colaboradoresApi = async (e) => (await invocar(e.servidor, { url: '/api/v1/colaboradores?incluir_inactivos=true', headers: { cookie: e.cookie } })).body.colaboradores;
const duenos = (e) => Object.fromEntries(e.aspirantes.map((a) => [a.id, a.colaboradorId]));
const esperarCorreos = (e) => Promise.all([e.servidor.modulos.notificaciones.consumidorRegistro.esperarPendientes(), e.servidor.modulos.notificaciones.consumidorBaja.esperarPendientes()]);

// =====================================================================
// 1. Confirmación sobre Usuarios y Aspirantes
// =====================================================================

test('[HU6-21] alta: Usuarios y Aspirantes cambian juntos, con bitácora, evento, correo SMTP y login del nuevo', async () => {
  const smtp = await crearSmtpDePruebas();
  try {
    const e = await crearEscenario({ smtpPort: smtp.port });
    const antes = duenos(e);
    const r = await post(e, '/api/v1/colaboradores/registro', { idInstitucional: N, campus: X, carreras: [ADM] });
    assert.equal(r.status, 201);

    // Aspirantes: solo los 2 de Administración de X cambian de dueño (de B a N)
    const despues = duenos(e);
    const movidos = Object.keys(despues).filter((id) => despues[id] !== antes[id]);
    assert.equal(movidos.length, 2);
    assert.ok(movidos.every((id) => antes[id] === B && despues[id] === N));
    assert.deepEqual(r.body.asignacion.aspirantesIds.sort(), movidos.sort());

    // Usuarios: N activo en su campus con su carrera; el listado y la carga coinciden con Aspirantes
    const lista = await colaboradoresApi(e);
    const nuevo = lista.find((c) => c.idInstitucional === N);
    assert.deepEqual([nuevo.activo, nuevo.campus, nuevo.totalAspirantes], [true, X, 2]);
    assert.equal(nuevo.nombreCompleto, 'Nora Nueva Díaz', 'perfil tomado del adaptador de Autenticación');
    assert.equal(lista.find((c) => c.idInstitucional === B).totalAspirantes, 0);

    // Bitácora: una fila por aspirante movido
    const bitacora = e.repo.bitacoraTransferencias.filter((t) => t.motivo === 'alta');
    assert.deepEqual(bitacora.map((t) => [t.colaboradorOrigen, t.colaboradorDestino]), [[B, N], [B, N]]);

    // Bus: un evento, publicado después de confirmar
    assert.deepEqual(e.eventos.map((v) => v.tipo), ['colaboradores.registro.confirmado']);

    // Correo: llega al servidor SMTP
    await esperarCorreos(e);
    const correos = smtp.correos();
    assert.equal(correos.length, 1);
    assert.equal(correos[0].para, 'nora@itson.edu.mx');
    assert.match(correos[0].asunto, /Bienvenido a SIRA/);
    assert.match(correos[0].texto, new RegExp(`Campus: ${X}`));
    assert.match(correos[0].texto, /Aspirantes en tu cartera: 2/);

    // Autenticación: el nuevo colaborador ya puede entrar y ve la conversación de un aspirante heredado
    const cookieN = await login(e.servidor, N, 'Password123!');
    const propio = movidos[0];
    const conv = await invocar(e.servidor, { url: `/api/monitoreo/aspirantes/${propio}/conversacion`, headers: { cookie: cookieN } });
    assert.equal(conv.status, 200);
  } finally { await smtp.cerrar(); }
});

test('[HU6-21] baja: Usuarios y Aspirantes cambian juntos, sin perder a nadie, con bitácora, evento y correo', async () => {
  const smtp = await crearSmtpDePruebas();
  try {
    const e = await crearEscenario({ smtpPort: smtp.port });
    const antes = duenos(e);
    const r = await post(e, `/api/v1/colaboradores/${A}/baja`, { tipo: 'periodo', inicio: '2026-11-26', fin: '2027-01-15' });
    assert.equal(r.status, 200);

    // Aspirantes: los 7 de A pasan a B (único relevo activo en X); nadie más cambia; no se pierde ninguno
    const despues = duenos(e);
    assert.equal(Object.keys(despues).length, Object.keys(antes).length);
    for (const id of Object.keys(antes)) {
      if (antes[id] === A) assert.equal(despues[id], B, `${id} pasó a B`);
      else assert.equal(despues[id], antes[id], `${id} no debía cambiar`);
    }
    assert.equal(r.body.reasignacion.totalAspirantes, 7);

    // Usuarios: A inactivo con su periodo y sin carreras; B suma las de A; C intacto
    const lista = await colaboradoresApi(e);
    const porId = Object.fromEntries(lista.map((c) => [c.idInstitucional, c]));
    assert.deepEqual([porId[A].activo, porId[A].totalAspirantes, porId[A].carreras], [false, 0, []]);
    assert.deepEqual(porId[A].periodoBaja, { indefinido: false, desde: '2026-11-26', hasta: '2027-01-15' });
    assert.deepEqual([...porId[B].carreras].sort(), [ADM, IND, SOFT].sort());
    assert.equal(porId[B].totalAspirantes, 9);
    assert.deepEqual([porId[C].activo, porId[C].totalAspirantes], [true, 2]);
    assert.equal(lista.reduce((t, c) => t + c.totalAspirantes, 0), 11, 'el total de aspirantes se conserva');

    // Bitácora
    const bitacora = e.repo.bitacoraTransferencias.filter((t) => t.motivo === 'inactivacion');
    assert.equal(bitacora.length, 7);
    assert.ok(bitacora.every((t) => t.colaboradorOrigen === A && t.colaboradorDestino === B));

    // Bus + correo al receptor
    assert.deepEqual(e.eventos.map((v) => v.tipo), ['colaboradores.baja.confirmada']);
    await esperarCorreos(e);
    const correos = smtp.correos();
    assert.equal(correos.length, 1);
    assert.equal(correos[0].para, 'beto@itson.edu.mx');
    assert.match(correos[0].texto, /Ana Álvarez Uno/);
    assert.match(correos[0].texto, /del 2026-11-26 al 2027-01-15/);
    assert.match(correos[0].texto, /Aspirantes recibidos: 7/);

    // B hereda el expediente y la conversación de un aspirante de A
    const cookieB = await login(e.servidor, B, 'Password123!');
    const conv = await invocar(e.servidor, { url: '/api/monitoreo/aspirantes/asp-int-1/conversacion', headers: { cookie: cookieB } });
    assert.equal(conv.status, 200);
    assert.deepEqual(conv.body.mensajes.map((m) => m.id), ['msg-1', 'msg-2']);
  } finally { await smtp.cerrar(); }
});

// =====================================================================
// 2. Reversión
// =====================================================================

class RepoQueFallaEnBitacora extends RepositorioColaboradoresMemoria {
  fallar = true;
  async registrarTransferencias(registros) {
    if (this.fallar) throw new Error('bitácora caída');
    return super.registrarTransferencias(registros);
  }
}
const repoSemilla = () => new RepoQueFallaEnBitacora({ colaboradores: [
  { idInstitucional: A, campus: X, carreras: [SOFT, IND], fechaRegistro: '2026-01-01T00:00:00Z' },
  { idInstitucional: B, campus: X, carreras: [ADM], fechaRegistro: '2026-02-01T00:00:00Z' },
  { idInstitucional: C, campus: Y, carreras: [SOFT], fechaRegistro: '2026-03-01T00:00:00Z' },
] });

test('[HU6-21] reversión del alta: si falla la bitácora, Usuarios y Aspirantes quedan como estaban y se puede reintentar', async () => {
  const smtp = await crearSmtpDePruebas();
  try {
    const repo = repoSemilla();
    const e = await crearEscenario({ smtpPort: smtp.port, repositorioColaboradores: repo });
    const antes = duenos(e);
    const listaAntes = await colaboradoresApi(e);

    const fallida = await post(e, '/api/v1/colaboradores/registro', { idInstitucional: N, campus: X, carreras: [ADM] });
    assert.ok(fallida.status >= 500, `status ${fallida.status}`);
    assert.deepEqual(duenos(e), antes, 'Aspirantes revertidos');
    assert.deepEqual(await colaboradoresApi(e), listaAntes, 'Usuarios revertidos');
    assert.equal(await repo.existe(N), false);
    assert.equal(repo.bitacoraTransferencias.length, 0);
    assert.deepEqual(e.eventos, [], 'no se publica nada');
    await esperarCorreos(e);
    assert.deepEqual(smtp.correos(), [], 'no se manda correo');

    repo.fallar = false; // el problema se resuelve: el mismo registro ahora sí funciona
    const ok = await post(e, '/api/v1/colaboradores/registro', { idInstitucional: N, campus: X, carreras: [ADM] });
    assert.equal(ok.status, 201);
    assert.equal(e.eventos.length, 1);
  } finally { await smtp.cerrar(); }
});

test('[HU6-21] reversión de la baja: si falla la bitácora, nadie cambia, no hay evento ni correo, y se puede reintentar', async () => {
  const smtp = await crearSmtpDePruebas();
  try {
    const repo = repoSemilla();
    const e = await crearEscenario({ smtpPort: smtp.port, repositorioColaboradores: repo });
    const antes = duenos(e);
    const listaAntes = await colaboradoresApi(e);

    const fallida = await post(e, `/api/v1/colaboradores/${A}/baja`, { tipo: 'indefinido' });
    assert.ok(fallida.status >= 500, `status ${fallida.status}`);
    assert.deepEqual(duenos(e), antes, 'Aspirantes revertidos');
    assert.deepEqual(await colaboradoresApi(e), listaAntes, 'A sigue activo, con sus carreras y su carga');
    assert.equal(repo.bitacoraTransferencias.length, 0);
    assert.deepEqual(e.eventos, []);
    await esperarCorreos(e);
    assert.deepEqual(smtp.correos(), []);

    repo.fallar = false;
    const ok = await post(e, `/api/v1/colaboradores/${A}/baja`, { tipo: 'indefinido' });
    assert.equal(ok.status, 200);
    assert.equal((await colaboradoresApi(e)).find((c) => c.idInstitucional === A).activo, false);
  } finally { await smtp.cerrar(); }
});

test('[HU6-21] una baja bloqueada (sin relevo en el campus) no toca nada ni manda correos', async () => {
  const smtp = await crearSmtpDePruebas();
  try {
    const e = await crearEscenario({ smtpPort: smtp.port });
    const antes = duenos(e);
    const r = await post(e, `/api/v1/colaboradores/${C}/baja`, { tipo: 'indefinido' });
    assert.equal(r.status, 409);
    assert.equal(r.body.codigo, 'SIN_COLABORADOR_RELEVO');
    assert.deepEqual(duenos(e), antes);
    assert.deepEqual(e.eventos, []);
    await esperarCorreos(e);
    assert.deepEqual(smtp.correos(), []);
  } finally { await smtp.cerrar(); }
});

// =====================================================================
// 3. Adaptador de Autenticación
// =====================================================================

test('[HU6-21] si el directorio (adaptador) no responde, el alta da 503, nada cambia y al volver se registra', async () => {
  const e = await crearEscenario();
  const antes = duenos(e);
  const solicitud = { idInstitucional: N, campus: X, carreras: [ADM] };

  e.proveedor.simularIndisponibilidad(true);
  const r = await post(e, '/api/v1/colaboradores/registro', solicitud);
  assert.equal(r.status, 503);
  assert.deepEqual(duenos(e), antes, 'Aspirantes sin cambios');
  assert.equal(await e.repo.existe(N), false, 'Usuarios sin cambios');
  assert.deepEqual(e.eventos, [], 'no se publica nada');

  e.proveedor.simularIndisponibilidad(false);
  assert.equal((await post(e, '/api/v1/colaboradores/registro', solicitud)).status, 201);
});

test('[HU6-21] la baja no depende del directorio: con el adaptador caído la baja se hace igual (sin nombres)', async () => {
  const e = await crearEscenario();
  e.proveedor.simularIndisponibilidad(true);
  const r = await post(e, `/api/v1/colaboradores/${A}/baja`, { tipo: 'indefinido' });
  assert.equal(r.status, 200);
  assert.equal((await colaboradoresApi(e)).find((c) => c.idInstitucional === A).activo, false);
  assert.equal(e.eventos.length, 1);
  assert.equal(e.eventos[0].receptores[0].correoInstitucional, null, 'sin directorio no hay correo: el aviso queda en fallidos, la baja no se revierte');
});

test('[HU6-21] tras la baja de A, B queda como único activo del campus y ya no se le puede dar de baja', async () => {
  const e = await crearEscenario();
  assert.equal((await post(e, `/api/v1/colaboradores/${A}/baja`, { tipo: 'indefinido' })).status, 200);
  // A (inactivo) ya no cuenta como relevo: B es ahora el único activo de su campus.
  const vp = await post(e, `/api/v1/colaboradores/${B}/baja/vista-previa`);
  assert.equal(vp.status, 409, 'B queda como único activo en X, pero ya no hay otro que lo releve');
  assert.equal(vp.body.codigo, 'SIN_COLABORADOR_RELEVO');
});

// =====================================================================
// 4. Eventos y consumo
// =====================================================================

test('[HU6-21] un fallo del correo no deshace el registro: queda en fallidos y los datos se conservan', async () => {
  const smtp = await crearSmtpDePruebas();
  const puertoMuerto = smtp.port;
  await smtp.cerrar(); // el servidor de correo está apagado
  const e = await crearEscenario({ smtpPort: puertoMuerto });
  const r = await post(e, '/api/v1/colaboradores/registro', { idInstitucional: N, campus: X, carreras: [ADM] });
  assert.equal(r.status, 201, 'el alta ya estaba confirmada');
  await esperarCorreos(e);
  assert.equal(await e.repo.existe(N), true);
  assert.equal(e.eventos.length, 1);
  const fallidos = e.servidor.modulos.notificaciones.consumidorRegistro.fallidos();
  assert.equal(fallidos.length, 1);
  assert.equal(fallidos[0].motivo, 'SMTP_NO_DISPONIBLE');
});

test('[HU6-21] reentregar el mismo evento (RabbitMQ) no duplica el correo en el servidor SMTP', async () => {
  const smtp = await crearSmtpDePruebas();
  try {
    const e = await crearEscenario({ smtpPort: smtp.port });
    assert.equal((await post(e, `/api/v1/colaboradores/${A}/baja`, { tipo: 'indefinido' })).status, 200);
    await esperarCorreos(e);
    assert.equal(smtp.correos().length, 1);
    await e.bus.publicar('colaboradores.baja.confirmada', e.eventos[0]); // reentrega del mismo evento
    await esperarCorreos(e);
    assert.equal(smtp.correos().length, 1, 'sigue habiendo un solo correo');
  } finally { await smtp.cerrar(); }
});

test('[HU6-21] cada evento trae lo que los consumidores necesitan (sin datos sensibles)', async () => {
  const e = await crearEscenario();
  await post(e, `/api/v1/colaboradores/${A}/baja`, { tipo: 'indefinido' });
  const ev = e.eventos[0];
  assert.match(ev.eventId, /^evt-baja-/);
  assert.deepEqual([ev.colaboradorId, ev.campus, ev.baja.indefinida, ev.baja.hasta], [A, X, true, null]);
  assert.deepEqual(ev.receptores.map((r) => [r.colaboradorId, r.correoInstitucional, r.aspirantesRecibidos]), [[B, 'beto@itson.edu.mx', 7]]);
  assert.doesNotMatch(JSON.stringify(ev), /password|Password/i);
});

// =====================================================================
// 5. Concurrencia
// =====================================================================

test('[HU6-21] dos bajas simultáneas del mismo colaborador: solo una gana y no se duplica nada', async () => {
  const smtp = await crearSmtpDePruebas();
  try {
    const e = await crearEscenario({ smtpPort: smtp.port });
    const [r1, r2] = await Promise.all([
      post(e, `/api/v1/colaboradores/${A}/baja`, { tipo: 'indefinido' }),
      post(e, `/api/v1/colaboradores/${A}/baja`, { tipo: 'indefinido' }),
    ]);
    assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);

    const lista = await colaboradoresApi(e);
    const porId = Object.fromEntries(lista.map((c) => [c.idInstitucional, c]));
    assert.equal(porId[A].activo, false);
    assert.deepEqual([porId[B].totalAspirantes, lista.reduce((t, c) => t + c.totalAspirantes, 0)], [9, 11], 'los aspirantes se movieron una sola vez');
    assert.deepEqual([...porId[B].carreras].sort(), [ADM, IND, SOFT].sort(), 'la baja perdedora no deshizo las carreras de la ganadora');
    assert.equal(e.repo.bitacoraTransferencias.filter((t) => t.motivo === 'inactivacion').length, 7);
    assert.equal(e.eventos.length, 1);
    await esperarCorreos(e);
    assert.equal(smtp.correos().length, 1);
  } finally { await smtp.cerrar(); }
});
