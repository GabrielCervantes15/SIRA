/**
 * Bus de eventos en memoria.
 *
 * Sustituye a RabbitMQ en desarrollo y pruebas unitarias. Expone la misma forma
 * que tendrá el adaptador real (publicar / suscribir), así que los módulos no
 * cambian cuando se conecte RabbitMQ.
 *
 * Las claves de enrutamiento (routing keys) siguen la semántica de un exchange
 * "topic" de RabbitMQ: las palabras se separan con "." y en los patrones
 *   "*" coincide con exactamente una palabra,
 *   "#" coincide con cero o más palabras.
 */

/**
 * ¿La clave de enrutamiento coincide con el patrón?
 * @param {string} patron  Ej.: "registro_escolar.#"
 * @param {string} clave   Ej.: "registro_escolar.solicitud.estado_cambiado"
 */
export function coincide(patron, clave) {
  return coincidePalabras(patron.split("."), clave.split("."));
}

function coincidePalabras(patron, clave) {
  if (patron.length === 0) return clave.length === 0;
  const [cabeza, ...resto] = patron;

  if (cabeza === "#") {
    // "#" consume de cero a todas las palabras restantes de la clave.
    for (let i = 0; i <= clave.length; i++) {
      if (coincidePalabras(resto, clave.slice(i))) return true;
    }
    return false;
  }

  if (clave.length === 0) return false;
  if (cabeza === "*" || cabeza === clave[0]) {
    return coincidePalabras(resto, clave.slice(1));
  }
  return false;
}

/**
 * @typedef {(evento: any, routingKey: string) => void | Promise<void>} Manejador
 */

export function crearBusEnMemoria() {
  /** @type {Array<{ patron: string, manejador: Manejador }>} */
  const suscripciones = [];
  /** @type {Array<{ routingKey: string, evento: any }>} */
  const publicados = [];

  return {
    /**
     * Publica un evento. Igual que con RabbitMQ, un fallo en un consumidor
     * no afecta a quien publica: el error solo se registra.
     * @param {string} routingKey
     * @param {any} evento
     */
    async publicar(routingKey, evento) {
      publicados.push({ routingKey, evento });
      for (const s of [...suscripciones]) {
        if (!coincide(s.patron, routingKey)) continue;
        try {
          await s.manejador(evento, routingKey);
        } catch (error) {
          console.error(`[bus] falló el consumidor de "${s.patron}":`, error);
        }
      }
    },

    /**
     * Se suscribe a los eventos cuya clave coincida con el patrón.
     * @param {string} patron
     * @param {Manejador} manejador
     * @returns {() => void} función para cancelar la suscripción
     */
    suscribir(patron, manejador) {
      const suscripcion = { patron, manejador };
      suscripciones.push(suscripcion);
      return () => {
        const i = suscripciones.indexOf(suscripcion);
        if (i >= 0) suscripciones.splice(i, 1);
      };
    },

    /** Eventos publicados hasta el momento (útil en pruebas). */
    publicados() {
      return [...publicados];
    },
  };
}
