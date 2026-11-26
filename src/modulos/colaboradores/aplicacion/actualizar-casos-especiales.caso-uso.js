/**
 * Caso de uso EQ-70: habilitar o deshabilitar la recepción de expedientes de otros campus.
 * La modificación es administrativa; la autorización HTTP se aplica en servidor.js.
 */
import { ErrorColaboradores } from "../dominio/errores.js";
import { validarIdInstitucional } from "../dominio/validaciones-registro.js";

export class ActualizarCasosEspecialesCasoUso {
  /** @param {{ repositorioColaboradores: Object }} dependencias */
  constructor({ repositorioColaboradores }) {
    this.repositorio = repositorioColaboradores;
  }

  /**
   * @param {string} idCrudo
   * @param {boolean} casosEspeciales
   */
  async ejecutar(idCrudo, casosEspeciales) {
    const idInstitucional = validarIdInstitucional(idCrudo);
    if (typeof casosEspeciales !== "boolean") {
      throw new ErrorColaboradores(
        400,
        "CASOS_ESPECIALES_INVALIDO",
        "casosEspeciales debe ser un valor booleano (true o false)."
      );
    }

    const colaborador = await this.repositorio.actualizarCasosEspeciales(
      idInstitucional,
      casosEspeciales
    );
    if (!colaborador) {
      throw new ErrorColaboradores(
        404,
        "COLABORADOR_NO_ENCONTRADO",
        "No se encontró un colaborador registrado con ese ID."
      );
    }

    return {
      actualizado: true,
      colaborador: {
        idInstitucional: colaborador.idInstitucional,
        casosEspeciales: colaborador.casosEspeciales === true,
      },
    };
  }
}
