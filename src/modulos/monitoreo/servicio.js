/**
 * Servicio del módulo Monitoreo (HU 2 y HU 3).
 *
 * Solo cubre lo necesario para la pantalla de monitoreo:
 *   - listar los aspirantes del colaborador, con semáforo, orden y paginación (HU2-4/6, parcial)
 *   - detalle de un aspirante (HU3-3)
 *   - historial de actividades (HU3-4)
 * Los filtros por carrera, preparatoria, período y estado quedan para HU2-4.
 */
import { esEstadoFinal } from "../registro-escolar/index.js";
import { SEVERIDAD, calcularSemaforo } from "./semaforo.js";
import { textoActividad, textoEstado } from "./textos.js";

export const TAMANO_PAGINA_POR_DEFECTO = 13;
export const COLUMNAS_ORDENABLES = Object.freeze([
  "semaforo",
  "nombre",
  "carrera",
  "preparatoria",
  "fechaSolicitud",
  "ultimaActividad",
]);

/** Error de negocio. El servidor lo traduce a 400, 403 o 404. */
export class ErrorMonitoreo extends Error {
  /** @param {"NO_ENCONTRADO" | "SIN_PERMISO" | "PARAMETRO_INVALIDO"} codigo */
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorMonitoreo";
    this.codigo = codigo;
  }
}

const comparar = (a, b) => a.localeCompare(b, "es", { sensitivity: "base" });

const CLAVES_DE_ORDEN = {
  semaforo: (a) => SEVERIDAD[a.semaforo.nivel],
  nombre: (a) => a.nombre,
  carrera: (a) => a.carrera,
  preparatoria: (a) => a.preparatoria,
  fechaSolicitud: (a) => Date.parse(a.fechaSolicitud),
  ultimaActividad: (a) => (a.ultimaActividad ? Date.parse(a.ultimaActividad) : null),
};

function crearComparador(ordenarPor, direccion) {
  const clave = CLAVES_DE_ORDEN[ordenarPor];
  const factor = direccion === "asc" ? 1 : -1;
  return (x, y) => {
    const vx = clave(x);
    const vy = clave(y);
    if (vx !== vy) {
      if (vx === null) return 1; // sin valor siempre al final
      if (vy === null) return -1;
      const c = typeof vx === "number" ? vx - vy : comparar(vx, vy);
      if (c !== 0) return c * factor;
    }
    return comparar(x.nombre, y.nombre) || x.id.localeCompare(y.id); // desempate estable
  };
}

