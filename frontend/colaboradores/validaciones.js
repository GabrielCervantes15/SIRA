/** Reglas compartidas de interfaz; el servidor vuelve a validarlas. */
export function idValido(id) {
  return /^\d{5,20}$/.test(String(id ?? '').trim());
}

export function puedeContinuar({ perfil, campus, campusDisponibles = [] } = {}) {
  return Boolean(perfil?.idInstitucional && campus && campusDisponibles.includes(campus));
}

export function puedeGuardarCarreras({ carreras = [], disponibles = [] } = {}) {
  return Array.isArray(carreras) && carreras.length > 0 &&
    carreras.every((carrera) => disponibles.includes(carrera));
}
