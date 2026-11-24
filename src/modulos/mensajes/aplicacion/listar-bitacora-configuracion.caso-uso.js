/**
 * Caso de Uso: Listar Bitácora de Cambios de Configuración de Mensajes Automáticos
 * Tarea: EQ-108 · HU9-7 (Sprint 2)
 */

export class ListarBitacoraConfiguracionCasoUso {
  /**
   * @param {Object} dependencias
   * @param {import('../dominio/repositorio-configuracion.js')} dependencias.repositorioConfiguracion
   * @param {Object|null} [dependencias.servicioBitacora]
   */
  constructor({ repositorioConfiguracion, servicioBitacora = null }) {
    if (!repositorioConfiguracion && !servicioBitacora) {
      throw new Error(
        "Se requiere repositorioConfiguracion o servicioBitacora para inicializar ListarBitacoraConfiguracionCasoUso."
      );
    }
    this.repositorio = repositorioConfiguracion;
    this.servicioBitacora = servicioBitacora;
  }

  /**
   * Consulta los registros de la bitácora de configuración ordenados del más reciente al más antiguo.
   * Restringida exclusivamente al rol 'administrador'.
   *
   * @param {{ usuario?: { idInstitucional?: string, rol?: string }|null, limite?: number|string, offset?: number|string }} [contexto]
   * @returns {Promise<{ registros: Array, total: number, limite: number, offset: number }>}
   */
  async ejecutar(contexto = {}) {
    const usuario = contexto?.usuario || null;

    if (!usuario || !usuario.idInstitucional) {
      const error = new Error(
        "Debes iniciar sesión para consultar la bitácora de configuración."
      );
      error.status = 401;
      error.codigo = "SESION_NO_VALIDA";
      throw error;
    }

    if (usuario.rol !== "administrador") {
      const error = new Error(
        "No tienes permisos para consultar la bitácora de configuración de mensajes."
      );
      error.status = 403;
      error.codigo = "SIN_PERMISO";
      throw error;
    }

    const limNum = parseInt(contexto.limite, 10);
    const limite = Number.isFinite(limNum) && limNum > 0 ? Math.min(limNum, 200) : 50;

    const offNum = parseInt(contexto.offset, 10);
    const offset = Number.isFinite(offNum) && offNum >= 0 ? offNum : 0;

    if (
      this.servicioBitacora &&
      typeof this.servicioBitacora.listarBitacora === "function"
    ) {
      return this.servicioBitacora.listarBitacora({ limite, offset });
    }

    if (typeof this.repositorio?.listarBitacora === "function") {
      return this.repositorio.listarBitacora({ limite, offset });
    }

    return { registros: [], total: 0, limite, offset };
  }
}
