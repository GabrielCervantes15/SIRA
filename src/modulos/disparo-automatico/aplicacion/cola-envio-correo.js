/**
 * HU1 · Cola de envío por correo (canal opcional del lote; EQ-77 §8.2, EQ-86).
 *
 * Desde EQ-83 el correo se publica como `disparo.envio.solicitado.correo`; esta cola lo
 * consume y lo manda con el servicio de correo (puerto IServicioCorreo del módulo de
 * notificaciones: hoy el SMTP simulado de EQ-61, sin SMTP real porque BASE-9 no se construyó).
 *
 *  - Reintenta errores temporales (`reintentable`, p. ej. SMTP_NO_DISPONIBLE) con la misma
 *    espera exponencial que WhatsApp; los permanentes (destinatario inválido) fallan de una vez.
 *  - Publica `disparo.envio.enviado.correo` o `disparo.envio.fallido.correo` (los consume EQ-87).
 *  - Es independiente de WhatsApp (EQ-77 §8.3): un fallo de un canal no detiene al otro.
 *  - El correo no tiene límite de contactos ni ventana de 24 h de Meta, así que no difiere.
 */
import { esperaReintento, OPCIONES_COLA_POR_OMISION } from "./cola-envio-whatsapp.js";
import { crearEventoResultadoEnvio, TIPO_ENVIO_ENVIADO, TIPO_ENVIO_FALLIDO } from "../eventos.js";

export const ASUNTO_CORREO_REACTIVACION = "ITSON · Tu proceso de admisión puede continuar";

/**
 * @param {Object} d
 * @param {{ enviar: (correo: { para: string, asunto: string, texto: string }) => Promise<{ id: string }> }} d.servicioCorreo
 * @param {{ publicar: Function }} d.bus
 */
export function crearColaEnvioCorreo({
  servicioCorreo, bus, asunto = ASUNTO_CORREO_REACTIVACION, reloj = () => new Date(),
  dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), azar = Math.random,
  registrarError = (e) => console.error("[cola-envio-correo]", e), ...opciones
} = {}) {
  if (!servicioCorreo?.enviar) throw new Error("La cola de correo requiere el servicio de correo.");
  if (!bus?.publicar) throw new Error("La cola de correo requiere el bus de eventos.");
  const cfg = { ...OPCIONES_COLA_POR_OMISION, ...Object.fromEntries(Object.entries(opciones).filter(([, v]) => v != null)) };
  const ahora = () => reloj().getTime();
  const pendientes = [];
  const vistos = new Set();
  let trabajo = null;

  async function publicar(tipo, item, extra) {
    try {
      await bus.publicar(`${tipo}.correo`, crearEventoResultadoEnvio(tipo, item.evento, extra, reloj()));
    } catch (error) {
      registrarError(error);
    }
  }

  /** @returns {Promise<boolean>} true si terminó */
  async function atender(item) {
    const { destino, texto } = item.evento.datos;
    item.intentos += 1;
    try {
      const { id } = await servicioCorreo.enviar({ para: destino, asunto, texto });
      await publicar(TIPO_ENVIO_ENVIADO, item, { correoId: id, intentos: item.intentos, texto, enviadoEn: reloj().toISOString() });
      return true;
    } catch (error) {
      const codigo = typeof error?.codigo === "string" ? error.codigo : "ERROR_INTERNO";
      if (error?.reintentable === true && item.intentos < cfg.maxIntentos) {
        item.disponibleEn = ahora() + esperaReintento(item.intentos, cfg, azar);
        return false;
      }
      await publicar(TIPO_ENVIO_FALLIDO, item, {
        codigo: error?.reintentable === true ? "REINTENTOS_AGOTADOS" : codigo,
        motivo: error?.reintentable === true
          ? `No se pudo enviar el correo después de ${item.intentos} intentos: ${error.message}`
          : error?.message || "Error desconocido al enviar el correo.",
        codigoProveedor: codigo, intentos: item.intentos,
      });
      return true;
    }
  }

  async function drenar() {
    while (pendientes.length) {
      const instante = ahora();
      const item = pendientes.find((p) => p.disponibleEn <= instante);
      if (!item) {
        await dormir(Math.max(1, Math.min(...pendientes.map((p) => p.disponibleEn)) - instante));
        continue;
      }
      let terminado = true;
      try {
        terminado = await atender(item);
      } catch (error) {
        registrarError(error);
      }
      if (terminado) pendientes.splice(pendientes.indexOf(item), 1);
    }
  }

  function arrancar() {
    if (trabajo) return;
    trabajo = drenar().finally(() => {
      trabajo = null;
      if (pendientes.length) arrancar();
    });
  }

  return {
    /** Agrega un evento `disparo.envio.solicitado` del canal CORREO. Ignora repetidos. */
    encolar(evento) {
      const datos = evento?.datos;
      if (!datos?.envioId || datos.canal !== "CORREO" || vistos.has(datos.envioId)) return false;
      vistos.add(datos.envioId);
      pendientes.push({ evento, intentos: 0, disponibleEn: ahora() });
      arrancar();
      return true;
    },
    async esperarInactiva() {
      while (trabajo) await trabajo;
    },
    estado() {
      return { pendientes: pendientes.length };
    },
  };
}
