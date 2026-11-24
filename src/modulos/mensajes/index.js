/**
 * Módulo de Negocio: Mensajes
 * Punto de entrada público, inyección de dependencias, bitácora, eventos e interfaz pública
 * de lectura de la configuración del envío de mensajes automáticos
 * (HU 9: EQ-104, EQ-105, EQ-106, EQ-107, EQ-108).
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
  clonarRegistroBitacora,
  implementaRepositorioConfiguracion,
} from "./dominio/repositorio-configuracion.js";
import {
  validarConfiguracionMensajes,
  convertirHoraAMinutos,
} from "./dominio/validador-configuracion.js";
import {
  EXCHANGE_EVENTOS,
  TIPO_CONFIGURACION_ACTUALIZADA,
  VERSION_EVENTO,
  crearEventoConfiguracionActualizada,
  validarEventoConfiguracionActualizada,
} from "./eventos.js";
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
import { ListarBitacoraConfiguracionCasoUso } from "./aplicacion/listar-bitacora-configuracion.caso-uso.js";
import { MensajesConfiguracionControlador } from "./infraestructura/controlador-configuracion.js";
import { crearEnrutadorMensajes } from "./rutas.js";

/**
 * Crea una instancia completa del módulo de Mensajes con sus casos de uso,
 * controlador HTTP, enrutador, bitácora, publicación de eventos e interfaz
 * pública de lectura (EQ-104 a EQ-108).
 *
 * @param {Object} [opciones]
 * @param {Object} [opciones.repositorio]
 * @param {Object} [opciones.configuracionInicial]
 * @param {Array} [opciones.bitacoraInicial]
 * @param {() => Date} [opciones.reloj]
 * @param {() => string} [opciones.generarId]
 * @param {Object} [opciones.servicioBitacora]
 * @param {Object} [opciones.busEventos]
 */
export function crearModuloMensajes(opciones = {}) {
  const repositorio =
    opciones.repositorio ||
    new RepositorioConfiguracionMemoria({
      configuracionInicial: opciones.configuracionInicial,
      bitacoraInicial: opciones.bitacoraInicial,
      generarId: opciones.generarId,
    });

  const busEventos = opciones.busEventos || opciones.bus || null;

  const interfazLectura = crearInterfazLecturaConfiguracion({
    repositorioConfiguracion: repositorio,
    busEventos,
  });

  const obtenerConfiguracionCasoUso = new ObtenerConfiguracionCasoUso({
    repositorioConfiguracion: repositorio,
  });

  const guardarConfiguracionCasoUso = new GuardarConfiguracionCasoUso({
    repositorioConfiguracion: repositorio,
    interfazLectura,
    reloj: opciones.reloj,
    generarId: opciones.generarId,
    servicioBitacora: opciones.servicioBitacora || null,
    busEventos,
  });

  const listarBitacoraConfiguracionCasoUso = new ListarBitacoraConfiguracionCasoUso({
    repositorioConfiguracion: repositorio,
    servicioBitacora: opciones.servicioBitacora || null,
  });

  const controlador = new MensajesConfiguracionControlador({
    obtenerConfiguracionCasoUso,
    guardarConfiguracionCasoUso,
    listarBitacoraConfiguracionCasoUso,
  });

  const enrutador = crearEnrutadorMensajes({ controlador });

  return {
    repositorio,
    busEventos,
    interfazLectura,
    obtenerConfiguracionVigente: interfazLectura.obtenerConfiguracionVigente,
    estaDentroDeHorarioPermitido: interfazLectura.estaDentroDeHorarioPermitido,
    calcularSiguienteApertura: interfazLectura.calcularSiguienteApertura,
    obtenerConfiguracionCasoUso,
    guardarConfiguracionCasoUso,
    listarBitacoraConfiguracionCasoUso,
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
  clonarRegistroBitacora,
  implementaRepositorioConfiguracion,
  validarConfiguracionMensajes,
  convertirHoraAMinutos,
  EXCHANGE_EVENTOS,
  TIPO_CONFIGURACION_ACTUALIZADA,
  VERSION_EVENTO,
  crearEventoConfiguracionActualizada,
  validarEventoConfiguracionActualizada,
  RepositorioConfiguracionMemoria,
  RepositorioConfiguracionPostgres,
  crearInterfazLecturaConfiguracion,
  evaluarHorarioPermitido,
  calcularSiguienteAperturaDesdeConfig,
  obtenerPartesEnZonaHoraria,
  construirFechaEnZonaHoraria,
  ObtenerConfiguracionCasoUso,
  GuardarConfiguracionCasoUso,
  ListarBitacoraConfiguracionCasoUso,
  MensajesConfiguracionControlador,
  crearEnrutadorMensajes,
};
