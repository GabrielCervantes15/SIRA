/**
 * Adaptador simulado del servicio de correo (Sprint 1).
 *
 * Puerto IServicioCorreo:
 *   enviar({ para, asunto, texto, html? }) → Promise<{ id: string }>
 *
 * No manda nada a internet: guarda cada correo en una bandeja en memoria para que
 * las pruebas y la demo puedan revisarlo. `fallarVeces` simula caídas del SMTP.
 */
import { randomBytes } from "node:crypto";

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function crearServicioCorreoSimulado({ fallarVeces = 0 } = {}) {
  const bandeja = [];
  let fallosPendientes = fallarVeces;

  return {
    async enviar({ para, asunto, texto, html = null } = {}) {
      if (!CORREO_VALIDO.test(String(para ?? ""))) {
        throw Object.assign(new Error(`Destinatario inválido: ${para}`), { codigo: "DESTINATARIO_INVALIDO", reintentable: false });
      }
      if (!asunto || !texto) {
        throw Object.assign(new Error("El correo requiere asunto y texto."), { codigo: "CORREO_INCOMPLETO", reintentable: false });
      }
      if (fallosPendientes > 0) {
        fallosPendientes -= 1;
        throw Object.assign(new Error("Servidor de correo no disponible."), { codigo: "SMTP_NO_DISPONIBLE", reintentable: true });
      }
      const correo = { id: `mail-${randomBytes(6).toString("hex")}`, para, asunto, texto, html, enviadoEn: new Date().toISOString() };
      bandeja.push(correo);
      return { id: correo.id };
    },

    /** Correos "enviados" hasta ahora (copia). */
    bandeja() {
      return bandeja.map((c) => ({ ...c }));
    },
  };
}
