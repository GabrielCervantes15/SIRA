/**
 * HU1-9 (EQ-85) · Cola de envío por WhatsApp con reintentos y ritmo controlado.
 *
 * Consume `disparo.envio.solicitado.whatsapp` (EQ-83) y envía la plantilla con el
 * proveedor del puerto de BASE-10 (Cloud API real o simulador). Reglas
 * (docs/decisiones/HU1-envio-whatsapp.md):
 *
 *  - Ritmo: como máximo `mensajesPorSegundo` (20 por omisión; Meta permite 80 por número).
 *  - Reintentos: solo errores temporales (`reintentable`), hasta `maxIntentos` intentos,
 *    con espera exponencial (2 s, 4 s, 8 s… hasta 60 s) y ±20 % de azar.
 *  - Límite de 24 h: no se inician más de `limiteContactos24h` contactos nuevos en 24 h
 *    móviles (250 en una cuenta nueva). Un número que ya recibió mensaje en la ventana
 *    no cuenta otra vez. Lo que no cabe se DIFIERE y se envía solo cuando se libera cupo.
 *  - Horario de HU9: fuera de horario no se envía; se difiere hasta la siguiente apertura.
 *  - Caducidad: lo que siga pendiente `caducidadMs` (72 h) después de solicitarse se da
 *    por FALLIDO (`CADUCADO`): el colaborador decide si lanza otro lote.
 *
 * Por cada envío publica `disparo.envio.enviado`, `disparo.envio.fallido` o, al
 * posponerse, `disparo.envio.diferido` (clave `<tipo>.whatsapp`).
 *
 * La cola vive en memoria, como el bus: si el servidor se reinicia, lo pendiente se
 * pierde. Con RabbitMQ (BASE-*) la cola será durable.
 */
import {
  crearEventoResultadoEnvio, TIPO_ENVIO_DIFERIDO, TIPO_ENVIO_ENVIADO, TIPO_ENVIO_FALLIDO,
} from "../eventos.js";

const HORA_MS = 3_600_000;
const VENTANA_24H_MS = 24 * HORA_MS;

export const OPCIONES_COLA_POR_OMISION = Object.freeze({
  mensajesPorSegundo: 20,
  maxIntentos: 5,
  esperaBaseMs: 2_000,
  esperaMaximaMs: 60_000,
  limiteContactos24h: 250,
  caducidadMs: 72 * HORA_MS,
  reintentoHorarioMs: 15 * 60_000,
});

/** Espera antes del intento `n + 1` (n = intentos hechos): base·2^(n−1), con tope y ±20 %. */
export function esperaReintento(intentosHechos, { esperaBaseMs, esperaMaximaMs }, azar = Math.random) {
  const exponencial = Math.min(esperaMaximaMs, esperaBaseMs * 2 ** Math.max(0, intentosHechos - 1));
  return Math.round(exponencial * (0.8 + 0.4 * azar()));
}

/**
 * @param {Object} d
 * @param {import('../../whatsapp/interfaz.js').IProveedorWhatsApp} d.proveedor
 * @param {{ publicar: Function }} d.bus
 * @param {{ nombre: string, idioma: string }} [d.plantilla]
 * @param {{ obtenerEstadoHorario: (fecha?: Date) => Object }} [d.validadorHorario]
 * @param {() => Date} [d.reloj]
 * @param {(ms: number) => Promise<void>} [d.dormir]
 * @param {() => number} [d.azar]
 */
