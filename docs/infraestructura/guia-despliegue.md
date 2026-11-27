# Guía de Despliegue y Operación — SIRA CRM

**Tarea:** EQ-24 · `[QA-5]`  
**Archivos base:** [Dockerfile](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/Dockerfile), [docker-compose.yml](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/docker-compose.yml), [docker-compose.test.yml](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/docker-compose.test.yml), [docker-compose.whatsapp.yml](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/docker-compose.whatsapp.yml), [.env.example](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/.env.example) y [package.json](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/package.json).  
**Referencia complementaria:** [entornos-y-contenedores.md](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/docs/infraestructura/entornos-y-contenedores.md) y [whatsapp-cloud-api.md](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/docs/infraestructura/whatsapp-cloud-api.md).

---

## 1. Requisitos Previos

1. **Ejecución local directa (sin contenedores):**
   - **Node.js `>= 20.0.0`** (recomendado Node.js 22 LTS, igual que la imagen base `node:22-alpine` del `Dockerfile`).
   - **Cero dependencias externas:** el proyecto no requiere ejecutar `npm install` porque utiliza exclusivamente módulos nativos de Node.js con ES Modules (`"type": "module"`).
2. **Ejecución contenerizada (entorno completo):**
   - **Docker Engine `>= 24.0`** y **Docker Compose v2** (`docker compose`).
   - Puertos locales libres: `3000` (Backend HTTP), `5432` (PostgreSQL 16), `5672` y `15672` (RabbitMQ 3.13 AMQP + Management UI), `1025` y `8025` (Mailpit SMTP + Web UI).

---

## 2. Variables de Entorno

Copia el archivo [.env.example](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/.env.example) a `.env` en la raíz del proyecto:

```bash
cp .env.example .env
```

