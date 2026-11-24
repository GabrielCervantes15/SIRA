/**
 * EQ-36 · HU2-11: el expediente abierto queda en la URL (?aspirante=ID).
 * Así, al recargar la página o al compartir el enlace, se vuelve a abrir el mismo
 * expediente. Funciones puras para poder probarlas sin navegador.
 */

export const PARAMETRO_ASPIRANTE = "aspirante";
const ID_VALIDO = /^[A-Za-z0-9._-]{1,50}$/;

/**
 * ID del aspirante que viene en la URL, o null si no hay o no es válido.
 * @param {string|URL} url
 */
export function aspiranteDesdeUrl(url) {
  const valor = new URL(String(url), "http://localhost").searchParams.get(PARAMETRO_ASPIRANTE);
  return valor && ID_VALIDO.test(valor) ? valor : null;
}

/**
 * Misma URL con el aspirante seleccionado (o sin él si `id` es null).
 * Conserva el resto de parámetros y el hash. Devuelve ruta relativa.
 * @param {string|URL} url
 * @param {string|null} id
 */
export function urlConAspirante(url, id) {
  const nueva = new URL(String(url), "http://localhost");
  if (id) nueva.searchParams.set(PARAMETRO_ASPIRANTE, id);
  else nueva.searchParams.delete(PARAMETRO_ASPIRANTE);
  return `${nueva.pathname}${nueva.search}${nueva.hash}`;
}
