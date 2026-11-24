/**
 * EQ-61 · HU6-14: consumir eventos del bus y enviar el correo de bienvenida.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearBusEnMemoria } from '../src/compartido/eventos/bus-en-memoria.js';
import {
  crearModuloNotificaciones, crearServicioCorreoSimulado, correoBienvenidaColaborador,
} from '../src/modulos/notificaciones/index.js';

const evento = (extra = {}) => ({
  eventId: 'evt-reg-1',
  tipo: 'colaboradores.registro.confirmado',
  colaboradorId: '00000300001',
  nombreCompleto: 'Nora Nueva Díaz',
  correoInstitucional: 'nora@itson.edu.mx',
  campus: 'Campus Obregón Náinari',
  carrerasAsignadas: ['Ingeniería en Software', 'Ingeniería Industrial'],
  aspirantesAsignados: ['a1', 'a2', 'a3'],
  ...extra,
});

function crear({ fallarVeces = 0, intentos = 3 } = {}) {
  const bus = crearBusEnMemoria();
  const registros = [];
  const servicioCorreo = crearServicioCorreoSimulado({ fallarVeces });
  const modulo = crearModuloNotificaciones({
    bus,
    servicioCorreo,
    opcionesConsumidor: { intentos, esperaBaseMs: 1, urlSira: 'https://sira.itson.mx', registrar: (m) => registros.push(m) },
  });
  return { bus, modulo, servicioCorreo, registros };
}

test('[EQ-61] el evento de registro confirmado manda un correo al colaborador', async () => {
  const { bus, modulo, servicioCorreo } = crear();
  await bus.publicar('colaboradores.registro.confirmado', evento());
  await modulo.consumidorRegistro.esperarPendientes();

  const [correo] = servicioCorreo.bandeja();
  assert.equal(servicioCorreo.bandeja().length, 1);
  assert.equal(correo.para, 'nora@itson.edu.mx');
  assert.match(correo.asunto, /Bienvenido a SIRA/);
  assert.match(correo.texto, /Hola, Nora Nueva Díaz/);
  assert.match(correo.texto, /Campus: Campus Obregón Náinari/);
  assert.match(correo.texto, /Ingeniería en Software, Ingeniería Industrial/);
  assert.match(correo.texto, /Aspirantes en tu cartera: 3/);
  assert.match(correo.texto, /https:\/\/sira\.itson\.mx/);
  assert.doesNotMatch(correo.texto, /contraseña:/i, 'nunca manda una contraseña');
});

test('[EQ-61] es idempotente: el mismo eventId entregado dos veces manda un solo correo', async () => {
  const { bus, modulo, servicioCorreo } = crear();
  await bus.publicar('colaboradores.registro.confirmado', evento());
  await bus.publicar('colaboradores.registro.confirmado', evento());
  await modulo.consumidorRegistro.esperarPendientes();
  assert.equal(servicioCorreo.bandeja().length, 1);
  assert.equal(modulo.consumidorRegistro.procesados().length, 1);
});

test('[EQ-61] reintenta fallos temporales del servidor de correo', async () => {
  const { bus, modulo, servicioCorreo } = crear({ fallarVeces: 2, intentos: 3 });
  await bus.publicar('colaboradores.registro.confirmado', evento());
  await modulo.consumidorRegistro.esperarPendientes();
  assert.equal(servicioCorreo.bandeja().length, 1);
  assert.deepEqual(modulo.consumidorRegistro.fallidos(), []);
});

test('[EQ-61] si se agotan los intentos queda en fallidos y puede reprocesarse', async () => {
  const { bus, modulo, servicioCorreo } = crear({ fallarVeces: 3, intentos: 3 });
  await bus.publicar('colaboradores.registro.confirmado', evento());
  await modulo.consumidorRegistro.esperarPendientes();
  assert.equal(servicioCorreo.bandeja().length, 0);
  assert.deepEqual(modulo.consumidorRegistro.fallidos(), [
    { eventId: 'evt-reg-1', colaboradorId: '00000300001', motivo: 'SMTP_NO_DISPONIBLE', intentos: 3 },
  ]);
  // Reentrega (como haría RabbitMQ): ahora el SMTP ya responde.
  await bus.publicar('colaboradores.registro.confirmado', evento());
  await modulo.consumidorRegistro.esperarPendientes();
  assert.equal(servicioCorreo.bandeja().length, 1);
});

test('[EQ-61] un destinatario inválido no se reintenta y un evento incompleto se descarta', async () => {
  const { bus, modulo, servicioCorreo } = crear();
  await bus.publicar('colaboradores.registro.confirmado', evento({ eventId: 'e-malo', correoInstitucional: 'sin-arroba' }));
  await bus.publicar('colaboradores.registro.confirmado', { eventId: 'e-incompleto' });
  await modulo.consumidorRegistro.esperarPendientes();
  assert.equal(servicioCorreo.bandeja().length, 0);
  assert.deepEqual(modulo.consumidorRegistro.fallidos().map((f) => [f.eventId, f.motivo, f.intentos]), [
    ['e-malo', 'DESTINATARIO_INVALIDO', 1],
    ['e-incompleto', 'EVENTO_INCOMPLETO', undefined],
  ]);
});

test('[EQ-61] ignora otros eventos y deja de escuchar al detenerse', async () => {
  const { bus, modulo, servicioCorreo } = crear();
  await bus.publicar('mensajes.configuracion.actualizada', evento({ eventId: 'otro' }));
  modulo.detener();
  await bus.publicar('colaboradores.registro.confirmado', evento({ eventId: 'tarde' }));
  await modulo.consumidorRegistro.esperarPendientes();
  assert.equal(servicioCorreo.bandeja().length, 0);
});

test('[EQ-61] la versión HTML escapa los datos del evento', () => {
  const correo = correoBienvenidaColaborador(evento({ nombreCompleto: '<script>x</script>' }));
  assert.doesNotMatch(correo.html, /<script>x<\/script>/);
  assert.match(correo.html, /&lt;script&gt;/);
});
