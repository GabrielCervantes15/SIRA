/**
 * Caso de Uso: Listado de colaboradores por campus (HU6-12 / EQ-71)
 *
 * Junta tres fuentes sin cruzar esquemas:
 *   - usuarios (este módulo): rol, estado, campus, carreras, fecha de registro;
 *   - directorio institucional (Autenticación): nombre, correo, teléfono, foto;
 *   - cartera (módulo Monitoreo): cuántos aspirantes tiene cada colaborador.
 *
 * Filtros opcionales: campus, incluirInactivos y búsqueda por nombre (sin acentos ni
 * mayúsculas). Orden: nombre ascendente; si no hay nombre, por ID.
 * Si el directorio no responde, el listado sale igual con los datos personales en null.
 */
import { ErrorColaboradores } from "../dominio/errores.js";
import { perfilPublico } from "./consultar-colaborador.caso-uso.js";

export function normalizarBusqueda(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export class ListarColaboradoresCasoUso {
  /**
   * @param {Object} dependencias
   * @param {Object} dependencias.repositorioColaboradores
   * @param {Object} dependencias.proveedorAutenticacion
   * @param {{ contarPorColaborador(): Promise<Record<string, number>> }} dependencias.cartera
   * @param {{ listarCampus(): string[], contieneCampus(c: string): boolean }} dependencias.catalogo
   */
  constructor({ repositorioColaboradores, proveedorAutenticacion, cartera, catalogo }) {
    this.repositorio = repositorioColaboradores;
    this.proveedor = proveedorAutenticacion;
    this.cartera = cartera;
    this.catalogo = catalogo;
  }

  async _perfil(id) {
    try {
      const perfil = await this.proveedor.obtenerPorIdInstitucional(id);
      return perfil ? perfilPublico(perfil) : null;
    } catch {
      return null; // directorio caído: no se bloquea el listado
    }
  }

  /**
   * @param {{ campus?: string, incluirInactivos?: boolean|string, busqueda?: string }} [params]
   */
  async ejecutar({ campus, incluirInactivos = false, busqueda = "" } = {}) {
    const campusLimpio = typeof campus === "string" ? campus.trim() : "";
    if (campusLimpio && !this.catalogo.contieneCampus(campusLimpio)) {
      throw new ErrorColaboradores(400, "CAMPUS_INVALIDO", "El campus seleccionado no está disponible.");
    }
    const inactivos = incluirInactivos === true || incluirInactivos === "true" || incluirInactivos === "1";

    const [registros, conteo] = await Promise.all([
      this.repositorio.listar({ campus: campusLimpio || undefined, incluirInactivos: inactivos }),
      this.cartera.contarPorColaborador(),
    ]);

    const colaboradores = await Promise.all(
      registros.map(async (c) => {
        const perfil = await this._perfil(c.idInstitucional);
        return {
          idInstitucional: c.idInstitucional,
          nombreCompleto: perfil?.nombreCompleto ?? null,
          correoInstitucional: perfil?.correoInstitucional ?? null,
          telefono: perfil?.telefono ?? null,
          fotoUrl: perfil?.fotoUrl ?? null,
          campus: c.campus,
          carreras: [...c.carreras],
          activo: c.estado === "activo",
          casosEspeciales: c.casosEspeciales === true,
          bajaDesde: c.bajaDesde ?? null,
          bajaHasta: c.bajaHasta ?? null,
          periodoBaja:
            c.estado === "activo"
              ? null
              : { indefinido: !c.bajaHasta, desde: c.bajaDesde ?? null, hasta: c.bajaHasta ?? null },
          fechaRegistro: c.fechaRegistro,
          totalAspirantes: conteo[c.idInstitucional] ?? 0,
        };
      })
    );

    const termino = normalizarBusqueda(busqueda);
    const filtrados = colaboradores
      .filter((c) => !termino || normalizarBusqueda(c.nombreCompleto ?? c.idInstitucional).includes(termino))
      .sort(
        (a, b) =>
          normalizarBusqueda(a.nombreCompleto ?? "~").localeCompare(normalizarBusqueda(b.nombreCompleto ?? "~"), "es") ||
          a.idInstitucional.localeCompare(b.idInstitucional)
      );

    return {
      colaboradores: filtrados,
      total: filtrados.length,
      campus: this.catalogo.listarCampus(),
    };
  }
}
