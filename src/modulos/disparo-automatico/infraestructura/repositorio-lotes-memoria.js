/**
 * HU1-7 (EQ-83) · Repositorio de lotes en memoria (desarrollo y pruebas).
 *
 * `transaccion(fn)` se ejecuta en cola (una tras otra, como un bloqueo) y toma una
 * instantánea: si `fn` falla, los lotes y envíos vuelven a como estaban.
 */
const copiar = (valor) => structuredClone(valor);

export class RepositorioLotesMemoria {
  constructor() {
    /** @type {Map<string, { lote: Object, envios: Object[] }>} */
    this.lotes = new Map();
    this._cola = Promise.resolve();
  }

  async transaccion(fn) {
    const turno = this._cola.then(async () => {
      const instantanea = new Map([...this.lotes].map(([id, r]) => [id, copiar(r)]));
      try {
        return await fn(this);
      } catch (error) {
        this.lotes = instantanea;
        throw error;
      }
    });
    this._cola = turno.catch(() => {});
    return turno;
  }

  /** La cola de `transaccion` ya ejecuta una a la vez. */
  async bloquearColaborador() {}

  async buscarPorClave(colaboradorId, clave) {
    for (const r of this.lotes.values()) {
      if (r.lote.colaboradorId === String(colaboradorId) && r.lote.claveIdempotencia === clave) return copiar(r);
    }
    return null;
  }

  async buscarRecientePorHuella(colaboradorId, huella, desdeIso) {
    const desde = Date.parse(desdeIso);
    const candidatos = [...this.lotes.values()]
      .filter((r) => r.lote.colaboradorId === String(colaboradorId) && r.lote.huella === huella
        && Date.parse(r.lote.creadoEn) >= desde)
      .sort((a, b) => Date.parse(b.lote.creadoEn) - Date.parse(a.lote.creadoEn));
    return candidatos[0] ? copiar(candidatos[0]) : null;
  }

  async guardarLote({ lote, envios }) {
    if (this.lotes.has(lote.id)) throw new Error(`El lote ${lote.id} ya existe.`);
    if (lote.claveIdempotencia && await this.buscarPorClave(lote.colaboradorId, lote.claveIdempotencia)) {
      throw new Error("Ya existe un lote con esa clave de idempotencia.");
    }
    this.lotes.set(lote.id, copiar({ lote, envios }));
  }

  async reclamarPendientes(loteId, ahoraIso, hastaIso) {
    const r = this.lotes.get(loteId);
    if (!r) return [];
    const ahora = Date.parse(ahoraIso);
    const reclamados = r.envios.filter((e) => e.estado === "PENDIENTE" && !e.publicadoEn
      && (!e.reclamadoHasta || Date.parse(e.reclamadoHasta) < ahora));
    for (const e of reclamados) e.reclamadoHasta = hastaIso;
    return reclamados.map(copiar);
  }

  async liberarReclamo(envioIds) {
    const ids = new Set(envioIds);
    for (const r of this.lotes.values()) {
      for (const e of r.envios) if (ids.has(e.id) && !e.publicadoEn) e.reclamadoHasta = null;
    }
  }

  async marcarPublicados(envioIds, fechaIso) {
    const ids = new Set(envioIds);
    for (const r of this.lotes.values()) {
      for (const e of r.envios) if (ids.has(e.id) && !e.publicadoEn) e.publicadoEn = fechaIso;
    }
  }

  async obtenerLote(loteId) {
    const r = this.lotes.get(loteId);
    return r ? copiar(r) : null;
  }
}
