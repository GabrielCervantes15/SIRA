/**
 * Catálogo temporal para demostrar EQ-62/EQ-63 durante el Sprint 1.
 * Se deriva EXCLUSIVAMENTE de los aspirantes ficticios de datos-semilla.
 * EQ-57 sustituirá este adaptador por el catálogo institucional por campus.
 */
export function crearCatalogoRegistroDemo(aspirantes = []) {
  const porCampus = new Map();
  for (const aspirante of aspirantes) {
    const campus = String(aspirante.campus ?? '').trim();
    const carrera = String(aspirante.carreraSolicitada ?? aspirante.carrera ?? '').trim();
    if (!campus || !carrera) continue;
    if (!porCampus.has(campus)) porCampus.set(campus, new Set());
    porCampus.get(campus).add(carrera);
  }

  const catalogo = Object.fromEntries(
    [...porCampus].sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([campus, carreras]) => [campus, [...carreras].sort((a, b) => a.localeCompare(b, 'es'))])
  );
  return {
    listarCampus: () => Object.keys(catalogo),
    listarCarreras: (campus) => [...(catalogo[campus] ?? [])],
    contieneCampus: (campus) => Object.hasOwn(catalogo, campus),
    contieneCarrera: (campus, carrera) => Boolean(catalogo[campus]?.includes(carrera)),
    origen: 'DATOS_SEMILLA',
  };
}
