# ADR-002: Estrategia de Simulación de Integraciones Externas mediante Puertos y Adaptadores

- **Estado:** Aprobado (Con adaptadores híbridos simulado/real ya activos en Sprint 2)
- **Fecha:** 2026-11-26
- **Tickets relacionados:** `BASE-7` (Autenticación), `BASE-8` (Registro Escolar), `BASE-9` (Correo SMTP), `BASE-10` / `EQ-85` (WhatsApp Cloud API), `BASE-11` / `EQ-115` (Webhook WhatsApp), `EQ-24` (`QA-5`)

---

## 1. Contexto

El CRM **SIRA** interactúa con cinco sistemas e infraestructuras externas cuya disponibilidad o credenciales productivas no dependen directamente del equipo de desarrollo durante los sprints de construcción:
1. **Directorio Institucional del ITSON (Active Directory / Kerberos):** validación de credenciales y consulta de perfil institucional (`idInstitucional`, `nombreCompleto`, `correoInstitucional`, `telefono`, `fotoUrl`).
2. **Sistema de Registro Escolar del ITSON:** consulta del estado oficial de la solicitud de admisión y emisión de eventos cuando una constancia o solicitud cambia de estado (`RECIBIDA`, `EN_REVISION`, `CONSTANCIA_RECHAZADA`, `ACEPTADA`, `RECHAZADA`).
3. **Meta WhatsApp Cloud API (`graph.facebook.com/v26.0`):** envío de plantillas HSM de reactivación (`HU 1`) y recepción de webhooks firmados con `X-Hub-Signature-256`.
4. **Servidor de Correo Institucional (SMTP):** envío de correos de bienvenida al registrar colaboradores (`HU6-14`), avisos de reasignación de cartera por baja (`HU6-18`) y respaldo por correo de lotes (`HU 1`).
5. **Infraestructura de Persistencia y Mensajería (PostgreSQL 16 y RabbitMQ 3.13):** necesaria en despliegues integrados, pero que no debe impedir ejecutar pruebas unitarias o de integración en entornos sin Docker.

Si los casos de uso dependieran directamente de llamadas de red a Active Directory, Registro Escolar o Meta, el desarrollo y las pruebas automatizadas quedarían bloqueados ante caídas externas, límites de cuota o falta de cuentas productivas.

---

## 2. Decisión

Se decidió **aislar cada integración externa detrás de un Puerto explícito (interfaz de dominio)** y proveer **Adaptadores Simulados deterministas en memoria** junto con los **Adaptadores Reales de protocolo**, seleccionables por inyección de dependencias o variables de entorno:

1. **Contratos idénticos entre adaptador simulado y adaptador real:**
   - Todo adaptador simulado implementa exactamente los mismos métodos, firmas asíncronas (`Promise`), validaciones y códigos de error tipados (`ErrorAutenticacion`, `ErrorRegistroEscolar`, `ErrorWhatsApp`) que el adaptador real.
   - Los adaptadores simulados incluyen banderas para inyectar fallos controlados en pruebas (p. ej. `simularIndisponibilidad(true)` -> `503 SERVICIO_NO_DISPONIBLE`, fallos temporales `reintentable: true` vs. permanentes `reintentable: false` en WhatsApp y SMTP).
2. **Selección automática por configuración del entorno:**
   - Por defecto (`npm start` y `npm test`), el servidor arranca con los adaptadores en memoria precargados con los archivos de `datos-semilla/`, permitiendo probar el 100% de los flujos sin servicios externos.
   - Cuando se definen las variables de entorno del servicio real (como `SMTP_HOST` o `WHATSAPP_MOCK_ENABLED=false` con `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_ACCESS_TOKEN`), las fábricas conmutan al adaptador de red real sin modificar ni una sola línea de los casos de uso.

---

## 3. Matriz de Equivalencia: Puerto $\rightarrow$ Adaptador Simulado $\rightarrow$ Adaptador Real

