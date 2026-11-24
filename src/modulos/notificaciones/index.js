/**
 * Módulo Notificaciones: consume eventos del bus y envía correos (HU6-14 / EQ-61).
 * En el Sprint 1 el correo es simulado (bandeja en memoria).
 */
import { crearServicioCorreoSimulado } from "./servicio-correo-simulado.js";
import { crearConsumidorRegistroConfirmado, PATRON_REGISTRO_CONFIRMADO } from "./consumidor-registro.js";

/**
 * @param {Object} dependencias
 * @param {Object} dependencias.bus
 * @param {Object} [dependencias.servicioCorreo] - Por defecto, el simulado.
 * @param {Object} [dependencias.opcionesConsumidor] - intentos, esperaBaseMs, urlSira, registrar.
 */
export function crearModuloNotificaciones({ bus, servicioCorreo, opcionesConsumidor = {} }) {
  const correo = servicioCorreo || crearServicioCorreoSimulado();
  const consumidorRegistro = crearConsumidorRegistroConfirmado({ bus, servicioCorreo: correo, ...opcionesConsumidor });
  return {
    servicioCorreo: correo,
    consumidorRegistro,
    detener: () => consumidorRegistro.detener(),
  };
}

export { crearServicioCorreoSimulado, crearConsumidorRegistroConfirmado, PATRON_REGISTRO_CONFIRMADO };
export { correoBienvenidaColaborador } from "./plantillas.js";
