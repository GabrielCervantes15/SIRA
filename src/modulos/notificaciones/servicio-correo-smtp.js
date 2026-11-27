/**
 * Servicio de correo por SMTP (BASE-9).
 *
 * Mismo puerto que el simulado: enviar({ para, asunto, texto, html? }) → Promise<{ id }>.
 * Cliente SMTP mínimo con módulos nativos de Node (sin dependencias): pensado para el
 * servidor de pruebas (Mailpit, puerto 1025: sin TLS ni contraseña). Para un SMTP de
 * producción con TLS/autenticación conviene cambiar este adaptador por nodemailer;
 * el resto del sistema no se entera porque solo conoce `enviar`.
 *
 * Errores (los usa la cola de reintentos):
 *   reintentable: true   → red caída, tiempo agotado o respuesta 4xx (fallo temporal)
 *   reintentable: false  → destinatario/correo inválido o respuesta 5xx (fallo permanente)
 */
import net from "node:net";
import { randomBytes } from "node:crypto";

const CORREO_VALIDO = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const error = (mensaje, codigo, reintentable) => Object.assign(new Error(mensaje), { codigo, reintentable });
const b64 = (texto) => Buffer.from(texto, "utf8").toString("base64");
const b64Lineas = (texto) => b64(texto).replace(/(.{76})/g, "$1\r\n");
const encabezadoUtf8 = (texto) => `=?UTF-8?B?${b64(String(texto).replace(/[\r\n]+/g, " "))}?=`;

/** Arma el mensaje MIME (texto, y HTML opcional como alternativa). Todo en base64. */
export function construirMensaje({ de, nombreDe, para, asunto, texto, html, idMensaje, fecha = new Date() }) {
  const cabeceras = [
    `From: ${encabezadoUtf8(nombreDe)} <${de}>`,
    `To: <${para}>`,
    `Subject: ${encabezadoUtf8(asunto)}`,
    `Date: ${fecha.toUTCString()}`,
    `Message-ID: <${idMensaje}>`,
    "MIME-Version: 1.0",
  ];
  const parte = (tipo, contenido) =>
    [`Content-Type: ${tipo}; charset=utf-8`, "Content-Transfer-Encoding: base64", "", b64Lineas(contenido)].join("\r\n");

  if (!html) return [...cabeceras, parte("text/plain", texto)].join("\r\n");
  const frontera = `sira-${randomBytes(8).toString("hex")}`;
  return [
    ...cabeceras,
    `Content-Type: multipart/alternative; boundary="${frontera}"`,
    "",
    `--${frontera}`,
    parte("text/plain", texto),
    `--${frontera}`,
    parte("text/html", html),
    `--${frontera}--`,
  ].join("\r\n");
}

/**
 * @param {Object} opciones
 * @param {string} opciones.host
 * @param {number} [opciones.port=25]
 * @param {string} [opciones.desde="sira@localhost"]  Remitente (MAIL FROM).
 * @param {string} [opciones.nombreDesde="SIRA"]
 * @param {number} [opciones.timeoutMs=10000]
 */
export function crearServicioCorreoSmtp({ host, port = 25, desde = "sira@localhost", nombreDesde = "SIRA", timeoutMs = 10_000 } = {}) {
  if (!host) throw new Error("Se requiere el host del servidor SMTP.");

  /** Una conexión, una conversación SMTP. */
  function conversar(pasos) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      socket.setEncoding("utf8");
      socket.setTimeout(timeoutMs);
      let buffer = "";
      let lineas = [];
      let espera = null;
      let fallo = null;
      let terminado = false;

      const terminar = (err, valor) => {
        if (terminado) return;
        terminado = true;
        socket.destroy();
        if (err) reject(err); else resolve(valor);
      };
      const caida = (detalle) => {
        fallo = error(`Servidor de correo no disponible (${detalle}).`, "SMTP_NO_DISPONIBLE", true);
        if (espera) { const { rechazar } = espera; espera = null; rechazar(fallo); }
      };
      socket.on("error", (e) => caida(e.code || e.message));
      socket.on("timeout", () => caida("tiempo agotado"));
      socket.on("close", () => caida("conexión cerrada"));
      socket.on("data", (trozo) => {
        buffer += trozo;
        let i;
        while ((i = buffer.indexOf("\r\n")) !== -1) { lineas.push(buffer.slice(0, i)); buffer = buffer.slice(i + 2); }
        revisar();
      });

      // Una respuesta termina en la línea "NNN texto" (las anteriores son "NNN-texto").
      function revisar() {
        if (!espera) return;
        const fin = lineas.findIndex((l) => /^\d{3}( |$)/.test(l));
        if (fin === -1) return;
        const respuesta = lineas.slice(0, fin + 1);
        lineas = lineas.slice(fin + 1);
        const { resolver } = espera;
        espera = null;
        resolver({ codigo: Number(respuesta[fin].slice(0, 3)), texto: respuesta.join(" | ") });
      }
      const leer = () => new Promise((resolver, rechazar) => {
        if (fallo) return rechazar(fallo);
        espera = { resolver, rechazar };
        revisar();
      });
      const escribir = (datos) => socket.write(datos);

      pasos({ leer, escribir })
        .then((valor) => terminar(null, valor))
        .catch((e) => terminar(e));
    });
  }

  /** Exige un código esperado; 4xx = temporal (se reintenta), 5xx = permanente. */
  function exigir(respuesta, esperados, codigoPermanente) {
    if (esperados.includes(respuesta.codigo)) return;
    if (respuesta.codigo >= 400 && respuesta.codigo < 500) {
      throw error(`El servidor de correo respondió con un error temporal: ${respuesta.texto}`, "SMTP_TEMPORAL", true);
    }
    throw error(`El servidor de correo rechazó el envío: ${respuesta.texto}`, codigoPermanente, false);
  }

  return {
    async enviar({ para, asunto, texto, html = null } = {}) {
      if (!CORREO_VALIDO.test(String(para ?? ""))) {
        throw error(`Destinatario inválido: ${para}`, "DESTINATARIO_INVALIDO", false);
      }
      if (!asunto || !texto) throw error("El correo requiere asunto y texto.", "CORREO_INCOMPLETO", false);

      const dominio = desde.split("@")[1] || "localhost";
      const idMensaje = `${randomBytes(8).toString("hex")}@${dominio}`;
      const mensaje = construirMensaje({ de: desde, nombreDe: nombreDesde, para, asunto, texto, html, idMensaje });

      await conversar(async ({ leer, escribir }) => {
        exigir(await leer(), [220], "SMTP_RECHAZADO");
        escribir(`EHLO sira.local\r\n`);
        exigir(await leer(), [250], "SMTP_RECHAZADO");
        escribir(`MAIL FROM:<${desde}>\r\n`);
        exigir(await leer(), [250], "REMITENTE_RECHAZADO");
        escribir(`RCPT TO:<${para}>\r\n`);
        exigir(await leer(), [250, 251], "DESTINATARIO_RECHAZADO");
        escribir(`DATA\r\n`);
        exigir(await leer(), [354], "SMTP_RECHAZADO");
        escribir(`${mensaje.replace(/^\./gm, "..")}\r\n.\r\n`);
        exigir(await leer(), [250], "SMTP_RECHAZADO");
        // El correo ya fue aceptado (250): cerrar bien la sesión, y si el servidor no
        // contesta el 221 no importa, el envío no se pierde.
        escribir(`QUIT\r\n`);
        await leer().catch(() => {});
      });
      return { id: idMensaje };
    },
  };
}
