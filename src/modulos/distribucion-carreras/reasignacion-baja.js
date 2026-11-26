/**
 * HU6-18 / HU7: reasignación de la cartera de un colaborador que se da de baja.
 *
 * Función pura: no guarda nada ni modifica lo que recibe.
 *
 * Reglas:
 *  1. Unidad de reparto = (campus, carrera). Una carrera se entrega completa a un solo
 *     colaborador (así lo muestra el diseño: "Ingeniería en Software · 78").
 *  2. Zona: una unidad solo puede ir a colaboradores ACTIVOS de su mismo campus
 *     (`zonaDe` permite agrupar campus en una zona más amplia sin tocar el algoritmo).
 *     El campus de la unidad es el del aspirante, no el del colaborador que se va;
 *     así, un expediente de otro campus (caso especial) regresa a su campus.
 *  3. Equidad: carreras de mayor a menor número de aspirantes; cada una se entrega al
 *     candidato con MENOR carga proyectada (carga actual + lo ya recibido en este reparto).
 *  4. Desempates, en orden: ya atiende esa carrera → registro más antiguo → ID menor.
 *  5. Si algún campus no tiene candidatos, no se reparte esa unidad y el campus se
 *     reporta en `zonasSinRelevo`; quien llama debe bloquear la baja.
 */

const clave = (campus, carrera) => `${campus}\u0000${carrera}`;
const texto = (v) => String(v ?? '').trim();
const comparar = (a, b) => String(a).localeCompare(String(b), 'es');

export function calcularReasignacionBaja({
  saliente,
  colaboradores,
  cartera,
  cargas = {},
  zonaDe = (campus) => texto(campus),
} = {}) {
  if (!saliente?.idInstitucional) throw new TypeError('Se requiere el colaborador que se da de baja.');
  if (!Array.isArray(colaboradores) || !Array.isArray(cartera)) {
    throw new TypeError('Se requieren colaboradores y cartera.');
  }

  // 1. Unidades de reparto: aspirantes de su cartera + carreras asignadas sin aspirantes.
  const unidades = new Map();
  for (const fila of cartera) {
    if (!Number.isInteger(fila.aspirantes) || fila.aspirantes < 0) {
      throw new RangeError('La cantidad de aspirantes debe ser un entero no negativo.');
    }
    const campus = texto(fila.campus);
    const carrera = texto(fila.carrera);
    const k = clave(campus, carrera);
    const previa = unidades.get(k);
    unidades.set(k, { campus, carrera, aspirantes: (previa?.aspirantes ?? 0) + fila.aspirantes });
  }
  for (const carrera of saliente.carreras ?? []) {
    const k = clave(texto(saliente.campus), texto(carrera));
    if (!unidades.has(k)) unidades.set(k, { campus: texto(saliente.campus), carrera: texto(carrera), aspirantes: 0 });
  }

  // 2. Candidatos: activos, distintos del que se va.
  const candidatos = colaboradores
    .filter((c) => c.idInstitucional !== saliente.idInstitucional && c.estado === 'activo' && (c.rol ?? 'colaborador') === 'colaborador')
    .map((c) => ({ ...c, zona: zonaDe(c.campus) }));

  const carga = new Map(candidatos.map((c) => [c.idInstitucional, cargas[c.idInstitucional] ?? 0]));
  const antes = new Map(carga);

  // 3. Mayor a menor; determinista.
  const ordenadas = [...unidades.values()].sort(
    (a, b) => b.aspirantes - a.aspirantes || comparar(a.campus, b.campus) || comparar(a.carrera, b.carrera)
  );

  const asignaciones = [];
  const zonasSinRelevo = new Set();

  for (const unidad of ordenadas) {
    const zona = zonaDe(unidad.campus);
    const elegibles = candidatos.filter((c) => c.zona === zona);
    if (elegibles.length === 0) {
      zonasSinRelevo.add(unidad.campus);
      continue;
    }
    const atiende = (c) => ((c.carreras ?? []).includes(unidad.carrera) ? 0 : 1);
    const destino = [...elegibles].sort(
      (a, b) =>
        carga.get(a.idInstitucional) - carga.get(b.idInstitucional) ||
        atiende(a) - atiende(b) ||
        comparar(a.fechaRegistro ?? '', b.fechaRegistro ?? '') ||
        comparar(a.idInstitucional, b.idInstitucional)
    )[0];
    carga.set(destino.idInstitucional, carga.get(destino.idInstitucional) + unidad.aspirantes);
    asignaciones.push({ ...unidad, colaboradorId: destino.idInstitucional });
  }

  // 4. Resumen por receptor.
  const porReceptor = new Map();
  for (const a of asignaciones) {
    if (!porReceptor.has(a.colaboradorId)) porReceptor.set(a.colaboradorId, []);
    porReceptor.get(a.colaboradorId).push({ campus: a.campus, carrera: a.carrera, aspirantes: a.aspirantes });
  }
  const receptores = [...porReceptor].map(([colaboradorId, carreras]) => {
    const nuevosAspirantes = carreras.reduce((t, c) => t + c.aspirantes, 0);
    return {
      colaboradorId,
      campus: candidatos.find((c) => c.idInstitucional === colaboradorId).campus,
      nuevosAspirantes,
      antes: antes.get(colaboradorId),
      despues: carga.get(colaboradorId),
      carreras,
    };
  }).sort((a, b) => b.nuevosAspirantes - a.nuevosAspirantes || comparar(a.colaboradorId, b.colaboradorId));

  return {
    asignaciones,
    receptores,
    totalAspirantes: ordenadas.reduce((t, u) => t + u.aspirantes, 0),
    totalCarreras: ordenadas.length,
    zonasSinRelevo: [...zonasSinRelevo].sort(comparar),
  };
}
