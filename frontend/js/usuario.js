/** Utilidades del encabezado compartido (/app y pantallas de Colaboradores). */
/** Iniciales para el avatar del encabezado («Sebastián Bórquez Huerta» → «SB»). */
export function inicialesUsuario(nombre) {
  const partes = String(nombre ?? '').trim().split(/\s+/).filter((p) => !/^(mtra?|dra?|lic|ing)\.?$/i.test(p));
  return `${partes[0]?.[0] ?? ''}${partes[1]?.[0] ?? ''}`.toUpperCase() || '?';
}
