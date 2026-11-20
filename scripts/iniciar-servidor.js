/**
 * ⚠️ OBSOLETO desde la integración con login (rama integration/EQ-30-Gabriel).
 *
 * Este script levanta la versión AISLADA de Monitoreo (sin login, datos de
 * aspirantes-gabriel.json, rutas /api/aspirantes). frontend/index.html ya
 * carga sus assets desde rutas absolutas /app/css/... y /app/js/..., que solo
 * existen en el servidor integrado, así que al abrir esta versión en el
 * navegador la página carga sin estilos ni JavaScript (404 en ambos).
 *
 * Para ver el programa completo (login + monitoreo con datos reales de
 * aspirantes.json) usa en su lugar:  npm start   (equivale a node src/index.js)
 *
 * Se deja este archivo por si alguien necesita correr Monitoreo aislado para
 * depurar algo puntual con curl/Postman; la API /api/aspirantes todavía
 * responde por línea de comandos, solo no sirve para abrir en el navegador.
 *
 * Inicia el CRM de monitoreo de aspirantes con datos semilla.
 * Uso:  node scripts/iniciar-servidor.js   →   http://localhost:3000
 * Variables: PORT (puerto, 3000 por defecto) · NODE_ENV=production desactiva las ayudas de demo.
 */
import { fileURLToPath } from "node:url";
import { construirAplicacion } from "../src/ensamblar.js";
import { crearServidor } from "../src/servidor/servidor.js";

const puerto = Number(process.env.PORT ?? 3000);
const demo = process.env.NODE_ENV !== "production";

const app = await construirAplicacion();
const servidor = crearServidor({
  servicio: app.servicio,
  colaborador: app.colaborador,
  registroEscolar: app.registroEscolar,
  directorioFrontend: fileURLToPath(new URL("../frontend/", import.meta.url)),
  demo,
});

servidor.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`El puerto ${puerto} ya está en uso. Prueba con otro: PORT=3001 node scripts/iniciar-servidor.js`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

servidor.listen(puerto, "127.0.0.1", () => {
  console.log(`CRM Admisiones · Monitoreo listo en http://localhost:${puerto}`);
  if (demo) console.log(`Modo demo: abre http://localhost:${puerto}/?demo=1 para ver el panel de pruebas.`);
  console.warn("⚠️  Este script está obsoleto: en el navegador la página no cargará estilos ni JS (ver comentario arriba). Usa 'npm start' para el programa completo.");
});