/** @param {{ repositorio: ReturnType<typeof import("./repositorio-aspirantes.js").crearRepositorioAspirantes> }} deps */
export function crearServicioMonitoreo({ repositorio }) {
  function aspiranteDeLaCartera(colaboradorId, aspiranteId) {
    const aspirante = repositorio.obtener(aspiranteId);
    if (!aspirante) throw new ErrorMonitoreo("NO_ENCONTRADO", "No se encontró el aspirante.");
    if (aspirante.colaboradorId !== colaboradorId) {
      throw new ErrorMonitoreo("SIN_PERMISO", "El aspirante no pertenece a tu cartera.");
    }
    return aspirante;
  }

  function fechaOpcional(valor, nombre) {
    if (valor === undefined || valor === null || valor === "") return null;
    const ms = Date.parse(valor);
    if (Number.isNaN(ms)) throw new ErrorMonitoreo("PARAMETRO_INVALIDO", `${nombre} debe ser una fecha ISO 8601.`);
    return ms;
  }

  return {
    /**
     * @param {string} colaboradorId
     * @param {{ pagina?: number, tamano?: number, ordenarPor?: string, direccion?: string, incluirCerrados?: boolean }} [opciones]
     */
    listarAspirantes(colaboradorId, opciones = {}) {
      const {
        pagina = 1,
        tamano = TAMANO_PAGINA_POR_DEFECTO,
        ordenarPor = "semaforo",
        direccion = "desc",
        incluirCerrados = false,
      } = opciones;

      if (!Number.isInteger(pagina) || pagina < 1) {
        throw new ErrorMonitoreo("PARAMETRO_INVALIDO", "pagina debe ser un entero mayor o igual a 1.");
      }
      if (!Number.isInteger(tamano) || tamano < 1 || tamano > 100) {
        throw new ErrorMonitoreo("PARAMETRO_INVALIDO", "tamano debe ser un entero entre 1 y 100.");
      }
      if (!COLUMNAS_ORDENABLES.includes(ordenarPor)) {
        throw new ErrorMonitoreo("PARAMETRO_INVALIDO", `ordenarPor debe ser uno de: ${COLUMNAS_ORDENABLES.join(", ")}.`);
      }
      if (direccion !== "asc" && direccion !== "desc") {
        throw new ErrorMonitoreo("PARAMETRO_INVALIDO", "direccion debe ser asc o desc.");
      }

      let filas = repositorio
        .todos()
        .filter((a) => a.colaboradorId === colaboradorId)
        .filter((a) => incluirCerrados || !esEstadoFinal(a.estado))
        .map((a) => ({
          id: a.id,
          nombre: a.nombre,
          carrera: a.carrera,
          preparatoria: a.preparatoria,
          fechaSolicitud: a.fechaSolicitud,
          ultimaActividad: a.ultimaActividad,
          semaforo: calcularSemaforo(a),
        }));

      filas.sort(crearComparador(ordenarPor, direccion));

      const totalResultados = filas.length;
      const totalPaginas = Math.ceil(totalResultados / tamano);
      const paginaActual = Math.min(pagina, Math.max(totalPaginas, 1));
      const inicio = (paginaActual - 1) * tamano;

      return {
        datos: filas.slice(inicio, inicio + tamano),
        paginacion: { pagina: paginaActual, tamano, totalResultados, totalPaginas },
      };
    },

    obtenerDetalle(colaboradorId, aspiranteId) {
      const a = aspiranteDeLaCartera(colaboradorId, aspiranteId);
      return {
        id: a.id,
        nombre: a.nombre,
        carrera: a.carrera,
        preparatoria: a.preparatoria,
        fechaSolicitud: a.fechaSolicitud,
        telefono: a.telefono,
        correo: a.correo,
        estado: { codigo: a.estado, texto: textoEstado(a.estado) },
        semaforo: calcularSemaforo(a),
        contactoIniciado: a.contactoIniciado,
      };
    },

    /**
     * Historial del aspirante: del más reciente al más antiguo.
     * Con misma fecha y hora, desempata por id (también descendente) para que el orden sea estable.
     * @param {{ desde?: string, hasta?: string }} [rango]  Instantes ISO 8601, ambos incluidos.
     */
    obtenerActividades(colaboradorId, aspiranteId, { desde, hasta } = {}) {
      aspiranteDeLaCartera(colaboradorId, aspiranteId);
      const desdeMs = fechaOpcional(desde, "desde");
      const hastaMs = fechaOpcional(hasta, "hasta");
      if (desdeMs !== null && hastaMs !== null && desdeMs > hastaMs) {
        throw new ErrorMonitoreo("PARAMETRO_INVALIDO", "desde no puede ser posterior a hasta.");
      }

      const datos = repositorio
        .actividadesDe(aspiranteId)
        .filter((a) => {
          const ms = Date.parse(a.fecha);
          return (desdeMs === null || ms >= desdeMs) && (hastaMs === null || ms <= hastaMs);
        })
        .sort((x, y) => Date.parse(y.fecha) - Date.parse(x.fecha) || y.id.localeCompare(x.id))
        .map((a) => ({ id: a.id, tipo: a.tipo, fecha: a.fecha, texto: textoActividad(a) }));

      return { datos, total: datos.length };
    },
  };
}
