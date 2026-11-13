
/**
 * EQ-56: Guardado temporal de borradores de colaboradores.
 * Validación de campus obligatorio.
 *
 * No registra definitivamente al colaborador.
 * Almacenamiento temporal en memoria.
 */

export function crearServicioBorradores() {
  const borradores = new Map();

  function guardarBorrador({ idInstitucional, campus, carreras } = {}) {
    const id = String(idInstitucional ?? '').trim();

    const campusNormalizado =
      typeof campus === 'string' ? campus.trim() : '';

    if (!id) {
      throw new Error('El ID institucional es obligatorio.');
    }

    if (!campusNormalizado) {
      throw new Error('El campus es obligatorio.');
    }

    // Navegar de regreso al paso 1 no debe borrar carreras guardadas si
    // el campus sigue siendo el mismo. Cambiar de campus sí las invalida.
    const anterior = borradores.get(id);
    const carrerasElegidas = Array.isArray(carreras)
      ? [...carreras]
      : anterior?.campus === campusNormalizado && Array.isArray(anterior.carreras)
        ? [...anterior.carreras]
        : undefined;

    const borrador = {
      idInstitucional: id,
      campus: campusNormalizado,
      estado: 'BORRADOR',
      ...(carrerasElegidas ? { carreras: carrerasElegidas } : {})
    };

    borradores.set(id, borrador);

    return { ...borrador, ...(borrador.carreras ? { carreras: [...borrador.carreras] } : {}) };
  }

  function obtenerBorrador(idInstitucional) {
    const id = String(idInstitucional ?? '').trim();
    const borrador = borradores.get(id);

    return borrador ? { ...borrador, ...(borrador.carreras ? { carreras: [...borrador.carreras] } : {}) } : null;
  }

  return {
    guardarBorrador,
    obtenerBorrador
  };
}
