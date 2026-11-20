
/**
 * EQ-58: Propuesta de distribucion de carreras.
 * Basado en las reglas propuestas de EQ-52.
 *
 * No guarda datos ni modifica la informacion recibida.
 */

export function calcularRepartoInicial({ colaboradores, carreras }) {
  if (!Array.isArray(colaboradores) || !Array.isArray(carreras)) {
    throw new TypeError('Se requieren colaboradores y carreras.');
  }

  // Solo participan colaboradores activos.
  // El registro mas antiguo tiene prioridad en los empates.
  const activos = colaboradores
    .filter((colaborador) => colaborador.activo === true)
    .map((colaborador) => ({
      ...colaborador,
      carga: 0
    }))
    .sort((a, b) =>
      String(a.fechaRegistro).localeCompare(String(b.fechaRegistro)) ||
      String(a.id).localeCompare(String(b.id))
    );

  if (activos.length === 0) {
    throw new Error('No hay colaboradores activos para el reparto.');
  }

  // Las carreras mas grandes se asignan primero.
  const carrerasOrdenadas = [...carreras].sort(
    (a, b) =>
      b.aspirantes - a.aspirantes ||
      String(a.id).localeCompare(String(b.id))
  );

  const asignaciones = [];

  for (const carrera of carrerasOrdenadas) {
    if (!Number.isInteger(carrera.aspirantes) || carrera.aspirantes < 0) {
      throw new Error('La cantidad de aspirantes debe ser valida.');
    }

    // Elegir al colaborador que tiene menos carga.
    let destino = activos[0];

    for (const colaborador of activos) {
      if (colaborador.carga < destino.carga) {
        destino = colaborador;
      }
    }

    // Asignar la carrera completa.
    asignaciones.push({
      carreraId: carrera.id,
      colaboradorId: destino.id,
      aspirantes: carrera.aspirantes
    });

    destino.carga += carrera.aspirantes;
  }

  return {
    asignaciones,
    cargas: activos.map((colaborador) => ({
      colaboradorId: colaborador.id,
      carga: colaborador.carga
    })),
    totalAspirantes: carrerasOrdenadas.reduce(
      (total, carrera) => total + carrera.aspirantes,
      0
    )
  };
}

/**
 * EQ-58: Compara la distribucion actual con la propuesta.
 * No guarda cambios ni modifica los datos originales.
 *
 * La propuesta recalcula el reparto completo del campus.
 * Esta regla debe validarse con el PO.
 */
export function compararPropuestaDistribucion({
  colaboradores,
  carreras
}) {
  // Reutilizar el algoritmo que ya probamos.
  const propuesta = calcularRepartoInicial({
    colaboradores,
    carreras
  });

  // Obtener la carga actual de cada colaborador.
  const cargasActuales = new Map(
    colaboradores.map((colaborador) => [
      colaborador.id,
      0
    ])
  );

  for (const carrera of carreras) {
    const responsableActual = carrera.colaboradorIdActual;

    if (responsableActual == null) continue;

    if (!cargasActuales.has(responsableActual)) {
      throw new Error(
        `El responsable actual ${responsableActual} no existe.`
      );
    }

    cargasActuales.set(
      responsableActual,
      cargasActuales.get(responsableActual) +
        carrera.aspirantes
    );
  }

  const cargasAntes = colaboradores.map((colaborador) => ({
    colaboradorId: colaborador.id,
    carga: cargasActuales.get(colaborador.id)
  }));
  const mapaCargasPropuestas = new Map(
    propuesta.cargas.map((item) => [
      item.colaboradorId,
      item.carga
    ])
  );

  const cargasDespues = colaboradores.map((colaborador) => ({
    colaboradorId: colaborador.id,
    carga: mapaCargasPropuestas.get(colaborador.id) ?? 0
  }));

  // Identificar las carreras que cambiarian de responsable.
  const destinos = new Map(
    propuesta.asignaciones.map((asignacion) => [
      asignacion.carreraId,
      asignacion.colaboradorId
    ])
  );

  const cambios = carreras
    .filter(
      (carrera) =>
        (carrera.colaboradorIdActual ?? null) !==
        destinos.get(carrera.id)
    )
    .map((carrera) => ({
      carreraId: carrera.id,
      desde: carrera.colaboradorIdActual ?? null,
      hacia: destinos.get(carrera.id),
      aspirantes: carrera.aspirantes
    }));

  return {
    cargasAntes,
    cargasDespues,
    asignacionesPropuestas: propuesta.asignaciones,
    cambios,
    totalAspirantes: propuesta.totalAspirantes
  };
}
