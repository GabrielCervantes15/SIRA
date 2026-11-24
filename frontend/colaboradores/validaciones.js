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

// ---------- EQ-64 · HU6-17: paso 3 (revisión de distribución) ----------

/** Se puede pasar a la revisión con las mismas reglas que guardar el borrador. */
export function puedeIrARevision({ carreras = [], disponibles = [], manual = true } = {}) {
  return Boolean(manual) && puedeGuardarCarreras({ carreras, disponibles });
}

/**
 * Solo se confirma lo que se revisó: la vista previa debe ser del mismo
 * colaborador, campus y carreras que se van a enviar.
 */
export function puedeConfirmar({ vistaPrevia, idInstitucional, campus, carreras = [] } = {}) {
  if (!vistaPrevia || !idInstitucional || !campus) return false;
  const revisadas = (vistaPrevia.carreras ?? []).map((c) => c.carrera).sort();
  const enviadas = [...new Set(carreras)].sort();
  return vistaPrevia.colaborador?.idInstitucional === idInstitucional &&
    vistaPrevia.campus === campus &&
    revisadas.length === enviadas.length &&
    revisadas.every((c, i) => c === enviadas[i]);
}

/** "+12", "−5" o "sin cambio" para la tabla de cargas. */
export function describirCambioCarga({ antes = 0, despues = 0 } = {}) {
  const diferencia = despues - antes;
  if (diferencia === 0) return 'sin cambio';
  return diferencia > 0 ? `+${diferencia}` : `−${Math.abs(diferencia)}`;
}

// ---------- EQ-71 · HU6-12: listado de colaboradores ----------

/** "Campus Obregón Náinari" → "Obregón Náinari" para los botones de filtro. */
export function etiquetaCampus(nombre) {
  return String(nombre ?? '').replace(/^Campus\s+/i, '').trim();
}

/** Página de una lista (las páginas empiezan en 0 y se ajustan al rango válido). */
export function paginar(lista = [], pagina = 0, tamano = 9) {
  const paginas = Math.max(1, Math.ceil(lista.length / tamano));
  const actual = Math.min(Math.max(0, pagina), paginas - 1);
  const inicio = actual * tamano;
  return { visibles: lista.slice(inicio, inicio + tamano), pagina: actual, paginas, inicio };
}
