/**
 * Punto de entrada principal para el Backend del Monolito Modular SIRA.
 */
import { crearServidor } from "./servidor.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";

const server = crearServidor();

server.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`🚀 SIRA Backend iniciado exitosamente`);
  console.log(`📍 Escuchando en http://${HOST}:${PORT}`);
  console.log(`⚙️  Entorno: ${NODE_ENV}`);
  console.log(`🩺 Health check: http://${HOST}:${PORT}/health`);
  console.log(`====================================================`);
});

// Manejo de apagado elegante (Graceful Shutdown)
function apagar(senal) {
  console.log(`\n🛑 Recibida señal ${senal}. Cerrando conexiones del servidor...`);
  server.close(() => {
    console.log("🔒 Servidor HTTP cerrado correctamente.");
    process.exit(0);
  });

  // Forzar cierre si no responde en 5 segundos
  setTimeout(() => {
    console.error("⚠️ Cierre forzado por tiempo de espera agotado.");
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGTERM", () => apagar("SIGTERM"));
process.on("SIGINT", () => apagar("SIGINT"));
