/**
 * Adaptador simulado de Autenticación (EQ-12 · BASE-7).
 *
 * Implementa el puerto IProveedorAutenticacion en memoria con datos semilla.
 * Aísla al resto del sistema de Active Directory / Kerberos durante el Sprint 1.
 */
import { ErrorAutenticacion } from "./interfaz.js";

/**
 * @typedef {Object} UsuarioSemilla
 * @property {string} idInstitucional
 * @property {string} [password]
 * @property {string} nombreCompleto
 * @property {string} correoInstitucional
 * @property {string} telefono
 * @property {string} fotoUrl
 * @property {boolean} [activo]
 */

/**
 * @param {Object} [opciones]
 * @param {UsuarioSemilla[]} [opciones.usuarios]
 * @param {boolean} [opciones.indisponible]
 * @param {string} [opciones.contrasenaDefault]
 */
export function crearProveedorAutenticacionSimulado(opciones = {}) {
  let indisponible = Boolean(opciones.indisponible);
  const contrasenaDefault = opciones.contrasenaDefault || "Password123!";

  /** @type {Map<string, UsuarioSemilla>} */
  const usuariosPorId = new Map();

  function cargar(lista = []) {
    usuariosPorId.clear();
    for (const u of lista) {
      usuariosPorId.set(String(u.idInstitucional).trim(), {
        ...u,
        idInstitucional: String(u.idInstitucional).trim(),
        password: u.password || contrasenaDefault,
        activo: u.activo !== false,
      });
    }
  }

  cargar(opciones.usuarios || []);

  /**
   * Extrae el PerfilColaborador eliminando credenciales internas.
   * @param {UsuarioSemilla} u
   * @returns {import("./interfaz.js").PerfilColaborador}
   */
  function mapearPerfil(u) {
    return {
      idInstitucional: u.idInstitucional,
      nombreCompleto: u.nombreCompleto,
      correoInstitucional: u.correoInstitucional,
      telefono: u.telefono,
      fotoUrl: u.fotoUrl,
    };
  }

  return {
    /**
     * Valida la identidad del colaborador.
     * @param {string} idInstitucional
     * @param {string} [password]
     * @returns {Promise<import("./interfaz.js").ResultadoAutenticacion>}
     */
    async autenticar(idInstitucional, password) {
      if (indisponible) {
        throw new ErrorAutenticacion(
          "SERVICIO_NO_DISPONIBLE",
          "El servicio de Active Directory no está disponible en este momento."
        );
      }

      if (!idInstitucional || typeof idInstitucional !== "string") {
        return {
          autenticado: false,
          colaborador: null,
          motivoFalla: "USUARIO_INEXISTENTE",
        };
      }

      const idLimpio = idInstitucional.trim();
      const usuario = usuariosPorId.get(idLimpio);

      if (!usuario) {
        return {
          autenticado: false,
          colaborador: null,
          motivoFalla: "USUARIO_INEXISTENTE",
        };
      }

      if (usuario.activo === false) {
        return {
          autenticado: false,
          colaborador: null,
          motivoFalla: "CUENTA_BLOQUEADA",
        };
      }

      // Si se provee contraseña, se valida
      if (password !== undefined && password !== usuario.password) {
        return {
          autenticado: false,
          colaborador: null,
          motivoFalla: "CREDENCIALES_INVALIDAS",
        };
      }

      return {
        autenticado: true,
        colaborador: mapearPerfil(usuario),
      };
    },

    /**
     * Consulta los datos institucionales de un colaborador por su ID (HU6-5).
     * @param {string} idInstitucional
     * @returns {Promise<import("./interfaz.js").PerfilColaborador|null>}
     */
    async obtenerPorIdInstitucional(idInstitucional) {
      if (indisponible) {
        throw new ErrorAutenticacion(
          "SERVICIO_NO_DISPONIBLE",
          "El servicio de Active Directory no está disponible en este momento."
        );
      }

      if (!idInstitucional || typeof idInstitucional !== "string") {
        return null;
      }

      const usuario = usuariosPorId.get(idInstitucional.trim());
      if (!usuario) {
        return null;
      }

      return mapearPerfil(usuario);
    },

    // ---------- Métodos auxiliares de prueba / desarrollo ----------

    /**
     * Alterna la simulación de caída del servicio Active Directory.
     * @param {boolean} valor
     */
    simularIndisponibilidad(valor) {
      indisponible = Boolean(valor);
    },

    /**
     * Registra dinámicamente un usuario simulado.
     * @param {UsuarioSemilla} usuario
     */
    agregarUsuario(usuario) {
      usuariosPorId.set(String(usuario.idInstitucional).trim(), {
        ...usuario,
        idInstitucional: String(usuario.idInstitucional).trim(),
        password: usuario.password || contrasenaDefault,
        activo: usuario.activo !== false,
      });
    },

    /**
     * Restablece la lista de usuarios.
     * @param {UsuarioSemilla[]} [nuevaLista]
     */
    reiniciar(nuevaLista = []) {
      cargar(nuevaLista);
      indisponible = false;
    },
  };
}

