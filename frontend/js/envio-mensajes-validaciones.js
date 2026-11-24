const EXCLUIDOS = new Set(["ACEPTADA", "RECHAZADA", "RECHAZADA_DEFINITIVA"]);

export function fechaCorte(valor, unidad, ahora = new Date()) {
  const corte = new Date(ahora);
  if (unidad === "dias") corte.setDate(corte.getDate() - valor);
  else if (unidad === "semanas") corte.setDate(corte.getDate() - valor * 7);
  else if (unidad === "meses") corte.setMonth(corte.getMonth() - valor);
  return corte;
}

export function validarFiltros(filtros) {
  return Number.isInteger(filtros.numero) && filtros.numero > 0 &&
    ["dias", "semanas", "meses"].includes(filtros.unidad) &&
    filtros.semaforos.length > 0 && filtros.carreras.length > 0;
}

export function obtenerLote(aspirantes, filtros, ahora = new Date()) {
  if (!validarFiltros(filtros)) return [];
  const corte = fechaCorte(filtros.numero, filtros.unidad, ahora);
  const vistos = new Set();
  return aspirantes.filter((a) => {
    if (!a.id || vistos.has(String(a.id))) return false;
    vistos.add(String(a.id));
    if (!a.enCartera || !filtros.semaforos.includes(a.semaforo)) return false;
    if (a.semaforo === "VERDE" || !filtros.carreras.includes(a.carrera)) return false;
    if (EXCLUIDOS.has(String(a.estado).toUpperCase())) return false;
    if (!(new Date(a.ultimaActividad) <= corte)) return false;
    if (Number(a.horasDesdeContacto ?? Infinity) < 48) return false;
    const canales = [];
    if (a.whatsappValido && a.consentimientoWhatsapp) canales.push("WhatsApp");
    if (filtros.correo && a.correoValido) canales.push("Correo");
    if (!canales.length) return false;
    a.canalesDisponibles = canales;
    return true;
  });
}
