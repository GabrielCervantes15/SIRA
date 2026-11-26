/**
 * Plan de reasignación de una baja (HU6-18 / HU7). Lo comparten la vista previa y la
 * confirmación: la confirmación lo recalcula con el estado actual, nunca confía en el cliente.
 */
import { ErrorColaboradores } from "../dominio/errores.js";
import { validarIdInstitucional } from "../dominio/validaciones-registro.js";
import { calcularReasignacionBaja } from "../../distribucion-carreras/reasignacion-baja.js";

export async function construirPlanBaja({ repositorio, cartera, idInstitucional }) {
  const id = validarIdInstitucional(idInstitucional);
  const saliente = await repositorio.obtenerPorId(id);
  if (!saliente || saliente.rol !== "colaborador") {
    throw new ErrorColaboradores(404, "COLABORADOR_NO_ENCONTRADO", "No se encontró al colaborador.");
  }
  if (saliente.estado !== "activo") {
    throw new ErrorColaboradores(409, "YA_INACTIVO", "Este colaborador ya está inactivo.");
  }

  const [activos, filas, conteo] = await Promise.all([
    repositorio.listar({ incluirInactivos: false }),
    cartera.carteraPorCarrera(id),
    cartera.contarPorColaborador(),
  ]);

  const resultado = calcularReasignacionBaja({
    saliente,
    colaboradores: activos,
    cartera: filas,
    cargas: conteo,
  });

  if (resultado.zonasSinRelevo.length > 0) {
    throw new ErrorColaboradores(
      409,
      "SIN_COLABORADOR_RELEVO",
      `No se puede dar de baja: ${resultado.zonasSinRelevo.join(", ")} no tiene otro colaborador activo que cubra su cartera. Registra primero a otro colaborador.`
    );
  }
  return { saliente, resultado, aspirantesActuales: conteo[id] ?? 0 };
}
