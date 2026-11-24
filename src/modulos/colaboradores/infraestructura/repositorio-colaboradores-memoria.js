/**
 * Repositorio de Colaboradores en memoria (Sprint 1).
 * Replica el esquema `usuarios` de BASE-5 / EQ-53 (usuario + colaborador_carrera).
 *
 * `transaccion(fn)` toma una instantánea antes de ejecutar `fn` y la restaura si
 * `fn` falla, para que la confirmación del registro (EQ-59) sea todo o nada igual
 * que con BEGIN / COMMIT / ROLLBACK en PostgreSQL.
 */
import { ErrorColaboradores } from "../dominio/errores.js";

function copiar(colaborador) {
  return { ...colaborador, carreras: [...(colaborador.carreras ?? [])] };
}

export class RepositorioColaboradoresMemoria {
  /**
   * @param {Object} [opciones]
   * @param {Array<Partial<import('../dominio/repositorio-colaboradores.js').Colaborador>>} [opciones.colaboradores]
   */
  constructor({ colaboradores = [] } = {}) {
    /** @type {Map<string, import('../dominio/repositorio-colaboradores.js').Colaborador>} */
    this.colaboradores = new Map();
    for (const c of colaboradores) {
      const id = String(c.idInstitucional ?? "").trim();
      if (!id) continue;
      this.colaboradores.set(id, {
        idInstitucional: id,
        rol: c.rol ?? "colaborador",
        estado: c.estado ?? (c.activo === false ? "inactivo" : "activo"),
        campus: c.campus ?? null,
        carreras: [...(c.carreras ?? [])],
        fechaRegistro: c.fechaRegistro ?? new Date(0).toISOString(),
        registradoPor: c.registradoPor ?? null,
      });
    }
    /** @type {import('../dominio/repositorio-colaboradores.js').RegistroTransferencia[]} */
    this.bitacoraTransferencias = [];
    this._cola = Promise.resolve();
  }

  /**
   * @param {import('../dominio/repositorio-colaboradores.js').FiltroColaboradores} [filtro]
   */
  async listar({ campus, incluirInactivos = false } = {}) {
    return [...this.colaboradores.values()]
      .filter((c) => c.rol === "colaborador")
      .filter((c) => incluirInactivos || c.estado === "activo")
      .filter((c) => !campus || c.campus === campus)
      .map(copiar);
  }

  async obtenerPorId(idInstitucional) {
    const c = this.colaboradores.get(String(idInstitucional ?? "").trim());
    return c ? copiar(c) : null;
  }

  async existe(idInstitucional) {
    return this.colaboradores.has(String(idInstitucional ?? "").trim());
  }

  async guardar(colaborador) {
    const id = String(colaborador.idInstitucional).trim();
    if (this.colaboradores.has(id)) {
      throw new ErrorColaboradores(409, "YA_REGISTRADO", "Este colaborador ya está registrado.");
    }
    const registro = copiar({ ...colaborador, idInstitucional: id });
    this.colaboradores.set(id, registro);
    return copiar(registro);
  }

  /**
   * @param {import('../dominio/repositorio-colaboradores.js').RegistroTransferencia[]} registros
   */
  async registrarTransferencias(registros = []) {
    const ahora = new Date().toISOString();
    for (const r of registros) {
      if (!r.aspiranteId || !r.colaboradorDestino) {
        throw new Error("Cada transferencia requiere aspiranteId y colaboradorDestino.");
      }
      this.bitacoraTransferencias.push({ realizadoEn: ahora, ...r });
    }
  }

  /**
   * @template T
   * @param {(repositorio: RepositorioColaboradoresMemoria) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async transaccion(fn) {
    // Las transacciones se ejecutan una tras otra (como un bloqueo de fila), así dos
    // confirmaciones simultáneas del mismo ID no pueden pasar ambas la validación.
    const turno = this._cola.then(async () => {
      const instantanea = new Map([...this.colaboradores].map(([id, c]) => [id, copiar(c)]));
      const largoBitacora = this.bitacoraTransferencias.length;
      try {
        return await fn(this);
      } catch (error) {
        this.colaboradores = instantanea;
        this.bitacoraTransferencias.length = largoBitacora;
        throw error;
      }
    });
    this._cola = turno.catch(() => {});
    return turno;
  }
}
