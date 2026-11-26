/**
 * Validación de la duración de una baja (HU6-18 / HU7).
 * Indefinida, o un periodo con fecha de inicio y de fin (YYYY-MM-DD).
 */
import { ErrorColaboradores } from "./errores.js";

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fechaReal(texto) {
  if (typeof texto !== "string" || !PATRON_FECHA.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/**
 * @param {{ tipo?: unknown, inicio?: unknown, fin?: unknown }} solicitud
 * @param {string} hoy YYYY-MM-DD
 * @returns {{ indefinida: boolean, desde: string, hasta: string|null }}
 */
export function validarDuracionBaja({ tipo, inicio, fin } = {}, hoy) {
  if (tipo === "indefinido") return { indefinida: true, desde: hoy, hasta: null };
  if (tipo !== "periodo") {
    throw new ErrorColaboradores(400, "TIPO_BAJA_INVALIDO", "Indica si la baja es indefinida o por un periodo.");
  }
  if (!fechaReal(inicio) || !fechaReal(fin)) {
    throw new ErrorColaboradores(400, "FECHAS_BAJA_INVALIDAS", "Indica fechas de inicio y fin válidas para el periodo de baja.");
  }
  if (fin < inicio) {
    throw new ErrorColaboradores(400, "PERIODO_BAJA_INVALIDO", "La fecha de fin no puede ser anterior a la de inicio.");
  }
  if (fin < hoy) {
    throw new ErrorColaboradores(400, "PERIODO_BAJA_VENCIDO", "El periodo de baja ya terminó; elige una fecha de fin igual o posterior a hoy.");
  }
  return { indefinida: false, desde: inicio, hasta: fin };
}
