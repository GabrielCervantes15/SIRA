
/**
 * EQ-56: Guardado temporal de borradores de colaboradores.
 * Validación de campus obligatorio.
 *
 * No registra definitivamente al colaborador.
 * Almacenamiento temporal en memoria.
 */

export function crearServicioBorradores() {
  const borradores = new Map();

  function guardarBorrador({ idInstitucional, campus } = {}) {
    const id = String(idInstitucional ?? '').trim();

    const campusNormalizado =
      typeof campus === 'string' ? campus.trim() : '';

    if (!id) {
      throw new Error('El ID institucional es obligatorio.');
    }

    if (!campusNormalizado) {
      throw new Error('El campus es obligatorio.');
    }

    const borrador = {
      idInstitucional: id,
      campus: campusNormalizado,
      estado: 'BORRADOR'
    };

    borradores.set(id, borrador);

    return { ...borrador };
  }

  function obtenerBorrador(idInstitucional) {
    const id = String(idInstitucional ?? '').trim();
    const borrador = borradores.get(id);

    return borrador ? { ...borrador } : null;
  }

  return {
    guardarBorrador,
    obtenerBorrador
  };
}
