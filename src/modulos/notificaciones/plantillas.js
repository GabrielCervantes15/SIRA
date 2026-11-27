/**
 * Plantillas de correo de HU 6 (EQ-61, BASE-9).
 *
 * Todas pasan por `armarCorreo` (plantilla base): saludo, párrafos, lista de datos y pie
 * común. Así un correo nuevo solo define su contenido y siempre sale en texto y en HTML
 * (con los datos escapados).
 */

function escaparHtml(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const PIE = "Este es un mensaje automático; no respondas a este correo.";

/**
 * Plantilla base.
 * @param {Object} c
 * @param {string} c.para
 * @param {string} c.asunto
 * @param {string} c.saludo                 p. ej. "Hola, Nora:"
 * @param {string[]} [c.parrafos]           Párrafos de texto plano.
 * @param {Array<[string, string]>} [c.datos]  Pares [etiqueta, valor].
 * @param {string[]} [c.lista]              Elementos de una lista.
 * @param {string[]} [c.cierre]             Párrafos después de los datos.
 * @param {{ texto: string, url: string }} [c.enlace]  Enlace opcional; en HTML sale como <a>.
 */
export function armarCorreo({ para, asunto, saludo, parrafos = [], datos = [], lista = [], cierre = [], enlace = null }) {
  const texto = [
    saludo, "",
    ...parrafos.flatMap((p) => [p, ""]),
    ...datos.map(([k, v]) => `${k}: ${v}`),
    ...(datos.length ? [""] : []),
    ...lista.map((l) => `- ${l}`),
    ...(lista.length ? [""] : []),
    ...cierre.flatMap((p) => [p, ""]),
    ...(enlace ? [`${enlace.texto} ${enlace.url}`, ""] : []),
    PIE,
  ].join("\n");

  const html = `<!doctype html><html lang="es"><body style="font-family:sans-serif">
<p>${escaparHtml(saludo)}</p>
${parrafos.map((p) => `<p>${escaparHtml(p)}</p>`).join("\n")}
${datos.length ? `<ul>\n${datos.map(([k, v]) => `  <li><strong>${escaparHtml(k)}:</strong> ${escaparHtml(v)}</li>`).join("\n")}\n</ul>` : ""}
${lista.length ? `<ul>\n${lista.map((l) => `  <li>${escaparHtml(l)}</li>`).join("\n")}\n</ul>` : ""}
${cierre.map((p) => `<p>${escaparHtml(p)}</p>`).join("\n")}
${enlace ? `<p>${escaparHtml(enlace.texto)} <a href="${escaparHtml(enlace.url)}">${escaparHtml(enlace.url)}</a></p>` : ""}
<p style="color:#666">${PIE}</p>
</body></html>`.replace(/\n{2,}/g, "\n");

  return { para, asunto, texto, html };
}

/**
 * Correo de bienvenida para el colaborador recién registrado.
 * @param {Object} evento - Evento `colaboradores.registro.confirmado`.
 * @param {{ urlSira?: string }} [opciones]
 */
export function correoBienvenidaColaborador(evento, { urlSira = "http://localhost:3000" } = {}) {
  const nombre = evento.nombreCompleto || "colaborador";
  const carreras = evento.carrerasAsignadas ?? [];
  return armarCorreo({
    para: evento.correoInstitucional,
    asunto: "Bienvenido a SIRA: ya tienes aspirantes asignados",
    saludo: `Hola, ${nombre}:`,
    parrafos: ["Se confirmó tu registro como colaborador en SIRA (seguimiento de aspirantes del ITSON)."],
    datos: [
      ["Campus", evento.campus],
      ["Carreras asignadas", carreras.join(", ")],
      ["Aspirantes en tu cartera", String((evento.aspirantesAsignados ?? []).length)],
    ],
    cierre: [`Entra con tu ID institucional (${evento.colaboradorId}) y la contraseña de tu cuenta institucional.`],
    enlace: { texto: "Acceso a SIRA:", url: urlSira },
  });
}

/**
 * Correo para quien RECIBE aspirantes por la baja de otro colaborador (HU6-18 / HU7).
 * @param {Object} evento   Evento `colaboradores.baja.confirmada`.
 * @param {Object} receptor Elemento de `evento.receptores`.
 * @param {{ urlSira?: string }} [opciones]
 */
export function correoReasignacionPorBaja(evento, receptor, { urlSira = "http://localhost:3000" } = {}) {
  const nombre = receptor.nombreCompleto || "colaborador";
  const quien = evento.nombreCompleto || `el colaborador ${evento.colaboradorId}`;
  const periodo = evento.baja?.indefinida || !evento.baja?.hasta
    ? "La baja es por tiempo indefinido."
    : `La baja es del ${evento.baja.desde} al ${evento.baja.hasta}.`;
  return armarCorreo({
    para: receptor.correoInstitucional,
    asunto: `SIRA: se te reasignaron ${receptor.aspirantesRecibidos} aspirante(s)`,
    saludo: `Hola, ${nombre}:`,
    parrafos: [
      `Por la baja de ${quien} (${evento.campus}), se reasignaron aspirantes a tu cartera. ${periodo}`,
      "Recibes también su expediente, su historial de comunicaciones y las conversaciones del chat.",
    ],
    datos: [["Aspirantes recibidos", String(receptor.aspirantesRecibidos)]],
    lista: (receptor.carrerasRecibidas ?? []).map((c) => `${c.carrera} (${c.campus}): ${c.aspirantes} aspirante(s)`),
    enlace: { texto: "Revisa tu cartera en SIRA:", url: urlSira },
  });
}