| Dominio / Integración | Puerto / Contrato | Adaptador Simulado (Sprints 1–2 / CI) | Adaptador Real / Productivo | Conmutación por Entorno |
|---|---|---|---|---|
| **Identidad Institucional (`BASE-7`)** | `IProveedorAutenticacion` ([interfaz.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/autenticacion/interfaz.js)) | [adaptador-simulado.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/autenticacion/adaptador-simulado.js) (`datos-semilla/autenticacion.json`) | Adaptador LDAP / Active Directory Kerberos (`ITSON_AD_SERVER_URL`) | `AUTH_MOCK_ENABLED=true\|false` y `SIRA_IDENTITY_UNAVAILABLE` |
| **Registro Escolar (`BASE-8`)** | `IRegistroEscolar` ([interfaz.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/registro-escolar/interfaz.js)) | [adaptador-simulado.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/registro-escolar/adaptador-simulado.js) + `simularCambioDeEstado()` | Cliente HTTP REST hacia `REGISTRO_ESCOLAR_API_URL` + consumidor AMQP | `REGISTRO_ESCOLAR_MOCK_ENABLED=true\|false` |
| **Envío WhatsApp (`BASE-10` / `EQ-85`)** | `METODOS_PROVEEDOR_WHATSAPP` ([interfaz.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/whatsapp/interfaz.js)) | [adaptador-simulado.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/whatsapp/adaptador-simulado.js) | **Implementado:** [adaptador-cloud-api.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/whatsapp/adaptador-cloud-api.js) (`fetch` hacia Meta Graph API v26.0) | `WHATSAPP_MOCK_ENABLED=false` + `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN` |
| **Webhook WhatsApp (`BASE-11` / `EQ-115`)** | `crearServicioWebhookWhatsApp` ([webhook.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/whatsapp/webhook.js)) | Peticiones firmadas en pruebas con `crypto.createHmac('sha256', secret)` | **Implementado:** endpoint `/api/v1/webhooks/whatsapp` con validación `hub.verify_token` y HMAC-SHA256 | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` + `WHATSAPP_APP_SECRET` |
| **Correo Electrónico (`BASE-9` / `EQ-61`)** | `{ enviar({ para, asunto, texto, html }) }` | [servicio-correo-simulado.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/notificaciones/servicio-correo-simulado.js) (bandeja en memoria) | **Implementado:** [servicio-correo-smtp.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/notificaciones/servicio-correo-smtp.js) (cliente SMTP TCP nativo hacia Mailpit / relay SMTP) | `SMTP_HOST` y `SMTP_PORT` (`crearServicioCorreoDesdeEntorno`) |
| **Persistencia SQL (`BASE-5`)** | `IRepositorioMonitoreo`, `IRepositorioColaboradores`, `IRepositorioConfiguracion`, `IRepositorioLotes` | `Repositorio*Memoria` (`datos-semilla/*.json`) | **Implementados:** `RepositorioMonitoreoPostgres`, `RepositorioColaboradoresPostgres`, `RepositorioConfiguracionPostgres`, `RepositorioLotesPostgres` | Inyección de pool `db` (`pg`) en `crearServidor` |
| **Bus de Eventos (`BASE-3`)** | `{ publicar(routingKey, evento), suscribir(patron, fn) }` | [bus-en-memoria.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/compartido/eventos/bus-en-memoria.js) (enrutamiento `topic` con `*` y `#`) | Exchange `crm.eventos` (`topic`) en RabbitMQ 3.13 | `RABBITMQ_HOST` y `RABBITMQ_EXCHANGE` |

---

## 4. Alternativas Consideradas

### Alternativa A: Interceptar llamadas `fetch` o sockets globales solo dentro de los archivos de prueba
- **Motivo de descarte:** Obliga a que el servidor en desarrollo local (`npm start`) tenga que conectarse siempre a servicios reales o falle al levantar la interfaz web cuando un desarrollador o el Product Owner quiere probar la UI en su equipo.

### Alternativa B: Codificar condicionales `if (process.env.MOCK)` dentro de los casos de uso
- **Motivo de descarte:** Contamina la capa de aplicación con detalles de infraestructura y hace que el código ejecutado en pruebas difiera del código ejecutado en producción.

---

## 5. Consecuencias y Plan de Transición a Producción

### Positivas
- **Demostraciones y pruebas autónomas:** El Product Owner y el equipo de QA pueden levantar la aplicación completa (`npm start`) y probar altas, bajas con reasignación, transferencias manuales, configuración de horarios y disparo de lotes sin depender de credenciales externas.
- **Avance gradual hacia integraciones reales:** En el Sprint 2 ya se construyeron y verificaron los adaptadores reales de **WhatsApp Cloud API** ([adaptador-cloud-api.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/whatsapp/adaptador-cloud-api.js)), **Webhook HMAC de Meta** ([webhook.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/whatsapp/webhook.js)), **Cliente SMTP** ([servicio-correo-smtp.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/notificaciones/servicio-correo-smtp.js)) y los **4 repositorios PostgreSQL**, manteniendo los simulados para la suite rápida de CI.

### Pasos para Conmutar a Producción
1. **WhatsApp Cloud API:** Definir `WHATSAPP_MOCK_ENABLED=false`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET` (ver [whatsapp-cloud-api.md](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/docs/infraestructura/whatsapp-cloud-api.md)).
2. **Correo SMTP:** Apuntar `SMTP_HOST`, `SMTP_PORT` y `SMTP_FROM` al relay SMTP institucional (o reemplazar `servicio-correo-smtp.js` por un adaptador con STARTTLS/AUTH si el servidor institucional exige autenticación TLS directa).
3. **Active Directory y Registro Escolar:** Implementar los adaptadores productivos que cumplan `IProveedorAutenticacion` e `IRegistroEscolar` y desactivar `AUTH_MOCK_ENABLED=false` y `REGISTRO_ESCOLAR_MOCK_ENABLED=false`.
