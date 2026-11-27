/**
 * Módulo Notificaciones: consume eventos del bus y envía correos (HU6-14 / EQ-61, BASE-9).
 *
 * El correo sale por SMTP cuando existe `SMTP_HOST` (en Docker apunta a Mailpit; los correos
 * se ven en http://localhost:8025). Sin `SMTP_HOST` se usa el simulado en memoria, que es
 * lo que usan las pruebas.
 */
import { crearServicioCorreoSimulado } from "./servicio-correo-simulado.js";
import { crearServicioCorreoSmtp } from "./servicio-correo-smtp.js";
import { crearConsumidorRegistroConfirmado, PATRON_REGISTRO_CONFIRMADO } from "./consumidor-registro.js";
import { crearConsumidorBajaConfirmada, PATRON_BAJA_CONFIRMADA } from "./consumidor-baja.js";

/**
 * SMTP si hay `SMTP_HOST`; si no, el simulado.
 * Variables: SMTP_HOST, SMTP_PORT (25 por defecto), SMTP_FROM (sira@localhost por defecto).
 * @param {Record<string, string|undefined>} [entorno]
 */
export function crearServicioCorreoDesdeEntorno(entorno = process.env) {
  const host = String(entorno.SMTP_HOST ?? "").trim();
  if (!host) return crearServicioCorreoSimulado();
  const port = entorno.SMTP_PORT ? Number(entorno.SMTP_PORT) : 25;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`SMTP_PORT no es válido: "${entorno.SMTP_PORT}".`);
  }
  return crearServicioCorreoSmtp({ host, port, desde: entorno.SMTP_FROM || undefined });
}

/**
 * @param {Object} dependencias
 * @param {Object} dependencias.bus
 * @param {Object} [dependencias.servicioCorreo] - Por defecto, según el entorno (SMTP o simulado).
 * @param {Object} [dependencias.opcionesConsumidor] - intentos, esperaBaseMs, urlSira, registrar.
 */
export function crearModuloNotificaciones({ bus, servicioCorreo, opcionesConsumidor = {} }) {
  const correo = servicioCorreo || crearServicioCorreoDesdeEntorno();
  const consumidorRegistro = crearConsumidorRegistroConfirmado({ bus, servicioCorreo: correo, ...opcionesConsumidor });
  const consumidorBaja = crearConsumidorBajaConfirmada({ bus, servicioCorreo: correo, ...opcionesConsumidor });
  return {
    servicioCorreo: correo,
    consumidorRegistro,
    consumidorBaja,
    detener: () => { consumidorRegistro.detener(); consumidorBaja.detener(); },
  };
}

export {
  crearServicioCorreoSimulado, crearServicioCorreoSmtp,
  crearConsumidorRegistroConfirmado, PATRON_REGISTRO_CONFIRMADO,
  crearConsumidorBajaConfirmada, PATRON_BAJA_CONFIRMADA,
};
export { correoBienvenidaColaborador, correoReasignacionPorBaja, armarCorreo } from "./plantillas.js";
export { enviarConReintentos } from "./cola-envio.js";
