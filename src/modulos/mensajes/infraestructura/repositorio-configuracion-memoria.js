/**
 * Adaptador de Infraestructura en Memoria: Repositorio de Configuración de Mensajes
 * Tareas: EQ-104 (HU9-3) y EQ-108 (HU9-7: Bitácora atómica de cambios)
 */
import { randomUUID } from "node:crypto";
import {
  crearConfiguracionInicial,
  clonarConfiguracion,
  clonarRegistroBitacora,
} from "../dominio/repositorio-configuracion.js";
import { validarConfiguracionMensajes } from "../dominio/validador-configuracion.js";

export class RepositorioConfiguracionMemoria {
  /**
   * @param {Object} [opciones]
   * @param {Object} [opciones.configuracionInicial]
   * @param {Array} [opciones.bitacoraInicial]
   * @param {() => string} [opciones.generarId]
   */
  constructor(opciones = {}) {
    this.generarId = opciones.generarId || randomUUID;
    this.versionEstado = 0;

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

    this.bitacora = Array.isArray(opciones.bitacoraInicial)
      ? opciones.bitacoraInicial.map((r) => clonarRegistroBitacora(r, { congelar: true }))
      : [];
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
   * Guarda de manera atómica la nueva configuración y su entrada de bitácora en memoria.
   * Si ocurre cualquier error de validación o escritura, el estado anterior y la bitácora
   * permanecen intactos.
   *
   * @param {Object} nuevaConfiguracion
   * @param {Object} [opcionesBitacora]
   * @param {string} [opcionesBitacora.bitacoraId]
   * @param {string} [opcionesBitacora.usuarioId]
   * @param {string} [opcionesBitacora.fechaCambio]
   * @param {Object} [opcionesBitacora.valorAnterior]
   * @param {boolean} [opcionesBitacora.omitirBitacoraInterna]
   * @returns {Promise<Object>}
   */
  async guardarConfiguracion(nuevaConfiguracion, opcionesBitacora = {}) {
    const validacion = validarConfiguracionMensajes(nuevaConfiguracion);
    if (!validacion.valido) {
      const error = new Error("La configuración proporcionada no es válida.");
      error.status = 400;
      error.codigo = "CONFIGURACION_INVALIDA";
      error.errores = validacion.errores;
      throw error;
    }

    const valorAnterior = clonarConfiguracion(
      opcionesBitacora.valorAnterior || this.configuracion
    );
    const fechaCambio =
      opcionesBitacora.fechaCambio ||
      nuevaConfiguracion.actualizadoEn ||
      new Date().toISOString();
    const usuarioId = String(
      opcionesBitacora.usuarioId || nuevaConfiguracion.actualizadoPor || "SISTEMA"
    );

    const nuevoEstado = clonarConfiguracion({
      ...validacion.configuracionNormalizada,
      actualizadoEn: fechaCambio,
      actualizadoPor: nuevaConfiguracion.actualizadoPor ?? usuarioId,
    });

    if (!opcionesBitacora.omitirBitacoraInterna) {
      const registroBitacora = clonarRegistroBitacora(
        {
          id:
            opcionesBitacora.bitacoraId ||
            nuevaConfiguracion.bitacoraId ||
            this.generarId(),
          usuarioId,
          fechaCambio,
          valorAnterior,
          valorNuevo: nuevoEstado,
        },
        { congelar: true }
      );
      this.bitacora.unshift(registroBitacora);
    }

    this.ultimoCambioBitacora = {
      bitacoraId:
        opcionesBitacora.bitacoraId ||
        nuevaConfiguracion.bitacoraId ||
        this.bitacora[0]?.id ||
        this.generarId(),
      usuarioId,
      fechaCambio,
      valorAnterior: clonarConfiguracion(valorAnterior),
      valorNuevo: clonarConfiguracion(nuevoEstado),
    };

    this.configuracion = nuevoEstado;
    this.versionEstado += 1;
    return clonarConfiguracion(this.configuracion);
  }

  /**
   * Lista las entradas de la bitácora ordenadas del cambio más reciente al más antiguo (EQ-108 / HU9-7).
   *
   * @param {{ limite?: number, offset?: number }} [opciones]
   * @returns {Promise<{ registros: Array, total: number, limite: number, offset: number }>}
   */
  async listarBitacora({ limite = 50, offset = 0 } = {}) {
    const limNum = parseInt(limite, 10);
    const lim = Number.isFinite(limNum) && limNum > 0 ? Math.min(limNum, 200) : 50;

    const offNum = parseInt(offset, 10);
    const off = Number.isFinite(offNum) && offNum >= 0 ? offNum : 0;

    // `this.bitacora` se inserta con unshift (más reciente primero); desempata por posición si la fecha coincide
    const ordenados = this.bitacora
      .map((registro, indice) => ({ registro, indice }))
      .sort((a, b) => {
        const diffFecha =
          Date.parse(b.registro.fechaCambio) - Date.parse(a.registro.fechaCambio);
        if (diffFecha !== 0) return diffFecha;
        return a.indice - b.indice;
      })
      .map((item) => clonarRegistroBitacora(item.registro));

    const total = ordenados.length;
    const registros = ordenados.slice(off, off + lim);

    return {
      registros,
      total,
      limite: lim,
      offset: off,
    };
  }
}
