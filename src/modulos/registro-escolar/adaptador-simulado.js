/**
 * Adaptador SIMULADO de Registro Escolar (EQ-13 · BASE-8).
 *
 * Cumple la interfaz de ./interfaz.js con datos en memoria (datos semilla).
 * Además ofrece dos ayudas solo para desarrollo y demo, que NO forman parte del
 * contrato: simularCambioDeEstado y simularIndisponibilidad.
 */
import { randomUUID } from "node:crypto";
import { esEstadoValido } from "./estados.js";
import {
  TIPO_ESTADO_CAMBIADO,
  crearEventoEstadoCambiado,
  validarEventoEstadoCambiado,
} from "./eventos.js";
import { ErrorRegistroEscolar } from "./interfaz.js";

/**
 * @param {Object} [opciones]
 * @param {import("./interfaz.js").EstadoSolicitud[]} [opciones.solicitudes]  Estado actual por aspirante.
 * @param {import("./interfaz.js").CambioEstado[]} [opciones.cambios]         Historial de cambios.
 * @param {{ publicar: (routingKey: string, evento: any) => Promise<void> } | null} [opciones.bus]
 * @param {() => Date} [opciones.ahora]
 * @param {() => string} [opciones.generarId]
 */
export function crearRegistroEscolarSimulado({
  solicitudes = [],
  cambios = [],
  bus = null,
  ahora = () => new Date(),
  generarId = randomUUID,
} = {}) {
  const estados = new Map(solicitudes.map((s) => [s.aspiranteId, { ...s }]));
  const historial = cambios.map((c) => ({ ...c }));
  let disponible = true;

  function exigirDisponible() {
    if (!disponible) {
      throw new ErrorRegistroEscolar(
        "NO_DISPONIBLE",
        "Registro Escolar no está disponible (simulado).",
      );
    }
  }

  return {
    // ---- Contrato (interfaz.js) ----

    async obtenerEstadoSolicitud(aspiranteId) {
      exigirDisponible();
      const solicitud = estados.get(aspiranteId);
      return solicitud ? { ...solicitud } : null;
    },

    async obtenerCambiosDesde(desde) {
      exigirDisponible();
      const limite = Date.parse(desde);
      if (Number.isNaN(limite)) {
        throw new TypeError("desde debe ser una fecha ISO 8601.");
      }
      return historial
        .filter((c) => Date.parse(c.fechaCambio) >= limite)
        .sort((a, b) => Date.parse(a.fechaCambio) - Date.parse(b.fechaCambio))
        .map((c) => ({ ...c }));
    },

    // ---- Solo simulación (no forman parte del contrato) ----

    /**
     * Cambia el estado de un aspirante, lo agrega al historial y publica el
     * evento en el bus (si hay uno). No modifica nada si el cambio es inválido.
     * @param {{ aspiranteId: string, estadoNuevo: string, motivoRechazo?: string | null }} datos
     */
    async simularCambioDeEstado({ aspiranteId, estadoNuevo, motivoRechazo = null }) {
      const actual = estados.get(aspiranteId);
      if (!actual) throw new Error(`Aspirante desconocido: ${aspiranteId}`);
      if (!esEstadoValido(estadoNuevo)) {
        throw new Error(`Estado inválido: ${estadoNuevo}`);
      }
      if (estadoNuevo === actual.estado) {
        throw new Error("El estado nuevo es igual al actual: no se emite evento.");
      }

      const fechaCambio = ahora().toISOString();
      const cambio = {
        aspiranteId,
        estadoAnterior: actual.estado,
        estadoNuevo,
        fechaCambio,
        motivoRechazo,
      };
      const evento = crearEventoEstadoCambiado(cambio, { ahora, generarId });
      const { valido, errores } = validarEventoEstadoCambiado(evento);
      if (!valido) throw new Error(`Cambio inválido: ${errores.join(" ")}`);

      estados.set(aspiranteId, {
        aspiranteId,
        estado: estadoNuevo,
        fechaActualizacion: fechaCambio,
      });
      historial.push(cambio);
      if (bus) await bus.publicar(TIPO_ESTADO_CAMBIADO, evento);
      return evento;
    },

    /** Simula que la API de Registro Escolar no responde. */
    simularIndisponibilidad(valor = true) {
      disponible = !valor;
    },
  };
}
