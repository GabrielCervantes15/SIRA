/**
 * Regla del semáforo (EQ-26 · HU2-1).
 *
 * PROVISIONAL: la regla definitiva se acuerda con el PO en HU2-2. Está aislada
 * en este archivo para poder cambiarla sin tocar la tabla ni la API.
 *
 * Nota: la arquitectura dice que el semáforo mide inactividad; el Figma y el
 * equipo lo plantean según cómo va la solicitud. Esta versión usa el estado de
 * la solicitud (Registro Escolar) y si ya hubo contacto de un colaborador.
 *
 * Se evalúa en orden y gana la primera condición que se cumple:
 *
 *   1. Solicitud aceptada                         → VERDE
 *   2. Solicitud rechazada (definitivo)           → ROJO
 *   3. Aún no hay contacto de un colaborador      → ROJO
 *   4. Constancia rechazada (puede corregirla)    → ROJO
 *   5. Solicitud recibida (falta la constancia)   → NARANJA
 *   6. Constancia entregada, en revisión          → AMARILLO
 *
 * En la interfaz AMARILLO y NARANJA pueden compartir el color ámbar;
 * permanecen distintos en dominio para ordenar y describir estados.
 */
import { ESTADOS_SOLICITUD as E } from "../registro-escolar/estados.js";

export const NIVELES_SEMAFORO = Object.freeze({
  ROJO: "ROJO",
  NARANJA: "NARANJA",
  AMARILLO: "AMARILLO",
  VERDE: "VERDE",
});

/** A mayor número, más atención requiere. Sirve para ordenar la tabla por semáforo. */
export const SEVERIDAD = Object.freeze({
  ROJO: 4,
  NARANJA: 3,
  AMARILLO: 2,
  VERDE: 1,
});

/**
 * @param {{ estado: string, contactoIniciado: boolean }} aspirante
 * @returns {{ nivel: string, texto: string }}
 */
export function calcularSemaforo({ estado, contactoIniciado }) {
  const { ROJO, NARANJA, AMARILLO, VERDE } = NIVELES_SEMAFORO;

  if (estado === E.ACEPTADA) {
    return { nivel: VERDE, texto: "Solicitud aceptada" };
  }
  if (estado === E.RECHAZADA) {
    return { nivel: ROJO, texto: "La solicitud fue rechazada" };
  }
  if (!contactoIniciado) {
    return { nivel: ROJO, texto: "No se ha iniciado contacto con el aspirante" };
  }

  switch (estado) {
    case E.CONSTANCIA_RECHAZADA:
      return { nivel: ROJO, texto: "La constancia fue rechazada y falta que el aspirante la corrija" };
    case E.RECIBIDA:
      return { nivel: NARANJA, texto: "Falta que el aspirante entregue su constancia de calificaciones" };
    case E.EN_REVISION:
      return { nivel: AMARILLO, texto: "Constancia entregada; Registro Escolar la está revisando" };
    default:
      // Un estado que el catálogo provisional no conoce: se marca para que alguien lo revise.
      return { nivel: ROJO, texto: "Estado de la solicitud no reconocido" };
  }
}
