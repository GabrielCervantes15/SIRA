/**
 * Caso de Uso: Lista del catálogo por categoría (HU8-4 / EQ-96).
 *
 * - categoria: ENVIO (por defecto) o RESPUESTA; otro valor → 400 CATEGORIA_INVALIDA.
 * - semaforo: opcional; deja los mensajes con esa llave de semáforo (sin acentos ni mayúsculas).
 * - busqueda: opcional; busca en nombre, pregunta y texto (sin acentos ni mayúsculas).
 * - pagina ≥ 1 y tamano entre 1 y 50 (se ajustan, no fallan).
 *
 * La respuesta conserva { totalGeneral, totalCategoria, pagina, tamano, datos } que ya usa
 * la pantalla de EQ-98/99, y agrega `totalPaginas` y `categorias` (conteo por categoría).
 */
import { CATEGORIAS, ErrorCatalogo, aResumen } from "../dominio/catalogo.js";

export const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function enteroAcotado(valor, porDefecto, minimo, maximo) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(Math.max(n, minimo), maximo);
}

export class ListarMensajesCasoUso {
  constructor({ repositorioCatalogo }) {
    if (!repositorioCatalogo) throw new Error("Se requiere repositorioCatalogo.");
    this.repositorio = repositorioCatalogo;
  }

  /**
   * @param {{ categoria?: string, semaforo?: string, busqueda?: string, pagina?: number|string, tamano?: number|string }} [params]
   */
  async ejecutar({ categoria, semaforo, busqueda, pagina, tamano } = {}) {
    const cat = categoria == null || String(categoria).trim() === "" ? "ENVIO" : String(categoria).trim().toUpperCase();
    if (!CATEGORIAS.includes(cat)) {
      throw new ErrorCatalogo(400, "CATEGORIA_INVALIDA", `La categoría debe ser ${CATEGORIAS.join(" o ")}.`);
    }
    const paginaSegura = enteroAcotado(pagina, 1, 1, 10_000);
    const tamanoSeguro = enteroAcotado(tamano, 10, 1, 50);

    const [mensajes, categorias] = await Promise.all([
      this.repositorio.listar({ categoria: cat }),
      this.repositorio.contarPorCategoria(),
    ]);

    const filtroSemaforo = normalizar(semaforo);
    const termino = normalizar(busqueda);
    const filtrados = mensajes
      .filter((m) => !filtroSemaforo || m.llaves.some((l) => normalizar(l.tipo) === "semaforo" && normalizar(l.valor) === filtroSemaforo))
      .filter((m) => !termino || [m.nombre, m.pregunta, m.texto].some((t) => normalizar(t).includes(termino)));

    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / tamanoSeguro));
    const inicio = (paginaSegura - 1) * tamanoSeguro;
    return {
      categoria: cat,
      totalGeneral: categorias.ENVIO + categorias.RESPUESTA,
      totalCategoria: filtrados.length,
      categorias,
      pagina: paginaSegura,
      tamano: tamanoSeguro,
      totalPaginas,
      datos: filtrados.slice(inicio, inicio + tamanoSeguro).map(aResumen),
    };
  }
}
