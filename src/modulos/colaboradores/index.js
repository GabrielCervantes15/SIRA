/**
 * Módulo de Negocio: Colaboradores (HU 6, esquema `usuarios`)
 * Punto de entrada público e inyección de dependencias.
 *
 *   EQ-55 · HU6-5  consultar datos del colaborador por ID (directorio)
 *   EQ-71 · HU6-12 listado de colaboradores por campus
 *   EQ-64 · HU6-17 vista previa de la distribución (paso 3)
 *   EQ-59 · HU6-9  confirmar el registro en una transacción
 */
import { RepositorioColaboradoresMemoria } from "./infraestructura/repositorio-colaboradores-memoria.js";
import { RepositorioColaboradoresPostgres } from "./infraestructura/repositorio-colaboradores-postgres.js";
import { ConsultarColaboradorCasoUso } from "./aplicacion/consultar-colaborador.caso-uso.js";
import { ListarColaboradoresCasoUso } from "./aplicacion/listar-colaboradores.caso-uso.js";
import { PrevisualizarDistribucionCasoUso } from "./aplicacion/previsualizar-distribucion.caso-uso.js";
import { ConfirmarRegistroCasoUso, EVENTO_REGISTRO_CONFIRMADO } from "./aplicacion/confirmar-registro.caso-uso.js";
import { ColaboradoresControlador } from "./infraestructura/controlador-colaboradores.js";
import { crearEnrutadorColaboradores } from "./rutas.js";

/**
 * @param {Object} dependencias
 * @param {Object} dependencias.proveedorAutenticacion - Puerto IProveedorAutenticacion (BASE-7).
 * @param {Object} dependencias.cartera - Interfaz pública `moduloMonitoreo.cartera`.
 * @param {Object} dependencias.catalogo - Catálogo de campus y carreras.
 * @param {Object} dependencias.bus - Bus de eventos (en memoria o RabbitMQ).
 * @param {Object} [dependencias.borradores] - Servicio de borradores (EQ-56/EQ-63).
 * @param {Object} [dependencias.repositorio] - Repositorio ya construido (p. ej. Postgres).
 * @param {Array} [dependencias.colaboradores] - Semilla para el repositorio en memoria.
 */
export function crearModuloColaboradores({
  proveedorAutenticacion,
  cartera,
  catalogo,
  bus,
  borradores,
  repositorio,
  colaboradores = [],
  reloj,
}) {
  const repositorioColaboradores = repositorio || new RepositorioColaboradoresMemoria({ colaboradores });

  const consultarColaborador = new ConsultarColaboradorCasoUso({
    proveedorAutenticacion,
    repositorioColaboradores,
  });
  const listarColaboradores = new ListarColaboradoresCasoUso({
    repositorioColaboradores,
    proveedorAutenticacion,
    cartera,
    catalogo,
  });
  const previsualizarDistribucion = new PrevisualizarDistribucionCasoUso({
    repositorioColaboradores,
    consultarColaborador,
    cartera,
    catalogo,
    proveedorAutenticacion,
  });
  const confirmarRegistro = new ConfirmarRegistroCasoUso({
    repositorioColaboradores,
    consultarColaborador,
    cartera,
    catalogo,
    bus,
    borradores,
    reloj,
  });

  const controlador = new ColaboradoresControlador({
    consultarColaborador,
    listarColaboradores,
    previsualizarDistribucion,
    confirmarRegistro,
  });

  return {
    repositorio: repositorioColaboradores,
    consultarColaborador,
    listarColaboradores,
    previsualizarDistribucion,
    confirmarRegistro,
    controlador,
    enrutador: crearEnrutadorColaboradores({ controlador }),
  };
}

export {
  RepositorioColaboradoresMemoria,
  RepositorioColaboradoresPostgres,
  ConsultarColaboradorCasoUso,
  ListarColaboradoresCasoUso,
  PrevisualizarDistribucionCasoUso,
  ConfirmarRegistroCasoUso,
  EVENTO_REGISTRO_CONFIRMADO,
  ColaboradoresControlador,
  crearEnrutadorColaboradores,
};
export { ErrorColaboradores } from "./dominio/errores.js";
export { METODOS_REPOSITORIO_COLABORADORES } from "./dominio/repositorio-colaboradores.js";
