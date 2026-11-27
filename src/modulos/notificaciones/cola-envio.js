/**
 * Cola de envío con reintentos (BASE-9). La usan todos los consumidores del bus:
 *   - fallo temporal (`reintentable !== false`): reintenta con espera creciente (200, 400, 800 ms…)
 *   - fallo permanente (`reintentable === false`): no reintenta
 *
 * @param {Object} p
 * @param {{ enviar(correo: Object): Promise<{ id: string }> }} p.servicioCorreo
 * @param {{ para: string, asunto: string, texto: string, html?: string }} p.correo
 * @param {number} [p.intentos=3]
 * @param {number} [p.esperaBaseMs=200]
 * @returns {Promise<{ ok: true, id: string, intentos: number } | { ok: false, error: any, intentos: number }>}
 */
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function enviarConReintentos({ servicioCorreo, correo, intentos = 3, esperaBaseMs = 200 }) {
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      const { id } = await servicioCorreo.enviar(correo);
      return { ok: true, id, intentos: intento };
    } catch (error) {
      if (intento === intentos || error?.reintentable === false) return { ok: false, error, intentos: intento };
      await esperar(esperaBaseMs * 2 ** (intento - 1));
    }
  }
  return { ok: false, error: new Error("Sin intentos de envío."), intentos: 0 };
}
