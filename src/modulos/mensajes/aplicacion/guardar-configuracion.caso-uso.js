/**
 * Caso de Uso: Guardar Configuración de Mensajes Automáticos con Validaciones Atómicas,
 * Registro en Bitácora y Publicación de Evento
 * Tareas: EQ-107 (HU9-6) y EQ-108 (HU9-7)
 */
import { randomUUID } from "node:crypto";
import { clonarConfiguracion } from "../dominio/repositorio-configuracion.js";
import { validarConfiguracionMensajes } from "../dominio/validador-configuracion.js";
import {
  TIPO_CONFIGURACION_ACTUALIZADA,
  crearEventoConfiguracionActualizada,
} from "../eventos.js";

export class GuardarConfiguracionCasoUso {
  /**
   * @param {Object} dependencias
   * @param {import('../dominio/repositorio-configuracion.js')} dependencias.repositorioConfiguracion
   * @param {Object} [dependencias.interfazLectura] - Interfaz de lectura para sincronizar la instantánea en memoria.
   * @param {() => Date} [dependencias.reloj] - Proveedor de fecha actual para pruebas deterministas.
   * @param {() => string} [dependencias.generarId] - Generador de UUIDs para bitácora y eventos.
   * @param {Object|null} [dependencias.servicioBitacora] - Servicio opcional de bitácora externa (si no se inyecta, usa la bitácora atómica del repositorio).
   * @param {{ publicar?: Function }|null} [dependencias.busEventos] - Bus de eventos para publicar `mensajes.configuracion.actualizada`.
   */
  constructor({
    repositorioConfiguracion,
    interfazLectura = null,
    reloj = () => new Date(),
    generarId = randomUUID,
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
    this.generarId = generarId;
    this.servicioBitacora = servicioBitacora;
    this.busEventos = busEventos;
  }

  /**
   * Valida y guarda de manera atómica la nueva configuración de mensajes automáticos,
   * registra la entrada de bitácora y publica el evento `mensajes.configuracion.actualizada`.
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

    // 1. Obtener configuración previa si se usa un servicio de bitácora externo;
    // de lo contrario, el repositorio la resuelve atómicamente dentro de su transacción.
    const usaServicioBitacoraExterno = Boolean(
      this.servicioBitacora &&
        (typeof this.servicioBitacora.registrarCambio === "function" ||
          typeof this.servicioBitacora.registrar === "function")
    );

    const valorAnteriorExterno = usaServicioBitacoraExterno
      ? clonarConfiguracion(await this.repositorio.obtenerConfiguracion())
      : null;

    const instanteActual = this.reloj();
    const fechaIso =
      instanteActual instanceof Date
        ? instanteActual.toISOString()
        : new Date(instanteActual).toISOString();

    const usuarioId = String(usuario.idInstitucional);
    const bitacoraId = this.generarId();

    const configuracionAGuardar = {
      ...validacion.configuracionNormalizada,
      actualizadoEn: fechaIso,
      actualizadoPor: usuarioId,
    };

    // 2. Guardar configuración + bitácora de forma atómica (en una sola transacción)
    const guardada = await this.repositorio.guardarConfiguracion(
      configuracionAGuardar,
      {
        bitacoraId,
        usuarioId,
        fechaCambio: fechaIso,
        ...(valorAnteriorExterno ? { valorAnterior: valorAnteriorExterno } : {}),
        omitirBitacoraInterna: usaServicioBitacoraExterno,
      }
    );

    const valorAnterior =
      valorAnteriorExterno ||
      this.repositorio.ultimoCambioBitacora?.valorAnterior ||
      clonarConfiguracion(guardada);

    if (usaServicioBitacoraExterno) {
      const registrarFn =
        this.servicioBitacora.registrarCambio || this.servicioBitacora.registrar;
      await registrarFn.call(this.servicioBitacora, {
        id: bitacoraId,
        usuarioId,
        fechaCambio: fechaIso,
        valorAnterior,
        valorNuevo: clonarConfiguracion(guardada),
      });
    }

    // 3. Sincronizar interfaz de lectura local en memoria
    if (
      this.interfazLectura &&
      typeof this.interfazLectura.actualizarInstantanea === "function"
    ) {
      this.interfazLectura.actualizarInstantanea(guardada);
    }

    // 4. Solo tras éxito del guardado y bitácora, publicar evento en el bus (EQ-108 / HU9-7)
    if (this.busEventos && typeof this.busEventos.publicar === "function") {
      const evento = crearEventoConfiguracionActualizada(
        {
          bitacoraId,
          usuarioId,
          fechaCambio: fechaIso,
          valorAnterior,
          valorNuevo: guardada,
        },
        {
          ahora: () => new Date(fechaIso),
          generarId: this.generarId,
        }
      );

      await this.busEventos.publicar(TIPO_CONFIGURACION_ACTUALIZADA, evento);
    }

    return clonarConfiguracion(guardada);
  }
}
