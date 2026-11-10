/**
 * Fábrica y manejador del servidor HTTP de SIRA.
 */
import http from "node:http";

export function crearServidor() {
  const NODE_ENV = process.env.NODE_ENV || "development";

  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    // Endpoint de salud para Docker / Kubernetes / Balanceadores
    if ((url.pathname === "/health" || url.pathname === "/api/v1/health") && req.method === "GET") {
      const payload = {
        status: "UP",
        service: "sira-crm-backend",
        environment: NODE_ENV,
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        database: {
          host: process.env.DB_HOST || "localhost",
          database: process.env.DB_NAME || "sira_db",
          schemasConfigured: ["usuarios", "aspirantes", "alertas", "conocimiento"],
        },
        eventBus: {
          type: process.env.RABBITMQ_HOST ? "rabbitmq" : "memoria",
          host: process.env.RABBITMQ_HOST || "memoria",
        },
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload, null, 2));
      return;
    }

    // Ruta raíz informativa
    if (url.pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          name: "SIRA CRM - Backend API",
          version: "0.1.0",
          description: "Monolito modular con Puertos y Adaptadores para seguimiento de aspirantes ITSON",
          healthCheck: "/health",
        })
      );
      return;
    }

    // 404 por defecto
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Ruta no encontrada", path: url.pathname }));
  });
}
