/**
 * Caso de Uso: Detalle de un mensaje con vista previa y reglas (HU8-5 / EQ-97).
 *
 * Devuelve el mensaje con sus reglas de negocio, variables (con descripción), estado
 * de la plantilla de Meta y la vista previa con las variables ya sustituidas.
 * La vista previa usa valores de ejemplo; `aspirante`, `valor` y `magnitud` se pueden cambiar
 * (máximo 80 caracteres). Nunca modifica el catálogo.
 *
 * 400 ID_INVALIDO · 404 NO_ENCONTRADO · 400 VALOR_DEMASIADO_LARGO
 */
import { ErrorCatalogo, PATRON_ID, aDetalle, valoresVistaPrevia } from "../dominio/catalogo.js";

export class ObtenerDetalleMensajeCasoUso {
  constructor({ repositorioCatalogo }) {
    if (!repositorioCatalogo) throw new Error("Se requiere repositorioCatalogo.");
    this.repositorio = repositorioCatalogo;
  }

  /**
   * @param {{ id: string, valores?: { nombre?: string, carrera?: string } }} params
   */
  async ejecutar({ id, valores = {} } = {}) {
    const limpio = String(id ?? "").trim();
    if (!PATRON_ID.test(limpio)) {
      throw new ErrorCatalogo(400, "ID_INVALIDO", "El identificador del mensaje no es válido.");
    }
    const mensaje = await this.repositorio.obtenerPorId(limpio);
    if (!mensaje) throw new ErrorCatalogo(404, "NO_ENCONTRADO", "No existe un mensaje con ese identificador.");
    return { mensaje: aDetalle(mensaje, valoresVistaPrevia(valores)) };
  }
}
