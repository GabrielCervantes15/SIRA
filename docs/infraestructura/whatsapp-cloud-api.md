# EQ-115 · WhatsApp Business Cloud API: cuenta de pruebas y webhook

**Ticket:** EQ-115 · BASE-11
**Endpoint:** `GET/POST /api/v1/webhooks/whatsapp`
**Módulo:** `src/modulos/whatsapp/webhook.js`

## 1. Alcance

Este ticket prepara la configuración de la cuenta de pruebas y recibe notificaciones autenticadas de Meta. El adaptador de envío Cloud API está implementado en EQ-85 (`adaptador-cloud-api.js`); este ticket no duplica su lógica de envío.

El endpoint de webhook no requiere sesión de SIRA porque las solicitudes proceden de Meta. La autenticidad se valida con dos mecanismos diferentes:

- **GET:** Verify Token configurado en el panel de Meta; si coincide, responde el valor exacto de `hub.challenge` como texto plano.
- **POST:** `X-Hub-Signature-256`, calculada como HMAC-SHA256 del cuerpo HTTP original usando el App Secret de Meta. La firma se verifica antes de parsear el JSON y se compara en tiempo constante.

Las notificaciones autenticadas y válidas se publican en el bus interno con la clave `whatsapp.webhook.recibido`. El módulo no registra el contenido del mensaje, el token, el App Secret ni la firma.

## 2. Variables de entorno

Copiar `.env.example` a `.env` y sustituir los valores de ejemplo. El archivo `.env` está ignorado por Git. El ejemplo actual ya incluye `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; agrega manualmente las dos líneas siguientes al `.env` (no al repositorio):

```dotenv
WHATSAPP_APP_SECRET=PEGA_AQUI_EL_APP_SECRET_DE_META
WHATSAPP_WEBHOOK_MAX_BODY_BYTES=1048576
```

| Variable | Uso |
|---|---|
| `WHATSAPP_MOCK_ENABLED` | `true` mantiene el simulador de EQ-114; `false` permite seleccionar Cloud API cuando también existen token y Phone Number ID. |
| `WHATSAPP_ACCESS_TOKEN` | Token de acceso entregado por Meta. |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador del número de teléfono de Cloud API; no es el número telefónico visible. |
| `WHATSAPP_API_URL` | URL base de Graph API; por defecto `https://graph.facebook.com/v26.0`. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Secreto aleatorio elegido por el equipo y escrito también en la configuración del webhook de Meta. |
| `WHATSAPP_APP_SECRET` | App Secret de la aplicación de Meta; firma los POST. No es el access token ni el Verify Token. |
| `WHATSAPP_WEBHOOK_MAX_BODY_BYTES` | Tamaño máximo aceptado para el cuerpo del webhook; por defecto 1 MiB. |

No pegar tokens ni secretos en el repositorio, tickets, capturas ni mensajes. No sustituir valores de `.env.example` por credenciales reales.

## 3. Configuración de contenedores

El archivo `docker-compose.whatsapp.yml` es un override aditivo: no reemplaza `docker-compose.yml` ni modifica la configuración de PostgreSQL, RabbitMQ o los demás servicios.

Para que el backend reciba las variables de `.env`:

```powershell
docker compose -f docker-compose.yml -f docker-compose.whatsapp.yml up -d --build backend
```

Para ejecutar Node directamente con el archivo `.env` (Node 20.6 o posterior):

```powershell
node --env-file=.env src/index.js
```

## 4. Configuración en Meta

1. En Meta for Developers, abrir la aplicación que tiene agregado el producto WhatsApp.
2. En WhatsApp > Configuration, registrar como Callback URL:
   `https://TU-DOMINIO-PUBLICO/api/v1/webhooks/whatsapp`
3. Escribir exactamente el mismo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
4. Guardar/verificar el webhook. Meta enviará un GET con `hub.mode`, `hub.verify_token` y `hub.challenge`.
5. Suscribirse al campo `messages` para recibir notificaciones de mensajes y estados.
6. Copiar el App Secret desde la configuración básica de la aplicación a `WHATSAPP_APP_SECRET`.

Meta requiere que el callback sea públicamente accesible mediante HTTPS con certificado TLS válido. Para pruebas locales se necesita un túnel HTTPS temporal (por ejemplo, ngrok o Cloudflare Tunnel) hacia el puerto 3000. No se debe configurar `localhost` directamente como callback.

El número de pruebas se obtiene desde la configuración/API Setup de WhatsApp en Meta. Meta muestra un Phone Number ID y un número telefónico de prueba; son datos distintos. El Phone Number ID se configura en `WHATSAPP_PHONE_NUMBER_ID`. Agrega también el teléfono destinatario permitido para pruebas en el panel de Meta. Para probar únicamente el webhook puedes mantener `WHATSAPP_MOCK_ENABLED=true`; para enviar una plantilla real de prueba con EQ-85, usa `false` y configura el token y Phone Number ID reales.

## 5. Respuestas HTTP

| Solicitud | Resultado |
|---|---|
| GET con `mode=subscribe`, Verify Token correcto y challenge | `200 text/plain`, cuerpo igual a `hub.challenge`. |
| GET con token o modo incorrecto | `403`. |
| GET sin Verify Token configurado | `503`. |
| POST con firma HMAC válida y estructura `whatsapp_business_account` | `200 {"recibido":true}` y publicación en el bus. |
| POST sin firma o con firma inválida | `401`, sin procesar ni publicar el evento. |
| POST con JSON inválido o estructura ajena a WhatsApp Business | `400`. |
| POST mayor al límite configurado | `413`. |
| POST sin App Secret configurado | `503`. |
| Método distinto de GET/POST | `405`, `Allow: GET, POST`. |

Si el callback de recepción falla antes de completar la publicación del evento, el endpoint responde `500` para que Meta pueda reintentar. El bus en memoria de SIRA registra por separado los errores de sus suscriptores y no los propaga al publicador; por tanto, esos fallos posteriores no generan un `500` del webhook.

## 6. Pruebas locales

No requieren cuenta de Meta ni credenciales reales:

```powershell
node --test test/eq115-webhook-whatsapp.test.js
npm test
npm run lint
```

Las pruebas generan firmas con un secreto ficticio, validan el handshake GET, rechazan firmas incorrectas, verifican el límite de cuerpo y comprueban que solo las notificaciones autenticadas se publican en el bus.

## 7. Fuera de alcance

- No crea ni administra la aplicación de Meta por el usuario.
- No contiene tokens ni secretos reales.
- No reemplaza el adaptador Cloud API ni la cola de envíos de EQ-85.
- No agrega pantallas al frontend.
- No persiste todavía los eventos del webhook ni implementa deduplicación durable.
- No procesa el contenido de mensajes entrantes como conversación; publica el evento autenticado para que el consumidor correspondiente lo maneje.
