/**
 * HU 8 · Consulta de Mensajes Predefinidos de la IA (EQ-98, EQ-99).
 * Catálogo de solo lectura: lista navegable por categoría (ENVIO/RESPUESTA),
 * con la vista previa y las "llaves" (reglas) de cada mensaje.
 */
import { readFileSync } from 'node:fs';

let catalogo = null;
function obtenerCatalogo() {
  if (!catalogo) {
    const ruta = new URL('../../../datos-semilla/mensajes-ia.json', import.meta.url);
    catalogo = JSON.parse(readFileSync(ruta, 'utf8')).mensajes;
  }
  return catalogo;
}

/**
 * @param {{ categoria?: string|null, semaforo?: string|null, pagina?: number, tamano?: number }} opciones
 */
export function listarMensajesIA({ categoria, semaforo, pagina = 1, tamano = 10 } = {}) {
  const todos = obtenerCatalogo();
  const cat = categoria ? String(categoria).toUpperCase() : 'ENVIO';

  let filtrados = todos.filter((m) => m.categoria === cat);
  if (semaforo) {
    filtrados = filtrados.filter((m) =>
      m.llaves.some((l) => l.tipo === 'Semáforo' && l.valor.toLowerCase() === semaforo.toLowerCase()));
  }

  const paginaSegura = Math.max(1, pagina);
  const tamanoSeguro = Math.min(Math.max(1, tamano), 50);
  const inicio = (paginaSegura - 1) * tamanoSeguro;

  return {
    totalGeneral: todos.length,
    totalCategoria: filtrados.length,
    pagina: paginaSegura,
    tamano: tamanoSeguro,
    datos: filtrados.slice(inicio, inicio + tamanoSeguro),
  };
}
