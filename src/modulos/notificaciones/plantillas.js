/**
 * Plantillas de correo de HU 6 (EQ-61).
 */

function escaparHtml(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/**
 * Correo de bienvenida para el colaborador recién registrado.
 * @param {Object} evento - Evento `colaboradores.registro.confirmado`.
 * @param {{ urlSira?: string }} [opciones]
 * @returns {{ para: string, asunto: string, texto: string, html: string }}
 */
export function correoBienvenidaColaborador(evento, { urlSira = "http://localhost:3000" } = {}) {
  const nombre = evento.nombreCompleto || "colaborador";
  const carreras = evento.carrerasAsignadas ?? [];
  const totalAspirantes = (evento.aspirantesAsignados ?? []).length;
  const asunto = "Bienvenido a SIRA: ya tienes aspirantes asignados";

  const texto = [
    `Hola, ${nombre}:`,
    "",
    "Se confirmó tu registro como colaborador en SIRA (seguimiento de aspirantes del ITSON).",
    "",
    `Campus: ${evento.campus}`,
    `Carreras asignadas: ${carreras.join(", ")}`,
    `Aspirantes en tu cartera: ${totalAspirantes}`,
    "",
    `Entra en ${urlSira} con tu ID institucional (${evento.colaboradorId}) y la contraseña de tu cuenta institucional.`,
    "",
    "Este es un mensaje automático; no respondas a este correo.",
  ].join("\n");

  const html = `<!doctype html><html lang="es"><body style="font-family:sans-serif">
<p>Hola, ${escaparHtml(nombre)}:</p>
<p>Se confirmó tu registro como colaborador en SIRA (seguimiento de aspirantes del ITSON).</p>
<ul>
  <li><strong>Campus:</strong> ${escaparHtml(evento.campus)}</li>
  <li><strong>Carreras asignadas:</strong> ${carreras.map(escaparHtml).join(", ")}</li>
  <li><strong>Aspirantes en tu cartera:</strong> ${totalAspirantes}</li>
</ul>
<p>Entra en <a href="${escaparHtml(urlSira)}">${escaparHtml(urlSira)}</a> con tu ID institucional (${escaparHtml(evento.colaboradorId)}) y la contraseña de tu cuenta institucional.</p>
<p style="color:#666">Este es un mensaje automático; no respondas a este correo.</p>
</body></html>`;

  return { para: evento.correoInstitucional, asunto, texto, html };
}
