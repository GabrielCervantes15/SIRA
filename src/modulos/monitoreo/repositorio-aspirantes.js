/**
 * Repositorio SIMULADO del esquema Aspirantes (en memoria).
 *
 * Hace dos cosas:
 *   1. Guarda los aspirantes, su estado de la solicitud y su historial.
 *   2. Es el CONSUMIDOR del evento de Registro Escolar y sigue las reglas de
 *      docs/contratos/registro-escolar.md: valida el evento, ignora repetidos y
 *      no deja que un evento viejo sobrescriba un estado más nuevo.
 *
 * Cuando exista PostgreSQL se reemplaza por una implementación con la misma forma.
 */
import { ESTADOS_SOLICITUD as E } from "../registro-escolar/estados.js";
import { validarEventoEstadoCambiado } from "../registro-escolar/eventos.js";
import { TIPOS_ACTIVIDAD } from "./textos.js";

/**
 * @param {Object} datos
 * @param {any[]} datos.aspirantes
 * @param {any[]} datos.actividades
 * @param {Array<{ aspiranteId: string, estado: string, fechaActualizacion: string }>} datos.estados
 *   Estado de la solicitud de cada aspirante (lo entrega Registro Escolar).
 */
export function crearRepositorioAspirantes({ aspirantes, actividades, estados }) {
  const estadoPorAspirante = new Map(estados.map((e) => [e.aspiranteId, e]));
  const registros = new Map();
  const actividadesPorAspirante = new Map();
  const eventosProcesados = new Set();

  for (const a of aspirantes) {
    const estado = estadoPorAspirante.get(a.id);
    if (!estado) throw new Error(`Falta el estado de la solicitud de ${a.id}.`);
    registros.set(a.id, {
      datos: { ...a },
      estado: estado.estado,
      fechaEstado: Date.parse(estado.fechaActualizacion),
    });
    actividadesPorAspirante.set(a.id, []);
  }
  for (const act of actividades) {
    if (!actividadesPorAspirante.has(act.aspiranteId)) continue;
    actividadesPorAspirante.get(act.aspiranteId).push({ ...act });
  }

  function vista(registro) {
    const lista = actividadesPorAspirante.get(registro.datos.id);
    const contactoIniciado = lista.some(
      (a) => a.tipo === TIPOS_ACTIVIDAD.MENSAJE_ENVIADO && a.origen === "colaborador",
    );
    const ultimaActividad = lista.reduce(
      (max, a) => (max === null || Date.parse(a.fecha) > Date.parse(max) ? a.fecha : max),
      /** @type {string | null} */ (null),
    );
    return { ...registro.datos, estado: registro.estado, contactoIniciado, ultimaActividad };
  }

  /** Qué se agrega al historial cuando cambia el estado. */
  function actividadDesdeCambio(datos, eventId) {
    if (datos.estadoNuevo === E.EN_REVISION) {
      return { id: `act-ev-${eventId}`, aspiranteId: datos.aspiranteId, tipo: TIPOS_ACTIVIDAD.CONSTANCIA_ENTREGADA, fecha: datos.fechaCambio };
    }
    if (datos.estadoNuevo === E.CONSTANCIA_RECHAZADA || datos.estadoNuevo === E.RECHAZADA) {
      return {
        id: `act-ev-${eventId}`,
        aspiranteId: datos.aspiranteId,
        tipo: TIPOS_ACTIVIDAD.RECHAZO,
        fecha: datos.fechaCambio,
        objeto: datos.estadoNuevo === E.RECHAZADA ? "solicitud" : "constancia",
        motivo: datos.motivoRechazo,
      };
    }
    return null;
  }

  return {
    todos() {
      return [...registros.values()].map(vista);
    },

    obtener(id) {
      const registro = registros.get(id);
      return registro ? vista(registro) : null;
    },

    actividadesDe(id) {
      return (actividadesPorAspirante.get(id) ?? []).map((a) => ({ ...a }));
    },

    /**
     * Consume un evento registro_escolar.solicitud.estado_cambiado.
     * @param {any} evento
     * @returns {{ aplicado: boolean, motivo?: string }}
     */
    aplicarCambioEstado(evento) {
      const { valido, errores } = validarEventoEstadoCambiado(evento);
      if (!valido) return { aplicado: false, motivo: `evento inválido: ${errores.join(" ")}` };
      if (eventosProcesados.has(evento.eventId)) return { aplicado: false, motivo: "evento repetido" };

      const datos = evento.datos;
      const registro = registros.get(datos.aspiranteId);
      if (!registro) return { aplicado: false, motivo: `aspirante desconocido (${datos.aspiranteId})` };

      eventosProcesados.add(evento.eventId);

      // Un evento más viejo que el estado guardado entra al historial, pero no lo sobrescribe.
      const fechaCambio = Date.parse(datos.fechaCambio);
      if (fechaCambio >= registro.fechaEstado) {
        registro.estado = datos.estadoNuevo;
        registro.fechaEstado = fechaCambio;
      }

      const actividad = actividadDesdeCambio(datos, evento.eventId);
      if (actividad) actividadesPorAspirante.get(datos.aspiranteId).push(actividad);
      return { aplicado: true };
    },
  };
}
