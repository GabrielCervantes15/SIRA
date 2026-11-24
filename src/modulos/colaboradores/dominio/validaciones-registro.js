/**
 * Validaciones de una solicitud de registro de colaborador (HU 6).
 * Las comparten la vista previa del paso 3 (EQ-64) y la confirmación (EQ-59),
 * así que ambas responden exactamente con los mismos códigos.
 */
import { ErrorColaboradores } from "./errores.js";

export const PATRON_ID_INSTITUCIONAL = /^\d{5,20}$/;

/**
 * @param {unknown} valor
 * @returns {string} ID limpio
 */
export function validarIdInstitucional(valor) {
  const id = String(valor ?? "").trim();
  if (!PATRON_ID_INSTITUCIONAL.test(id)) {
    throw new ErrorColaboradores(400, "ID_INVALIDO", "El ID institucional es obligatorio y debe ser numérico.");
  }
  return id;
}

/**
 * Valida campus y carreras contra el catálogo.
 * @param {{ idInstitucional?: unknown, campus?: unknown, carreras?: unknown }} solicitud
 * @param {{ contieneCampus(c: string): boolean, contieneCarrera(c: string, k: string): boolean }} catalogo
 * @returns {{ idInstitucional: string, campus: string, carreras: string[] }}
 */
export function validarSolicitudRegistro(solicitud = {}, catalogo) {
  const idInstitucional = validarIdInstitucional(solicitud.idInstitucional);
  const campus = typeof solicitud.campus === "string" ? solicitud.campus.trim() : "";
  if (!campus) {
    throw new ErrorColaboradores(400, "CAMPUS_OBLIGATORIO", "Selecciona un campus para registrar al colaborador.");
  }
  if (!catalogo.contieneCampus(campus)) {
    throw new ErrorColaboradores(400, "CAMPUS_INVALIDO", "El campus seleccionado no está disponible.");
  }
  const crudas = Array.isArray(solicitud.carreras) ? solicitud.carreras : [];
  const carreras = [...new Set(crudas.map((c) => String(c ?? "").trim()).filter(Boolean))];
  if (carreras.length === 0) {
    throw new ErrorColaboradores(400, "CARRERAS_OBLIGATORIAS", "Selecciona al menos una carrera para completar el registro.");
  }
  if (carreras.length > 100 || !carreras.every((c) => catalogo.contieneCarrera(campus, c))) {
    throw new ErrorColaboradores(400, "CARRERA_INVALIDA", "Una o más carreras no corresponden al campus seleccionado.");
  }
  return { idInstitucional, campus, carreras };
}
