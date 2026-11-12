/**
 * Cliente de la API de Monitoreo. Único lugar del front end que hace peticiones HTTP.
 * Si la API cambia, solo se edita este archivo.
 */
async function pedir(ruta, parametros = {}) {
  const url = new URL(ruta, window.location.origin);
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null && valor !== "") url.searchParams.set(clave, String(valor));
  }
  const respuesta = await fetch(url, { headers: { Accept: "application/json" } });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(cuerpo?.error?.mensaje ?? "No se pudo completar la operación.");
    error.estado = respuesta.status;
    error.codigo = cuerpo?.error?.codigo ?? "ERROR";
    throw error;
  }
  return cuerpo;
}

export const api = {
  sesion: () => pedir("/api/sesion"),
  listarAspirantes: (opciones) => pedir("/api/aspirantes", opciones),
  detalle: (id) => pedir(`/api/aspirantes/${encodeURIComponent(id)}`),
  actividades: (id, rango) => pedir(`/api/aspirantes/${encodeURIComponent(id)}/actividades`, rango),
};
