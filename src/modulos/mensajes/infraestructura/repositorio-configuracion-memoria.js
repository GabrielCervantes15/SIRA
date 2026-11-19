/**
 * Adaptador de Infraestructura en Memoria: Repositorio de Configuración de Mensajes
 * Tarea: EQ-104 · HU9-3 (Sprint 2)
 */
import {
  crearConfiguracionInicial,
  clonarConfiguracion,
} from "../dominio/repositorio-configuracion.js";
import { validarConfiguracionMensajes } from "../dominio/validador-configuracion.js";

export class RepositorioConfiguracionMemoria {
  /**
   * @param {Object} [opciones]
   * @param {Object} [opciones.configuracionInicial]
   */
  constructor(opciones = {}) {
    if (opciones.configuracionInicial) {
      const validacion = validarConfiguracionMensajes(opciones.configuracionInicial);
      if (!validacion.valido) {
        throw new Error(
          `Configuración inicial inválida: ${JSON.stringify(validacion.errores)}`
        );
      }
      this.configuracion = clonarConfiguracion({
        ...validacion.configuracionNormalizada,
        actualizadoEn: opciones.configuracionInicial.actualizadoEn ?? null,
        actualizadoPor: opciones.configuracionInicial.actualizadoPor ?? null,
      });
    } else {
      this.configuracion = crearConfiguracionInicial();
    }
  }

  /**
   * Acceso sincrónico de lectura rápida a una copia inmutable del estado en memoria.
   * @returns {Object}
   */
  obtenerInstantanea() {
    return clonarConfiguracion(this.configuracion, { congelar: true });
  }

  /**
   * Obtiene la configuración vigente almacenada en memoria.
   * @returns {Promise<Object>}
   */
  async obtenerConfiguracion() {
    return clonarConfiguracion(this.configuracion);
  }

  /**
   * Guarda de manera atómica la nueva configuración en memoria.
   * Si ocurre cualquier error de validación, el estado anterior permanece intacto.
   *
   * @param {Object} nuevaConfiguracion
   * @returns {Promise<Object>}
   */
  async guardarConfiguracion(nuevaConfiguracion) {
    const validacion = validarConfiguracionMensajes(nuevaConfiguracion);
    if (!validacion.valido) {
      const error = new Error("La configuración proporcionada no es válida.");
      error.status = 400;
      error.codigo = "CONFIGURACION_INVALIDA";
      error.errores = validacion.errores;
      throw error;
    }

    const nuevoEstado = clonarConfiguracion({
      ...validacion.configuracionNormalizada,
      actualizadoEn: nuevaConfiguracion.actualizadoEn ?? new Date().toISOString(),
      actualizadoPor: nuevaConfiguracion.actualizadoPor ?? null,
    });

    this.configuracion = nuevoEstado;
    return clonarConfiguracion(this.configuracion);
  }
}
