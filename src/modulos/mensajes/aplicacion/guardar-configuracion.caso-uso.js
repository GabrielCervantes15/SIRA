/**
 * Caso de Uso: Guardar Configuración de Mensajes Automáticos con Validaciones Atómicas
 * Tarea: EQ-107 · HU9-6 (Sprint 2)
 */
import { clonarConfiguracion } from "../dominio/repositorio-configuracion.js";
import { validarConfiguracionMensajes } from "../dominio/validador-configuracion.js";

export class GuardarConfiguracionCasoUso {
  /**
   * @param {Object} dependencias
   * @param {import('../dominio/repositorio-configuracion.js')} dependencias.repositorioConfiguracion
   * @param {Object} [dependencias.interfazLectura] - Interfaz de lectura para sincronizar la instantánea en memoria.
   * @param {() => Date} [dependencias.reloj] - Proveedor de fecha actual para pruebas deterministas.
   * @param {Object|null} [dependencias.servicioBitacora] - Reservado para EQ-108 (bitácora de cambios).
   * @param {Object|null} [dependencias.busEventos] - Reservado para EQ-108 (evento de configuración actualizada).
   */
  constructor({
    repositorioConfiguracion,
    interfazLectura = null,
    reloj = () => new Date(),
    servicioBitacora = null,
    busEventos = null,
  }) {
    if (!repositorioConfiguracion) {
      throw new Error(
        "Se requiere repositorioConfiguracion para inicializar GuardarConfiguracionCasoUso."
      );
    }
    this.repositorio = repositorioConfiguracion;
    this.interfazLectura = interfazLectura;
    this.reloj = reloj;
    this.servicioBitacora = servicioBitacora;
    this.busEventos = busEventos;
  }

  /**
   * Valida y guarda de manera atómica la nueva configuración de mensajes automáticos.
   * Restringida exclusivamente al rol 'administrador'.
   *
   * @param {unknown} datosEntrada
   * @param {{ usuario?: { idInstitucional?: string, rol?: string }|null }} [contexto]
   * @returns {Promise<Object>}
   */
  async ejecutar(datosEntrada, contexto = {}) {
    const usuario = contexto?.usuario || null;

    if (!usuario || !usuario.idInstitucional) {
      const error = new Error(
        "Debes iniciar sesión para modificar la configuración de mensajes."
      );
      error.status = 401;
      error.codigo = "SESION_NO_VALIDA";
      throw error;
    }

    if (usuario.rol !== "administrador") {
      const error = new Error(
        "No tienes permisos para modificar la configuración de mensajes automáticos."
      );
      error.status = 403;
      error.codigo = "SIN_PERMISO";
      throw error;
    }

    const validacion = validarConfiguracionMensajes(datosEntrada);
    if (!validacion.valido) {
      const error = new Error("La configuración contiene errores de validación.");
      error.status = 400;
      error.codigo = "CONFIGURACION_INVALIDA";
      error.errores = validacion.errores;
      throw error;
    }

    const instanteActual = this.reloj();
    const fechaIso =
      instanteActual instanceof Date
        ? instanteActual.toISOString()
        : new Date(instanteActual).toISOString();

    const configuracionAGuardar = {
      ...validacion.configuracionNormalizada,
      actualizadoEn: fechaIso,
      actualizadoPor: String(usuario.idInstitucional),
    };

    const guardada = await this.repositorio.guardarConfiguracion(configuracionAGuardar);

    if (
      this.interfazLectura &&
      typeof this.interfazLectura.actualizarInstantanea === "function"
    ) {
      this.interfazLectura.actualizarInstantanea(guardada);
    }

    return clonarConfiguracion(guardada);
  }
}
