/**
 * Puerto de Dominio: Repositorio de Colaboradores (esquema `usuarios`, HU 6).
 *
 * Solo guarda lo que es del CRM: rol, estado, campus y carreras. Los datos
 * personales (nombre, correo, teléfono, foto) viven en el directorio institucional
 * y se consultan con el proveedor de Autenticación (BASE-7).
 */

/**
 * @typedef {Object} Colaborador
 * @property {string} idInstitucional            usuarios.usuario.id_directorio
 * @property {"colaborador"|"administrador"} rol
 * @property {"activo"|"inactivo"} estado
 * @property {string|null} campus
 * @property {string[]} carreras                 usuarios.colaborador_carrera
 * @property {boolean} casosEspeciales            Autoriza recibir expedientes de otros campus (HU6-11).
 * @property {string} fechaRegistro              ISO 8601
 * @property {string|null} [registradoPor]       ID institucional del administrador
 */

/**
 * @typedef {Object} FiltroColaboradores
 * @property {string} [campus]
 * @property {boolean} [incluirInactivos]
 */

/**
 * - listar(filtro) → Promise<Colaborador[]>
 * - obtenerPorId(idInstitucional) → Promise<Colaborador|null>
 * - existe(idInstitucional) → Promise<boolean>   (activo o inactivo: ambos cuentan como registrado)
 * - guardar(colaborador) → Promise<Colaborador>  (lanza YA_REGISTRADO si el ID ya existe)
 * - actualizarCasosEspeciales(idInstitucional, habilitado) → Promise<Colaborador|null>
 * - registrarTransferencias(registros) → Promise<void>  (bitácora de asignaciones por alta/inactivación; EQ-59)
 * - registrarTransferenciaManual(registro) → Promise<void> (bitácora estricta de transferencia manual; EQ-70)
 * - transaccion(fn) → Promise<T>                 (todo lo que haga fn se confirma o se revierte junto)
 */

/**
 * @typedef {Object} RegistroTransferencia
 * @property {string} aspiranteId
 * @property {string|null} colaboradorOrigen
 * @property {string} colaboradorDestino
 * @property {"alta"|"inactivacion"|"manual"} motivo
 * @property {string|null} realizadoPor
 * @property {string} [realizadoEn]  ISO 8601
 */
export const METODOS_REPOSITORIO_COLABORADORES = Object.freeze([
  "listar",
  "obtenerPorId",
  "existe",
  "guardar",
  "actualizarCasosEspeciales",
  "registrarTransferencias",
  "registrarTransferenciaManual",
  "transaccion",
]);
