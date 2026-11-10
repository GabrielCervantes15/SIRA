# Guía de Entornos con Contenedores, Secretos y CI

**Tarea:** EQ-9 · BASE-4 · Sprint 1  
**Responsable:** Sebastián Bórquez Huerta  
**Estado:** Implementado y Verificado  

---

## 1. Visión General de la Infraestructura

Para soportar el estilo arquitectónico de **Monolito Modular** y **Puertos y Adaptadores** del CRM ITSON (SIRA), se diseñó un entorno basado en contenedores Docker y orquestación con Docker Compose, garantizando paridad entre desarrollo, pruebas e integración continua (CI).

```
                      +------------------------------------------+
                      |         Docker Compose Network           |
                      |             (sira-network)               |
                      |                                          |
                      |  +------------------------------------+  |
                      |  |      sira-backend (Node.js)        |  |
                      |  |   - Monolito modular               |  |
                      |  |   - Puerto: 3000                   |  |
                      |  |   - Hot-reload en desarrollo       |  |
                      |  +--------+------------------+--------+  |
                      |           |                  |           |
                      |     JDBC/TCP 5432       AMQP TCP 5672    |
                      |           v                  v           |
                      |  +----------------+  +----------------+  |
                      |  | sira-postgres  |  | sira-rabbitmq  |  |
                      |  | - PostgreSQL 16|  | - RabbitMQ 3.13|  |
                      |  | - 4 esquemas   |  | - Web UI:15672 |  |
                      |  | - init-schemas |  | - colas durables|  |
                      |  +----------------+  +----------------+  |
                      |                                          |
                      |  +------------------------------------+  |
                      |  | sira-mailpit (SMTP Dev / BASE-9)   |  |
                      |  | - Puerto 1025 (SMTP) / 8025 (Web)  |  |
                      |  +------------------------------------+  |
                      +------------------------------------------+
```

---

## 2. Componentes y Servicios

### 2.1 Backend (`sira-backend`)
- **Base:** `node:22-alpine` (multi-stage build con etapas `base`, `development`, `test` y `production`).
- **Seguridad:** Usuario no-root (`node`) en producción.
- **Healthcheck:** Endpoint nativo `/health` verificado vía `fetch()` integrado en Node.js.
- **Volúmenes en dev:** Mapeo de `./src`, `./test`, `./scripts`, `./datos-semilla` para recarga automática (`--watch`).

### 2.2 Base de Datos (`sira-postgres`)
- **Motor:** PostgreSQL 16 Alpine.
- **Aislamiento de Módulos (Requisito Arquitectónico):** El script `docker/postgres/init-schemas.sql` se ejecuta automáticamente en la primera inicialización creando los 4 esquemas obligatorios:
  - `usuarios`: Perfiles de colaboradores y administradores, asignaciones campus/carrera (sin contraseñas).
  - `aspirantes`: Datos del aspirante, estado de solicitud, historial y conversaciones.
  - `alertas`: Alertas de inactividad y seguimiento.
  - `conocimiento`: FAQs y catálogos de preparatorias.
- **Persistencia:** Volumen nombrado `sira_postgres_data`.

### 2.3 Bus de Eventos (`sira-rabbitmq`)
- **Broker:** RabbitMQ 3.13 con interfaz web de administración.
- **Puertos:** 
  - `5672`: Conexión AMQP para publicación y suscripción de eventos.
  - `15672`: Consola web de gestión (usuario y contraseña definidos en `.env`).
- **Persistencia:** Volumen nombrado `sira_rabbitmq_data`.

### 2.4 Servidor SMTP de Pruebas (`sira-mailpit`)
- Captura de correos transaccionales en desarrollo (notificaciones de alta y reasignación de cartera de HU 6 / BASE-9).
- Interfaz web accesible en `http://localhost:8025`.

---

## 3. Gestión de Secretos y Variables de Entorno

- **Archivo modelo:** `.env.example` contiene la totalidad de variables tipadas, con valores por defecto seguros para entornos locales y comentarios detallados.
- **Seguridad (.gitignore):** Los archivos `.env`, `.env.local` y llaves criptográficas están expresamente excluidos del control de versiones.
- **Regla estricta:** Para desplegar en un entorno nuevo, se debe crear el archivo `.env`:
  ```bash
  cp .env.example .env
  ```

---

## 4. Pipeline de Integración Continua (CI con GitHub Actions)

El flujo de CI se encuentra definido en `.github/workflows/ci.yml` y consta de dos fases:

1. **`lint-and-test`:**
   - Se ejecuta sobre una matriz de versiones de Node.js (`20.x` y `22.x`).
   - Ejecuta `npm run lint` para verificación estricta de sintaxis de código.
   - Ejecuta `npm test` con el corredor de pruebas nativo (`node:test`).
   - Ejecuta la prueba de datos semilla (`npm run demo:registro-escolar`).
2. **`docker-validation`:**
   - Valida la sintaxis declarativa de `docker-compose.yml` y `docker-compose.test.yml`.
   - Compila las etapas `development`, `test` y `production` del `Dockerfile`.

---

## 5. Instrucciones de Uso Rápido

### Iniciar todos los servicios
```bash
docker compose up -d
```

### Ver el estado y la salud de los contenedores
```bash
docker compose ps
```

### Consultar logs del backend en tiempo real
```bash
docker compose logs -f backend
```

### Acceder a las interfaces gráficas de desarrollo
- **Backend Healthcheck:** http://localhost:3000/health
- **RabbitMQ Management UI:** http://localhost:15672 (Credenciales: las de `.env`, por defecto `sira_rabbit` / `sira_rabbit_secret_dev`)
- **Mailpit Web Mailbox:** http://localhost:8025

### Detener los servicios
```bash
docker compose down
```

### Detener eliminando volúmenes (limpieza total de base de datos y colas)
```bash
docker compose down -v
```
