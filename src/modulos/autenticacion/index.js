/**
 * Punto de entrada público del módulo de integración Autenticación.
 */
export {
  ErrorAutenticacion,
  METODOS_PROVEEDOR_AUTENTICACION,
  implementaProveedorAutenticacion,
} from "./interfaz.js";

export { crearProveedorAutenticacionSimulado } from "./adaptador-simulado.js";