export function crearColaEnvioWhatsApp({
  proveedor, bus, plantilla = { nombre: "reactivacion_hu1", idioma: "es_MX" }, validadorHorario = null,
  reloj = () => new Date(), dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  azar = Math.random, registrarError = (e) => console.error("[cola-envio-whatsapp]", e), ...opciones
} = {}) {
  if (!proveedor?.enviarPlantilla) throw new Error("La cola de envío requiere un proveedor de WhatsApp.");
  if (!bus?.publicar) throw new Error("La cola de envío requiere el bus de eventos.");
  const cfg = { ...OPCIONES_COLA_POR_OMISION, ...Object.fromEntries(Object.entries(opciones).filter(([, v]) => v != null)) };
  const intervaloMs = 1000 / cfg.mensajesPorSegundo;
  const ahora = () => reloj().getTime();

  const pendientes = [];
  const vistos = new Set();
  /** teléfono → instante en que se le inició contacto (ventana móvil de 24 h). */
  const contactos = new Map();
  let ultimoEnvio = -Infinity;
  let trabajo = null;

  async function publicar(tipo, item, extra) {
    try {
      await bus.publicar(`${tipo}.whatsapp`, crearEventoResultadoEnvio(tipo, item.evento, extra, reloj()));
    } catch (error) {
      registrarError(error);
    }
  }

  function limpiarVentana(instante) {
    for (const [telefono, desde] of contactos) if (instante - desde >= VENTANA_24H_MS) contactos.delete(telefono);
  }

  async function diferir(item, codigo, reanudaEn, motivo) {
    item.disponibleEn = reanudaEn;
    if (item.diferidoPor.has(codigo)) return;
    item.diferidoPor.add(codigo);
    await publicar(TIPO_ENVIO_DIFERIDO, item, { codigo, motivo, reanudaEn: new Date(reanudaEn).toISOString() });
  }

  async function fallar(item, codigo, motivo, codigoProveedor = null) {
    await publicar(TIPO_ENVIO_FALLIDO, item, { codigo, motivo, codigoProveedor, intentos: item.intentos });
  }

  /** @returns {Promise<boolean>} true si el envío terminó (enviado o fallido). */
  async function atender(item) {
    const { destino, parametros = [], texto = null } = item.evento.datos;
    const instante = ahora();

    if (instante - item.solicitadoEn > cfg.caducidadMs) {
      await fallar(item, "CADUCADO", `Siguió pendiente más de ${Math.round(cfg.caducidadMs / HORA_MS)} h sin poder enviarse.`);
      return true;
    }

    const horario = validadorHorario?.obtenerEstadoHorario?.(new Date(instante));
    if (horario && !horario.permitido) {
      const apertura = Date.parse(horario.siguienteApertura);
      await diferir(item, "FUERA_DE_HORARIO", Number.isFinite(apertura) ? apertura : instante + cfg.reintentoHorarioMs,
        "Fuera del horario de envío de HU9; se enviará en la siguiente apertura.");
      return false;
    }

    limpiarVentana(instante);
    if (!contactos.has(destino) && contactos.size >= cfg.limiteContactos24h) {
      const masAntiguo = Math.min(...contactos.values());
      await diferir(item, "LIMITE_24H", masAntiguo + VENTANA_24H_MS,
        `Se alcanzó el límite de ${cfg.limiteContactos24h} contactos nuevos en 24 h; se enviará cuando se libere cupo.`);
      return false;
    }

    const espera = ultimoEnvio + intervaloMs - ahora();
    if (espera > 0) await dormir(espera);

    item.intentos += 1;
    ultimoEnvio = ahora();
    try {
      const resultado = await proveedor.enviarPlantilla({
        telefono: destino, plantilla: plantilla.nombre, idioma: plantilla.idioma, parametros,
      });
      if (!contactos.has(destino)) contactos.set(destino, ahora());
      await publicar(TIPO_ENVIO_ENVIADO, item, {
        whatsappMessageId: resultado.whatsappMessageId, estadoEntrega: resultado.estadoEntrega,
        intentos: item.intentos, texto, enviadoEn: reloj().toISOString(),
      });
      return true;
    } catch (error) {
      const codigo = typeof error?.codigo === "string" ? error.codigo : "ERROR_INTERNO";
      if (error?.reintentable === true && item.intentos < cfg.maxIntentos) {
        item.disponibleEn = ahora() + esperaReintento(item.intentos, cfg, azar);
        return false;
      }
      if (error?.reintentable === true) {
        await fallar(item, "REINTENTOS_AGOTADOS", `No se pudo enviar después de ${item.intentos} intentos: ${error.message}`, codigo);
      } else {
        await fallar(item, codigo, error?.message || "Error desconocido al enviar.", codigo);
      }
      return true;
    }
  }

  async function drenar() {
    while (pendientes.length) {
      const instante = ahora();
      const item = pendientes.find((p) => p.disponibleEn <= instante);
      if (!item) {
        const proximo = Math.min(...pendientes.map((p) => p.disponibleEn));
        await dormir(Math.max(1, proximo - instante));
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
    /** Agrega un evento `disparo.envio.solicitado` (canal WHATSAPP). Ignora repetidos. */
    encolar(evento) {
      const datos = evento?.datos;
      if (!datos?.envioId || datos.canal !== "WHATSAPP" || vistos.has(datos.envioId)) return false;
      vistos.add(datos.envioId);
      const solicitadoEn = Date.parse(evento.publicadoEn);
      pendientes.push({
        evento, intentos: 0, disponibleEn: ahora(), diferidoPor: new Set(),
        solicitadoEn: Number.isFinite(solicitadoEn) ? solicitadoEn : ahora(),
      });
      arrancar();
      return true;
    },

    /** Resuelve cuando no queda nada por enviar (útil en pruebas y al apagar). */
    async esperarInactiva() {
      while (trabajo) await trabajo;
    },

    /** Estado para diagnóstico. */
    estado() {
      limpiarVentana(ahora());
      return {
        pendientes: pendientes.length,
        contactos24h: contactos.size,
        limiteContactos24h: cfg.limiteContactos24h,
        mensajesPorSegundo: cfg.mensajesPorSegundo,
      };
    },
  };
}
