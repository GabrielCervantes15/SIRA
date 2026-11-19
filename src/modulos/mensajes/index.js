/**
 * Módulo de Negocio: Mensajes
 * Punto de entrada público, inyección de dependencias e interfaz pública de lectura
 * de la configuración del envío de mensajes automáticos (HU 9: EQ-104, EQ-105, EQ-106, EQ-107).
 */
import {
  ZONA_HORARIA_INSTITUCIONAL,
  DIAS_SEMANA,
  ORDEN_DIAS_SEMANA,
  UNIDADES_TIEMPO_PERMITIDAS,
  LIMITES_TIEMPO_HORAS,
  METODOS_REPOSITORIO_CONFIGURACION,
  calcularEquivalenciaHoras,
  crearConfiguracionInicial,
  clonarConfiguracion,
  implementaRepositorioConfiguracion,
} from "./dominio/repositorio-configuracion.js";
import {
  validarConfiguracionMensajes,
  convertirHoraAMinutos,
} from "./dominio/validador-configuracion.js";
import { RepositorioConfiguracionMemoria } from "./infraestructura/repositorio-configuracion-memoria.js";
import { RepositorioConfiguracionPostgres } from "./infraestructura/repositorio-configuracion-postgres.js";
import {
  crearInterfazLecturaConfiguracion,
  evaluarHorarioPermitido,
  calcularSiguienteAperturaDesdeConfig,
  obtenerPartesEnZonaHoraria,
  construirFechaEnZonaHoraria,
} from "./aplicacion/servicio-lectura-configuracion.js";
import { ObtenerConfiguracionCasoUso } from "./aplicacion/obtener-configuracion.caso-uso.js";
import { GuardarConfiguracionCasoUso } from "./aplicacion/guardar-configuracion.caso-uso.js";
import { MensajesConfiguracionControlador } from "./infraestructura/controlador-configuracion.js";
import { crearEnrutadorMensajes } from "./rutas.js";

/**
 * Crea una instancia completa del módulo de Mensajes con sus casos de uso,
 * controlador HTTP, enrutador e interfaz pública de lectura (EQ-105).
 *
 * @param {Object} [opciones]
 * @param {Object} [opciones.repositorio]
 * @param {Object} [opciones.configuracionInicial]
 * @param {() => Date} [opciones.reloj]
 * @param {Object} [opciones.servicioBitacora] - Reservado para EQ-108.
 * @param {Object} [opciones.busEventos] - Reservado para EQ-108.
 */
export function crearModuloMensajes(opciones = {}) {
  const repositorio =
    opciones.repositorio ||
    new RepositorioConfiguracionMemoria({
      configuracionInicial: opciones.configuracionInicial,
    });

  const interfazLectura = crearInterfazLecturaConfiguracion({
    repositorioConfiguracion: repositorio,
  });

  const obtenerConfiguracionCasoUso = new ObtenerConfiguracionCasoUso({
    repositorioConfiguracion: repositorio,
  });

  const guardarConfiguracionCasoUso = new GuardarConfiguracionCasoUso({
    repositorioConfiguracion: repositorio,
    interfazLectura,
    reloj: opciones.reloj,
    servicioBitacora: opciones.servicioBitacora || null,
    busEventos: opciones.busEventos || null,
  });

  const controlador = new MensajesConfiguracionControlador({
    obtenerConfiguracionCasoUso,
    guardarConfiguracionCasoUso,
  });

  const enrutador = crearEnrutadorMensajes({ controlador });

  return {
    repositorio,
    interfazLectura,
    obtenerConfiguracionVigente: interfazLectura.obtenerConfiguracionVigente,
    estaDentroDeHorarioPermitido: interfazLectura.estaDentroDeHorarioPermitido,
    calcularSiguienteApertura: interfazLectura.calcularSiguienteApertura,
    obtenerConfiguracionCasoUso,
    guardarConfiguracionCasoUso,
    controlador,
    enrutador,
  };
}

// Instancia predeterminada de lectura para consumo directo entre módulos (HU1 / HU8)
const moduloPorDefecto = crearModuloMensajes();

export function obtenerConfiguracionVigente() {
  return moduloPorDefecto.obtenerConfiguracionVigente();
}

export function estaDentroDeHorarioPermitido(fecha = new Date()) {
  return moduloPorDefecto.estaDentroDeHorarioPermitido(fecha);
}

export function calcularSiguienteApertura(fecha = new Date()) {
  return moduloPorDefecto.calcularSiguienteApertura(fecha);
}

export {
  ZONA_HORARIA_INSTITUCIONAL,
  DIAS_SEMANA,
  ORDEN_DIAS_SEMANA,
  UNIDADES_TIEMPO_PERMITIDAS,
  LIMITES_TIEMPO_HORAS,
  METODOS_REPOSITORIO_CONFIGURACION,
  calcularEquivalenciaHoras,
  crearConfiguracionInicial,
  clonarConfiguracion,
  implementaRepositorioConfiguracion,
  validarConfiguracionMensajes,
  convertirHoraAMinutos,
  RepositorioConfiguracionMemoria,
  RepositorioConfiguracionPostgres,
  crearInterfazLecturaConfiguracion,
  evaluarHorarioPermitido,
  calcularSiguienteAperturaDesdeConfig,
  obtenerPartesEnZonaHoraria,
  construirFechaEnZonaHoraria,
  ObtenerConfiguracionCasoUso,
  GuardarConfiguracionCasoUso,
  MensajesConfiguracionControlador,
  crearEnrutadorMensajes,
};
