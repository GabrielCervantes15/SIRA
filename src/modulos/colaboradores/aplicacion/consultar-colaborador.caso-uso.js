/**
 * Caso de Uso: Consultar los datos del colaborador por ID vía el directorio (HU6-5 / EQ-55)
 *
 * Paso 1 del registro. Reglas, en este orden:
 *   400 ID_INVALIDO            el ID no es numérico de 5 a 20 dígitos,
 *   409 YA_REGISTRADO          el ID ya está registrado en SIRA (activo o inactivo),
 *   503 SERVICIO_NO_DISPONIBLE el directorio institucional no responde,
 *   404 ID_NO_ENCONTRADO       el directorio no conoce ese ID.
 *
 * Solo devuelve datos de lectura (nombre, correo, teléfono, foto). Nunca credenciales.
 */
import { ErrorAutenticacion } from "../../autenticacion/index.js";
import { ErrorColaboradores } from "../dominio/errores.js";
import { validarIdInstitucional } from "../dominio/validaciones-registro.js";

/**
 * @param {Object} perfil - PerfilColaborador del proveedor de Autenticación.
 */
export function perfilPublico(perfil) {
  return {
    idInstitucional: perfil.idInstitucional,
    nombreCompleto: perfil.nombreCompleto,
    correoInstitucional: perfil.correoInstitucional ?? null,
    telefono: perfil.telefono ?? null,
    fotoUrl: perfil.fotoUrl ?? null,
  };
}

export class ConsultarColaboradorCasoUso {
  /**
   * @param {Object} dependencias
   * @param {import('../../autenticacion/interfaz.js').IProveedorAutenticacion} dependencias.proveedorAutenticacion
   * @param {Object} dependencias.repositorioColaboradores
   */
  constructor({ proveedorAutenticacion, repositorioColaboradores }) {
    if (!proveedorAutenticacion) throw new Error("Se requiere proveedorAutenticacion.");
    if (!repositorioColaboradores) throw new Error("Se requiere repositorioColaboradores.");
    this.proveedor = proveedorAutenticacion;
    this.repositorio = repositorioColaboradores;
  }

  /**
   * Busca el perfil en el directorio sin revisar duplicados (lo reutiliza la confirmación).
   * @param {string} idInstitucional - ID ya validado.
   */
  async buscarEnDirectorio(idInstitucional) {
    let perfil;
    try {
      perfil = await this.proveedor.obtenerPorIdInstitucional(idInstitucional);
    } catch (error) {
      if (error instanceof ErrorAutenticacion && error.codigo === "SERVICIO_NO_DISPONIBLE") {
        throw new ErrorColaboradores(503, "SERVICIO_NO_DISPONIBLE", "El directorio institucional no está disponible.");
      }
      throw error;
    }
    if (!perfil) {
      throw new ErrorColaboradores(404, "ID_NO_ENCONTRADO", "No se encontró un colaborador con ese ID.");
    }
    return perfilPublico(perfil);
  }

  /**
   * @param {unknown} idCrudo
   * @returns {Promise<{ perfil: ReturnType<typeof perfilPublico> }>}
   */
  async ejecutar(idCrudo) {
    let id;
    try {
      id = validarIdInstitucional(idCrudo);
    } catch {
      throw new ErrorColaboradores(400, "ID_INVALIDO", "Ingresa un ID institucional numérico válido.");
    }
    if (await this.repositorio.existe(id)) {
      throw new ErrorColaboradores(409, "YA_REGISTRADO", "Este colaborador ya está registrado.");
    }
    return { perfil: await this.buscarEnDirectorio(id) };
  }
}
