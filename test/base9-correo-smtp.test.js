/**
 * BASE-9: correo por SMTP (contra un servidor SMTP falso local), plantilla base,
 * cola con reintentos y aviso por correo de la baja de un colaborador.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { crearServidor } from '../src/servidor.js';
import { crearBusEnMemoria } from '../src/compartido/eventos/bus-en-memoria.js';
import {
  crearServicioCorreoSmtp, crearServicioCorreoSimulado, crearServicioCorreoDesdeEntorno,
  crearConsumidorBajaConfirmada, correoReasignacionPorBaja, armarCorreo, enviarConReintentos,
} from '../src/modulos/notificaciones/index.js';

/** Servidor SMTP de mentira: guarda lo que recibe y responde según `config`. */
async function conSmtpFalso(config, ejecutar) {
  const recibido = { comandos: [], datos: '', conexiones: 0 };
  const servidor = net.createServer((socket) => {
    recibido.conexiones += 1;
    socket.setEncoding('utf8');
    let enDatos = false; let buffer = '';
    const resp = (t) => socket.write(`${t}\r\n`);
    resp(config.saludo ?? '220 falso listo');
    socket.on('data', (trozo) => {
      buffer += trozo;
      let i;
      while ((i = buffer.indexOf('\r\n')) !== -1) {
        const linea = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        if (enDatos) {
          if (linea === '.') { enDatos = false; resp(config.finDatos ?? '250 ok guardado'); } else recibido.datos += `${linea}\n`;
          continue;
        }
        recibido.comandos.push(linea);
        if (linea.startsWith('EHLO')) { socket.write('250-falso\r\n250-8BITMIME\r\n250 SIZE 1000\r\n'); }
        else if (linea.startsWith('MAIL')) resp('250 ok');
        else if (linea.startsWith('RCPT')) resp(config.rcpt ?? '250 ok');
        else if (linea === 'DATA') { enDatos = true; resp('354 adelante'); }
        else if (linea === 'QUIT') { resp('221 adiós'); socket.end(); }
      }
    });
    socket.on('error', () => {});
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  try { await ejecutar({ port: servidor.address().port, recibido }); }
  finally { await new Promise((r) => servidor.close(r)); }
}

const decodificarPartes = (datos) => [...datos.matchAll(/Content-Type: (text\/\w+); charset=utf-8\nContent-Transfer-Encoding: base64\n\n([A-Za-z0-9+/=\n]+)/g)]
  .map(([, tipo, b64]) => [tipo, Buffer.from(b64.replace(/\n/g, ''), 'base64').toString('utf8')]);

test('[BASE-9] SMTP: manda el correo completo (texto + HTML, acentos y punto solitario)', async () => {
  await conSmtpFalso({}, async ({ port, recibido }) => {
    const smtp = crearServicioCorreoSmtp({ host: '127.0.0.1', port, desde: 'sira@itson.mx' });
    const texto = 'Línea con acentos: áéíóú ñ\n.\n.punto al inicio\nfin';
    const { id } = await smtp.enviar({ para: 'nora@itson.edu.mx', asunto: 'Bienvenida: ¡ya estás dentro!', texto, html: '<p>Hola <b>Nora</b></p>' });
    assert.match(id, /@itson\.mx$/);
    assert.deepEqual(recibido.comandos.slice(0, 5).map((c) => c.split(' ')[0]), ['EHLO', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
    assert.ok(recibido.comandos.includes('MAIL FROM:<sira@itson.mx>'));
    assert.ok(recibido.comandos.includes('RCPT TO:<nora@itson.edu.mx>'));
    assert.match(recibido.datos, /^To: <nora@itson\.edu\.mx>$/m);
    assert.match(recibido.datos, /^Subject: =\?UTF-8\?B\?/m);
    const asunto = /^Subject: =\?UTF-8\?B\?(.+)\?=$/m.exec(recibido.datos)[1];
    assert.equal(Buffer.from(asunto, 'base64').toString('utf8'), 'Bienvenida: ¡ya estás dentro!');
    const partes = decodificarPartes(recibido.datos);
    assert.deepEqual(partes, [['text/plain', texto], ['text/html', '<p>Hola <b>Nora</b></p>']]);
  });
});

test('[BASE-9] SMTP: sin HTML manda solo texto plano', async () => {
  await conSmtpFalso({}, async ({ port, recibido }) => {
    await crearServicioCorreoSmtp({ host: '127.0.0.1', port }).enviar({ para: 'a@b.mx', asunto: 'x', texto: 'solo texto' });
    assert.deepEqual(decodificarPartes(recibido.datos), [['text/plain', 'solo texto']]);
    assert.doesNotMatch(recibido.datos, /multipart/);
  });
});

test('[BASE-9] SMTP: valida antes de conectarse (destinatario, contenido, inyección de cabeceras)', async () => {
  await conSmtpFalso({}, async ({ port, recibido }) => {
    const smtp = crearServicioCorreoSmtp({ host: '127.0.0.1', port });
    const rechaza = (datos, codigo) => assert.rejects(smtp.enviar(datos), (e) => e.codigo === codigo && e.reintentable === false);
    await rechaza({ para: 'no-es-correo', asunto: 'x', texto: 'y' }, 'DESTINATARIO_INVALIDO');
    await rechaza({ para: 'a@b.mx\r\nBcc: otro@x.mx', asunto: 'x', texto: 'y' }, 'DESTINATARIO_INVALIDO');
    await rechaza({ para: 'a@b.mx', asunto: '', texto: 'y' }, 'CORREO_INCOMPLETO');
    await rechaza({ para: 'a@b.mx', asunto: 'x', texto: '' }, 'CORREO_INCOMPLETO');
    assert.equal(recibido.conexiones, 0, 'no se abrió ninguna conexión');
    // Un salto de línea en el asunto no puede abrir una cabecera nueva.
    await smtp.enviar({ para: 'a@b.mx', asunto: 'hola\r\nBcc: x@y.mx', texto: 'y' });
    assert.doesNotMatch(recibido.datos, /^Bcc:/m);
  });
});

test('[BASE-9] SMTP: 5xx es permanente (no se reintenta) y 4xx es temporal (sí)', async () => {
  const datos = { para: 'a@b.mx', asunto: 'x', texto: 'y' };
  await conSmtpFalso({ rcpt: '550 buzón inexistente' }, async ({ port }) => {
    await assert.rejects(crearServicioCorreoSmtp({ host: '127.0.0.1', port }).enviar(datos),
      (e) => e.codigo === 'DESTINATARIO_RECHAZADO' && e.reintentable === false);
  });
  await conSmtpFalso({ rcpt: '451 intenta más tarde' }, async ({ port }) => {
    await assert.rejects(crearServicioCorreoSmtp({ host: '127.0.0.1', port }).enviar(datos),
      (e) => e.codigo === 'SMTP_TEMPORAL' && e.reintentable === true);
  });
  await conSmtpFalso({ saludo: '421 servicio no disponible' }, async ({ port }) => {
    await assert.rejects(crearServicioCorreoSmtp({ host: '127.0.0.1', port }).enviar(datos), (e) => e.reintentable === true);
  });
});

test('[BASE-9] SMTP: servidor caído o que no responde es un fallo temporal', async () => {
  // Puerto cerrado: se abre y se cierra un servidor para obtener un puerto libre.
  const libre = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  await assert.rejects(crearServicioCorreoSmtp({ host: '127.0.0.1', port: libre, timeoutMs: 500 }).enviar({ para: 'a@b.mx', asunto: 'x', texto: 'y' }),
    (e) => e.codigo === 'SMTP_NO_DISPONIBLE' && e.reintentable === true);

  // Acepta la conexión pero nunca habla.
  const mudo = net.createServer(() => {});
  await new Promise((r) => mudo.listen(0, '127.0.0.1', r));
  try {
    await assert.rejects(crearServicioCorreoSmtp({ host: '127.0.0.1', port: mudo.address().port, timeoutMs: 200 }).enviar({ para: 'a@b.mx', asunto: 'x', texto: 'y' }),
      (e) => e.codigo === 'SMTP_NO_DISPONIBLE' && /tiempo agotado/.test(e.message));
  } finally { await new Promise((r) => { mudo.close(r); mudo.closeAllConnections?.(); }); }
});

test('[BASE-9] el servicio se elige por entorno: SMTP_HOST → SMTP; sin él → simulado', () => {
  assert.equal(typeof crearServicioCorreoDesdeEntorno({}).bandeja, 'function', 'simulado tiene bandeja');
  assert.equal(typeof crearServicioCorreoDesdeEntorno({ SMTP_HOST: '' }).bandeja, 'function');
  assert.equal(typeof crearServicioCorreoDesdeEntorno({ SMTP_HOST: 'mailpit', SMTP_PORT: '1025' }).bandeja, 'undefined', 'SMTP real no tiene bandeja');
  assert.throws(() => crearServicioCorreoDesdeEntorno({ SMTP_HOST: 'mailpit', SMTP_PORT: 'abc' }), /SMTP_PORT/);
  assert.throws(() => crearServicioCorreoDesdeEntorno({ SMTP_HOST: 'mailpit', SMTP_PORT: '99999' }), /SMTP_PORT/);
});

test('[BASE-9] cola: reintenta lo temporal, no lo permanente, y reporta intentos', async () => {
  const sim = crearServicioCorreoSimulado({ fallarVeces: 2 });
  const correo = { para: 'a@b.mx', asunto: 'x', texto: 'y' };
  const ok = await enviarConReintentos({ servicioCorreo: sim, correo, intentos: 3, esperaBaseMs: 1 });
  assert.deepEqual([ok.ok, ok.intentos], [true, 3]);

  const agotado = await enviarConReintentos({ servicioCorreo: crearServicioCorreoSimulado({ fallarVeces: 9 }), correo, intentos: 2, esperaBaseMs: 1 });
  assert.deepEqual([agotado.ok, agotado.intentos, agotado.error.codigo], [false, 2, 'SMTP_NO_DISPONIBLE']);

  const permanente = await enviarConReintentos({ servicioCorreo: sim, correo: { ...correo, para: 'malo' }, intentos: 5, esperaBaseMs: 1 });
  assert.deepEqual([permanente.ok, permanente.intentos], [false, 1]);
});

test('[BASE-9] plantilla base: texto y HTML, con los datos escapados', () => {
  const c = armarCorreo({ para: 'a@b.mx', asunto: 'Asunto', saludo: 'Hola, <b>Eva</b>:', parrafos: ['Uno & dos'], datos: [['Campus', 'X<Y']], lista: ['a', 'b'], enlace: { texto: 'Entra:', url: 'https://sira.mx/?a=1&b=2' } });
  assert.match(c.texto, /^Hola, <b>Eva<\/b>:/);
  assert.match(c.texto, /Campus: X<Y/);
  assert.match(c.texto, /- a\n- b/);
  assert.match(c.texto, /mensaje automático/);
  assert.match(c.html, /Hola, &lt;b&gt;Eva&lt;\/b&gt;:/);
  assert.match(c.html, /Uno &amp; dos/);
  assert.match(c.html, /<li><strong>Campus:<\/strong> X&lt;Y<\/li>/);
  assert.match(c.html, /href="https:\/\/sira\.mx\/\?a=1&amp;b=2"/);
});

// ---------- Aviso de baja ----------

const eventoBaja = (extra = {}) => ({
  eventId: 'evt-baja-1', tipo: 'colaboradores.baja.confirmada', colaboradorId: '00000252115', nombreCompleto: 'Sebastián Bórquez', campus: 'Campus Obregón Náinari',
  baja: { indefinida: false, desde: '2026-11-26', hasta: '2027-01-15' },
  receptores: [
    { colaboradorId: 'R1', nombreCompleto: 'Rosa Uno', correoInstitucional: 'rosa@itson.edu.mx', aspirantesRecibidos: 12, carrerasRecibidas: [{ campus: 'Campus Obregón Náinari', carrera: 'Ingeniería en Software', aspirantes: 12 }] },
    { colaboradorId: 'R2', nombreCompleto: 'Raúl Dos', correoInstitucional: 'raul@itson.edu.mx', aspirantesRecibidos: 5, carrerasRecibidas: [{ campus: 'Campus Obregón Náinari', carrera: 'Industrial', aspirantes: 5 }] },
  ],
  ...extra,
});

test('[BASE-9] el correo de baja dice quién se fue, el periodo y qué carreras recibe', () => {
  const [r1] = eventoBaja().receptores;
  const c = correoReasignacionPorBaja(eventoBaja(), r1, { urlSira: 'https://sira.itson.mx' });
  assert.equal(c.para, 'rosa@itson.edu.mx');
  assert.match(c.asunto, /12 aspirante/);
  assert.match(c.texto, /Sebastián Bórquez/);
  assert.match(c.texto, /del 2026-11-26 al 2027-01-15/);
  assert.match(c.texto, /- Ingeniería en Software \(Campus Obregón Náinari\): 12 aspirante/);
  assert.match(correoReasignacionPorBaja(eventoBaja({ baja: { indefinida: true, desde: '2026-11-26', hasta: null } }), r1).texto, /tiempo indefinido/);
});

test('[BASE-9] consumidor de baja: un correo por receptor, idempotente, con reintentos', async () => {
  const bus = crearBusEnMemoria();
  const servicioCorreo = crearServicioCorreoSimulado({ fallarVeces: 1 });
  const consumidor = crearConsumidorBajaConfirmada({ bus, servicioCorreo, esperaBaseMs: 1, registrar: () => {} });
  await bus.publicar('colaboradores.baja.confirmada', eventoBaja());
  await bus.publicar('colaboradores.baja.confirmada', eventoBaja()); // reentrega
  await consumidor.esperarPendientes();
  assert.deepEqual(servicioCorreo.bandeja().map((c) => c.para).sort(), ['raul@itson.edu.mx', 'rosa@itson.edu.mx']);
  assert.deepEqual(consumidor.fallidos(), []);
});

test('[BASE-9] consumidor de baja: un receptor sin correo o con fallo no impide avisar a los demás', async () => {
  const bus = crearBusEnMemoria();
  const servicioCorreo = crearServicioCorreoSimulado();
  const consumidor = crearConsumidorBajaConfirmada({ bus, servicioCorreo, esperaBaseMs: 1, registrar: () => {} });
  const evento = eventoBaja();
  evento.receptores[0].correoInstitucional = null;
  await bus.publicar('colaboradores.baja.confirmada', evento);
  await bus.publicar('colaboradores.baja.confirmada', { eventId: 'x' }); // incompleto
  await consumidor.esperarPendientes();
  assert.deepEqual(servicioCorreo.bandeja().map((c) => c.para), ['raul@itson.edu.mx']);
  assert.deepEqual(consumidor.fallidos().map((f) => f.motivo), ['SIN_CORREO', 'EVENTO_INCOMPLETO']);
});

test('[BASE-9] de punta a punta: dar de baja por HTTP envía los correos a los receptores', async () => {
  const servicioCorreo = crearServicioCorreoSimulado();
  const servidor = crearServidor({ servicioCorreo, opcionesNotificaciones: { esperaBaseMs: 1, registrar: () => {} } });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: '00000100001', password: 'AdminPassword2026!' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const r = await fetch(`${base}/api/v1/colaboradores/00000252115/baja`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'indefinido' }) });
    assert.equal(r.status, 200);
    const { reasignacion } = await r.json();
    await servidor.modulos.notificaciones.consumidorBaja.esperarPendientes();
    const enviados = servicioCorreo.bandeja().filter((c) => /reasignaron/.test(c.asunto));
    assert.equal(enviados.length, reasignacion.receptores.length);
    assert.ok(enviados.every((c) => /@/.test(c.para) && /Por la baja de/.test(c.texto)));
  } finally { await new Promise((r) => servidor.close(r)); }
});
