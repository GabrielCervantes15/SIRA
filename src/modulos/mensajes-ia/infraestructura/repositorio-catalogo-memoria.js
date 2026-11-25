/**
 * Repositorio del catálogo en memoria, cargado de datos-semilla/catalogo-mensajes.json (EQ-95).
 * Valida el catálogo al arrancar: si la semilla está mal formada, el servidor no inicia
 * con mensajes rotos (por ejemplo, una variable usada que no se declaró).
 */
import { readFileSync } from "node:fs";
import { validarCatalogo } from "../dominio/catalogo.js";

const RUTA_SEMILLA = new URL("../../../../datos-semilla/catalogo-mensajes.json", import.meta.url);

function copiar(m) {
  return structuredClone(m);
}

export class RepositorioCatalogoMemoria {
  /**
   * @param {Object} [opciones]
   * @param {Array} [opciones.mensajes] - Si no se indica, se lee la semilla.
   */
  constructor({ mensajes } = {}) {
    const datos = mensajes ?? JSON.parse(readFileSync(RUTA_SEMILLA, "utf8")).mensajes;
    const errores = validarCatalogo(datos);
    if (errores.length) {
      throw new Error(`Catálogo de mensajes inválido:\n- ${errores.join("\n- ")}`);
    }
    this.mensajes = datos.map(copiar).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.orden - b.orden);
  }

  async listar({ categoria } = {}) {
    return this.mensajes.filter((m) => !categoria || m.categoria === categoria).map(copiar);
  }

  async obtenerPorId(id) {
    const m = this.mensajes.find((x) => x.id === id);
    return m ? copiar(m) : null;
  }

  async contarPorCategoria() {
    const conteo = { ENVIO: 0, RESPUESTA: 0 };
    for (const m of this.mensajes) conteo[m.categoria] += 1;
    return conteo;
  }
}
