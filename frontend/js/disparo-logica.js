/**
 * HU1 (EQ-88 / EQ-89 / EQ-90) · Lógica del modal «Envío de mensajes automáticos».
 *
 * Funciones puras, sin DOM, para que los componentes de filtros y el botón se puedan
 * probar con `node --test` (test/eq90-unitarias-hu1.test.js). `app.js` las usa al pintar.
 */

export const TEXTO_FUERA_DE_HORARIO =
  "Fuera del horario matutino permitido. Podrás enviar dentro del horario configurado en HU 9.";
export const TEXTO_SIN_ASPIRANTES = "No hay aspirantes que cumplan las condiciones de ese lote.";
export const TEXTO_ERROR_VISTA_PREVIA = "No se pudo calcular el lote. Inténtalo de nuevo.";

/**
 * Filtros que se mandan a la vista previa y al envío.
 * La inactividad vacía o no numérica se toma como 1 (el servidor valida el resto).
 */
export function filtrosDesdeFormulario({ semaforos = [], carreras = [], inactividadValor, inactividadUnidad, enviarPorCorreo } = {}) {
  const filtros = {
    semaforos: [...semaforos],
    carreras: [...carreras],
    inactividadValor: Number(inactividadValor) || 1,
    inactividadUnidad,
  };
  return enviarPorCorreo === undefined ? filtros : { ...filtros, enviarPorCorreo: Boolean(enviarPorCorreo) };
}

/**
 * HU1-12: un grupo de casillas (semáforos o carreras) no puede quedar sin ninguna marcada.
 * @returns {boolean} true si la casilla que se acaba de desmarcar debe volver a marcarse.
 */
export function debeRemarcarse(casillaMarcada, marcadasEnElGrupo) {
  return !casillaMarcada && marcadasEnElGrupo === 0;
}

/** El botón Enviar solo se habilita con aspirantes, filtros válidos y dentro de horario. */
export function botonEnviarDeshabilitado(vistaPrevia) {
  if (!vistaPrevia) return true;
  return vistaPrevia.valido === false || !(vistaPrevia.total > 0) || !vistaPrevia.dentroDeHorario;
}

export function textoConteo(vistaPrevia) {
  return vistaPrevia?.total > 0 ? `${vistaPrevia.total} alumnos serán notificados` : TEXTO_SIN_ASPIRANTES;
}

export function textoConfirmacion(textoDelConteo) {
  return `¿Confirmas enviar el mensaje automático a ${textoDelConteo}?`;
}

/**
 * Resumen que se muestra después de enviar.
 * @returns {{ texto: string, conErrores: boolean }}
 */
export function resumenEnvio(r, enviarPorCorreo) {
  let texto = r.repetido
    ? `Este lote ya se había enviado: se notificó a ${r.totalEnviados} aspirante(s).`
    : `Se notificó a ${r.totalEnviados} aspirante(s).`;
  let conErrores = (r.correo?.fallidos ?? 0) > 0;
  // EQ-84: a quien le falta nombre o carrera no se le envía; se avisa aquí.
  if (r.noEnviados?.total > 0) {
    conErrores = true;
    texto += ` No se envió a ${r.noEnviados.total} por datos faltantes: `
      + r.noEnviados.detalles.map((d) => `${d.nombre} (${d.faltantes.join(", ")})`).join("; ") + ".";
  }
  if (enviarPorCorreo) {
    texto += ` Correo: ${r.correo.exitosos} enviados, ${r.correo.fallidos} fallidos.`;
    if (r.correo.detalles.length) texto += " " + r.correo.detalles.map((d) => `${d.nombre} (${d.motivo})`).join("; ") + ".";
  }
  return { texto, conErrores };
}
