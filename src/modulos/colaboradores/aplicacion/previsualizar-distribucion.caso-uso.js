/**
 * Caso de Uso: Vista previa de la distribución para el paso 3 del registro (HU6-17 / EQ-64)
 *
 * Muestra, ANTES de confirmar, qué aspirantes recibirá el colaborador nuevo:
 * por carrera, cuántos son y quién los atiende hoy; y cómo cambia la carga de cada
 * colaborador afectado (antes → después). No modifica nada.
 *
 * Valida con las mismas reglas y códigos que la confirmación (EQ-59).
 */
import { ErrorColaboradores } from "../dominio/errores.js";
import { validarIdInstitucional, validarSolicitudRegistro } from "../dominio/validaciones-registro.js";

export class PrevisualizarDistribucionCasoUso {
  /**
   * @param {Object} dependencias
   * @param {Object} dependencias.repositorioColaboradores
   * @param {import('./consultar-colaborador.caso-uso.js').ConsultarColaboradorCasoUso} dependencias.consultarColaborador
   * @param {Object} dependencias.cartera - moduloMonitoreo.cartera
   * @param {Object} dependencias.catalogo
   * @param {Object} dependencias.proveedorAutenticacion
   */
  constructor({ repositorioColaboradores, consultarColaborador, cartera, catalogo, proveedorAutenticacion }) {
    this.repositorio = repositorioColaboradores;
    this.consultar = consultarColaborador;
    this.cartera = cartera;
    this.catalogo = catalogo;
    this.proveedor = proveedorAutenticacion;
  }

  async _nombre(id) {
    try {
      return (await this.proveedor.obtenerPorIdInstitucional(id))?.nombreCompleto ?? null;
    } catch {
      return null;
    }
  }

  /**
   * @param {{ idInstitucional: string, campus: string, carreras: string[] }} solicitud
   */
  async ejecutar(solicitud = {}) {
    const id = validarIdInstitucional(solicitud.idInstitucional);
    if (await this.repositorio.existe(id)) {
      throw new ErrorColaboradores(409, "YA_REGISTRADO", "Este colaborador ya está registrado.");
    }
    const { campus, carreras } = validarSolicitudRegistro(solicitud, this.catalogo);
    const perfil = await this.consultar.buscarEnDirectorio(id);

    const [afectados, conteo] = await Promise.all([
      this.cartera.previsualizarAsignacion({ campus, carreras }),
      this.cartera.contarPorColaborador(),
    ]);

    // Por carrera: total y responsables actuales.
    const porCarrera = new Map(carreras.map((c) => [c, { carrera: c, totalAspirantes: 0, sinResponsable: 0, responsables: new Map() }]));
    const transferidosPorColaborador = new Map();
    for (const a of afectados) {
      const grupo = porCarrera.get(a.carrera);
      if (!grupo) continue;
      grupo.totalAspirantes += 1;
      if (!a.colaboradorActual) {
        grupo.sinResponsable += 1;
        continue;
      }
      if (a.colaboradorActual === id) continue;
      grupo.responsables.set(a.colaboradorActual, (grupo.responsables.get(a.colaboradorActual) ?? 0) + 1);
      transferidosPorColaborador.set(
        a.colaboradorActual,
        (transferidosPorColaborador.get(a.colaboradorActual) ?? 0) + 1
      );
    }

    const nombres = new Map(
      await Promise.all([...transferidosPorColaborador.keys()].map(async (c) => [c, await this._nombre(c)]))
    );

    const detalleCarreras = [...porCarrera.values()].map((g) => ({
      carrera: g.carrera,
      totalAspirantes: g.totalAspirantes,
      sinResponsable: g.sinResponsable,
      responsablesActuales: [...g.responsables]
        .map(([colaboradorId, aspirantes]) => ({ colaboradorId, nombreCompleto: nombres.get(colaboradorId) ?? null, aspirantes }))
        .sort((a, b) => b.aspirantes - a.aspirantes || a.colaboradorId.localeCompare(b.colaboradorId)),
    }));

    const totalAspirantes = afectados.length;
    const cargaNuevoAntes = conteo[id] ?? 0;
    const cargas = [
      {
        colaboradorId: id,
        nombreCompleto: perfil.nombreCompleto,
        esNuevo: true,
        antes: cargaNuevoAntes,
        despues: cargaNuevoAntes + afectados.filter((a) => a.colaboradorActual !== id).length,
      },
      ...[...transferidosPorColaborador]
        .map(([colaboradorId, salen]) => ({
          colaboradorId,
          nombreCompleto: nombres.get(colaboradorId) ?? null,
          esNuevo: false,
          antes: conteo[colaboradorId] ?? salen,
          despues: (conteo[colaboradorId] ?? salen) - salen,
        }))
        .sort((a, b) => b.antes - a.antes || a.colaboradorId.localeCompare(b.colaboradorId)),
    ];

    return {
      colaborador: perfil,
      campus,
      carreras: detalleCarreras,
      totalAspirantes,
      cargas,
    };
  }
}
