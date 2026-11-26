/**
 * Caso de Uso: vista previa de la baja de un colaborador (HU6-18 / HU7)
 *
 * Muestra, ANTES de confirmar, a quién se reasigna cada carrera de su cartera. No modifica nada.
 * Si algún campus no tiene otro colaborador activo, responde 409 SIN_COLABORADOR_RELEVO.
 */
import { construirPlanBaja } from "./plan-baja.js";

export class PrevisualizarBajaCasoUso {
  constructor({ repositorioColaboradores, cartera, proveedorAutenticacion }) {
    this.repositorio = repositorioColaboradores;
    this.cartera = cartera;
    this.proveedor = proveedorAutenticacion;
  }

  async _perfil(id) {
    try {
      return (await this.proveedor.obtenerPorIdInstitucional(id)) ?? null;
    } catch {
      return null; // directorio caído: la vista previa sale igual, sin datos personales
    }
  }

  async ejecutar({ idInstitucional } = {}) {
    const { saliente, resultado, aspirantesActuales } = await construirPlanBaja({
      repositorio: this.repositorio,
      cartera: this.cartera,
      idInstitucional,
    });
    const perfiles = new Map(
      await Promise.all([saliente.idInstitucional, ...resultado.receptores.map((r) => r.colaboradorId)].map(async (id) => [id, await this._perfil(id)]))
    );
    const nombre = (id) => perfiles.get(id)?.nombreCompleto ?? null;

    return {
      colaborador: { idInstitucional: saliente.idInstitucional, nombreCompleto: nombre(saliente.idInstitucional), campus: saliente.campus },
      informacionActual: { campus: saliente.campus, aspirantes: aspirantesActuales, carreras: resultado.totalCarreras },
      distribucion: resultado.receptores.map((r) => ({
        colaboradorId: r.colaboradorId,
        nombreCompleto: nombre(r.colaboradorId),
        fotoUrl: perfiles.get(r.colaboradorId)?.fotoUrl ?? null,
        campus: r.campus,
        nuevosAspirantes: r.nuevosAspirantes,
        antes: r.antes,
        despues: r.despues,
        carreras: r.carreras,
      })),
      totalAspirantes: resultado.totalAspirantes,
    };
  }
}