> **Advertencia de seguridad:** Nunca almacenes tokens reales de Meta (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`), contraseñas de base de datos ni llaves secretas en el repositorio Git.

### 2.1. Servidor HTTP y Sesiones
| Variable | Valor por Defecto | Descripción |
|---|---|---|
| `NODE_ENV` | `development` | Entorno de ejecución (`development`, `test`, `production`). Con `production` activa el atributo `; Secure` en la cookie `sira_session`. |
| `PORT` | `3000` | Puerto TCP donde escucha el servidor HTTP ([src/index.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/index.js)). |
| `HOST` | `0.0.0.0` | Interfaz de red donde se enlaza el servidor. |
| `TZ` | `America/Hermosillo` | Zona horaria institucional fija (`UTC-07:00`). |
| `SIRA_SESSION_TTL_MS` | `1800000` | Duración de la sesión en milisegundos (30 minutos por defecto). |
| `SIRA_URL_PUBLICA` | `http://localhost:3000` | URL base incluida en los enlaces de los correos transaccionales (`EQ-61` / `BASE-9`). |

### 2.2. Base de Datos PostgreSQL 16
| Variable | Valor por Defecto | Descripción |
|---|---|---|
| `DB_HOST` | `localhost` (`postgres` en Docker) | Host del servidor PostgreSQL. |
| `DB_PORT` | `5432` | Puerto de PostgreSQL. |
| `DB_NAME` | `sira_db` | Nombre de la base de datos. |
| `DB_USER` | `sira_admin` | Usuario administrador de los esquemas. |
| `DB_PASSWORD` | `sira_secret_password_dev` | Contraseña de PostgreSQL. |

### 2.3. Bus de Eventos RabbitMQ 3.13
| Variable | Valor por Defecto | Descripción |
|---|---|---|
| `RABBITMQ_HOST` | `localhost` (`rabbitmq` en Docker) | Host del broker AMQP. Si no se define en local, el servidor usa `bus-en-memoria.js`. |
| `RABBITMQ_PORT` | `5672` | Puerto AMQP. |
| `RABBITMQ_MGMT_PORT` | `15672` | Puerto de la consola web de administración de RabbitMQ. |
| `RABBITMQ_USER` | `sira_rabbit` | Usuario de RabbitMQ. |
| `RABBITMQ_PASSWORD` | `sira_rabbit_secret_dev` | Contraseña de RabbitMQ. |
| `RABBITMQ_VHOST` | `/` | Virtual host de RabbitMQ. |
| `RABBITMQ_EXCHANGE` | `crm.eventos` | Nombre del exchange tipo `topic`. |

### 2.4. Autenticación, Directorio y Registro Escolar
| Variable | Valor por Defecto | Descripción |
|---|---|---|
| `AUTH_MOCK_ENABLED` | `true` | Usa el adaptador simulado de directorio (`datos-semilla/autenticacion.json`). |
| `SIRA_ADMIN_IDS` | *(vacío)* | Lista opcional de IDs institucionales adicionales con rol `administrador`, separados por comas. |
| `SIRA_DENIED_IDS` | *(vacío)* | Lista opcional de IDs institucionales con acceso revocado (`403 USUARIO_SIN_ACCESO`). |
| `SIRA_IDENTITY_UNAVAILABLE` | `false` | Si es `true`, simula caída del directorio institucional (`503 SERVICIO_NO_DISPONIBLE`). |
| `REGISTRO_ESCOLAR_MOCK_ENABLED` | `true` | Usa el adaptador simulado de Registro Escolar (`BASE-8`). |

### 2.5. WhatsApp Cloud API y Webhook (`EQ-85`, `EQ-115`)
| Variable | Valor por Defecto | Descripción |
|---|---|---|
| `WHATSAPP_MOCK_ENABLED` | `true` | Si es `false` y existen `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_ACCESS_TOKEN` reales, `HU 1` envía a través de Meta Cloud API. |
| `WHATSAPP_API_URL` | `https://graph.facebook.com/v26.0` | URL base de Graph API. |
| `WHATSAPP_PHONE_NUMBER_ID` | `mock_phone_id` | Identificador del número de teléfono en Meta WhatsApp Business. |
| `WHATSAPP_ACCESS_TOKEN` | `mock_bearer_token` | Token Bearer de acceso a Graph API. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | `mock_webhook_verification_token` | Token secreto para validar el reto `GET /api/v1/webhooks/whatsapp`. |
| `WHATSAPP_APP_SECRET` | *(vacío en mock)* | Secreto de la aplicación Meta para verificar la firma HMAC `X-Hub-Signature-256` en `POST /api/v1/webhooks/whatsapp`. |
| `WHATSAPP_PLANTILLA_REACTIVACION` | `reactivacion_hu1` | Nombre de la plantilla aprobada en Meta para lotes de HU 1. |
| `WHATSAPP_IDIOMA_PLANTILLA` | `es_MX` | Código de idioma de la plantilla. |
| `WHATSAPP_MENSAJES_POR_SEGUNDO` | `20` | Límite de ritmo de salida por segundo en la cola de WhatsApp. |
| `WHATSAPP_LIMITE_CONTACTOS_24H` | `250` | Límite máximo de contactos únicos por ventana móvil de 24 horas. |
| `WHATSAPP_MAX_INTENTOS` | `5` | Número máximo de intentos ante errores temporales (`429`, `5xx`). |

### 2.6. Notificaciones por Correo SMTP (`BASE-9`)
| Variable | Valor por Defecto | Descripción |
|---|---|---|
| `SMTP_HOST` | *(vacío en local / `mailpit` en Docker)* | Si se define, activa el cliente SMTP real (`servicio-correo-smtp.js`); si está vacío, usa `servicio-correo-simulado.js`. |
| `SMTP_PORT` | `1025` (`25` por defecto en el adaptador) | Puerto del servidor SMTP. |
| `SMTP_FROM` | `sira@localhost` | Dirección remitente para los correos del sistema. |

---

## 3. Despliegue Local Rápido (Sin Docker)

Ideal para desarrollo de interfaz, pruebas funcionales del Product Owner y validación rápida:

```bash
# Modo normal
npm start

# Modo desarrollo con recarga automática (node --watch)
npm run dev
```

1. Abre `http://localhost:3000` en el navegador.
2. Verifica el endpoint de salud:
   ```bash
   curl http://localhost:3000/health
   ```
3. **Cuentas semilla de prueba (`datos-semilla/autenticacion.json` y `permisos-sira.json`):**
   - **Administrador:** ID `00000100001` (Mtra. Alma Leticia Chávez Quintero) · Contraseña: `AdminPassword2026!`
   - **Administrador (HU 9):** ID `00000248910` (Dr. Carlos Eduardo Mendoza Ruiz) · Contraseña: `AdminPassword2026!`
   - **Colaborador:** ID `00000252115` (Sebastián Bórquez Huerta) · Contraseña: `Password123!`

---

## 4. Despliegue Completo con Docker Compose

### 4.1. Levantar Servicios (`postgres`, `rabbitmq`, `mailpit`, `backend`)

```bash
docker compose up -d --build
```

Servicios disponibles:
- **Aplicación SIRA (Backend + Frontend):** `http://localhost:3000`
- **Health Check:** `http://localhost:3000/health`
- **Consola Web de Mailpit (visualización de correos SMTP):** `http://localhost:8025`
- **Consola Web de RabbitMQ:** `http://localhost:15672` (usuario `sira_rabbit`, contraseña `sira_rabbit_secret_dev`)
- **PostgreSQL 16:** `localhost:5432` (base de datos `sira_db`, usuario `sira_admin`)

### 4.2. Aplicación Completa de Migraciones SQL (`01` a `10`) y Semillas

Al crear el volumen `sira_postgres_data` por primera vez, `docker-compose.yml` ejecuta automáticamente `init-schemas.sql`, `01_esquema_aspirantes.sql` y `02_aspirantes_semilla.sql`. Para aplicar el resto de las migraciones del Sprint 2 (`02` a `10`) y la semilla del catálogo de mensajes (`HU 8`) sobre el contenedor `sira-postgres` en ejecución, corre los siguientes comandos en orden desde la raíz del repositorio:

```bash
# Migraciones de esquemas aspirantes, mensajes, usuarios y disparo (02 a 10)
docker exec -i sira-postgres psql -U sira_admin -d sira_db < docker/postgres/migrations/02_ajuste_llaves_historial.sql
docker exec -i sira-postgres psql -U sira_admin -d sira_db < docker/postgres/migrations/03_esquema_mensajes_configuracion.sql
docker exec -i sira-postgres psql -U sira_admin -d sira_db < docker/postgres/migrations/04_bitacora_configuracion_mensajes.sql
docker exec -i sira-postgres psql -U sira_admin -d sira_db < docker/postgres/migrations/05_catalogo_mensajes.sql
docker exec -i sira-postgres psql -U sira_admin -d sira_db < datos-semilla/05_catalogo_mensajes_semilla.sql
docker exec -i sira-postgres psql -U sira_admin -d sira_db < docker/postgres/migrations/06_casos_especiales_transferencias.sql
docker exec -i sira-postgres psql -U sira_admin -d sira_db < docker/postgres/migrations/07_lotes_envio.sql
docker exec -i sira-postgres psql -U sira_admin -d sira_db < docker/postgres/migrations/08_envio_parametros.sql
docker exec -i sira-postgres psql -U sira_admin -d sira_db < docker/postgres/migrations/09_resultados_envio.sql
docker exec -i sira-postgres psql -U sira_admin -d sira_db < docker/postgres/migrations/10_baja_colaboradores.sql
```

*(Todas las migraciones utilizan `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`, por lo que son idempotentes y pueden reejecutarse de forma segura).*

---

## 5. Construcción y Ejecución de la Imagen de Producción

El [Dockerfile](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/Dockerfile) es multi-stage (`base`, `development`, `test`, `production`). La etapa `production`:
- Configura `TZ=America/Hermosillo` y `NODE_ENV=production`.
- Ejecuta el proceso bajo el usuario sin privilegios `USER node`.
- Incluye un `HEALTHCHECK` nativo cada `20s` contra `http://127.0.0.1:3000/health`.

```bash
# Construir imagen productiva
docker build --target production -t sira-crm-backend:0.2.0 .

# Ejecutar contenedor productivo
docker run -d \
  --name sira-prod \
  -p 3000:3000 \
  --env-file .env \
  -e NODE_ENV=production \
  sira-crm-backend:0.2.0
```

---

## 6. Verificación de Calidad y Pruebas Automatizadas (CI)

### 6.1. En entorno local
```bash
# 1. Verificación de sintaxis y reglas del linter (0 tabuladores, sintaxis ESM válida)
npm run lint

# 2. Ejecución de toda la suite automatizada (unitarias, integración y E2E)
npm test
```

### 6.2. En entorno contenerizado aislado (`docker-compose.test.yml`)
Levanta instancias efímeras en `tmpfs` de PostgreSQL (`postgres-test`) y RabbitMQ (`rabbitmq-test`) y ejecuta la etapa `test` del `Dockerfile` (`npm run lint && npm test`):

```bash
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from backend-test
docker compose -f docker-compose.test.yml down -v
```

---

## 7. Checklist de Salida a Producción

- [ ] **`NODE_ENV=production` y HTTPS:** Desplegar detrás de un proxy inverso con TLS (Nginx / Traefik / Cloudflare) para que la cookie `sira_session` viaje con el atributo `Secure` habilitado.
- [ ] **Secretos seguros:** Reemplazar todas las contraseñas por defecto de `.env.example` (`DB_PASSWORD`, `RABBITMQ_PASSWORD`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`).
- [ ] **Migraciones SQL aplicadas:** Verificar que los esquemas `usuarios`, `aspirantes`, `mensajes` y `disparo` tengan aplicadas las migraciones `01` a `10` y las semillas de configuración (`03`) y catálogo (`05`).
- [ ] **WhatsApp Cloud API real (`EQ-85` / `EQ-115`):** Configurar `WHATSAPP_MOCK_ENABLED=false` y registrar en el panel de Meta Developers la URL pública `https://<dominio-sira>/api/v1/webhooks/whatsapp` (o usar `docker-compose.whatsapp.yml` para pruebas con túnel HTTPS).
- [ ] **Servidor SMTP (`BASE-9`):** Configurar `SMTP_HOST`, `SMTP_PORT` y `SMTP_FROM` apuntando al servidor de correo saliente institucional.
