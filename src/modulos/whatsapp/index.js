/** Entrada pública del módulo de integración WhatsApp (EQ-114 · BASE-10). */
export {
  ErrorWhatsApp,
  ESTADOS_ENTREGA_WHATSAPP,
  METODOS_PROVEEDOR_WHATSAPP,
  implementaProveedorWhatsApp,
  validarSolicitudPlantilla,
} from "./interfaz.js";

export { crearProveedorWhatsAppSimulado } from "./adaptador-simulado.js";
