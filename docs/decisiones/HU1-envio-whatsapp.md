# HU1 · Envío por WhatsApp: reintentos, ritmo y pendientes (EQ-85 · HU1-9)

| Campo | Valor |
|---|---|
| Tarea | EQ-85 · HU1-9 |
| Estado | Propuesta implementada; pendiente de revisión del equipo y del PO |
| Código | `src/modulos/disparo-automatico/aplicacion/cola-envio-whatsapp.js`, `src/modulos/whatsapp/adaptador-cloud-api.js` |
| Pruebas | `test/eq85-envio-whatsapp.test.js` |
| Relacionado | EQ-83 (eventos del lote), BASE-10 / EQ-114 (puerto de WhatsApp), EQ-79 (plantilla), EQ-87 (resultados), EQ-115 (cuenta y webhook) |

## 1. Flujo

1. EQ-83 publica `disparo.envio.solicitado.whatsapp` por cada aspirante del lote.
2. La **cola de envío** lo recibe y responde de inmediato; el envío ocurre después, sin bloquear al colaborador.
3. Por cada envío llama a `enviarPlantilla` del puerto de BASE-10: Cloud API real si está configurada; si no, el simulador de EQ-114.
4. Publica el resultado: `disparo.envio.enviado`, `disparo.envio.fallido` o, si se pospone, `disparo.envio.diferido`.

Por Cloud API se manda la **plantilla aprobada** (EQ-79), no el texto libre: el aspirante está fuera de la ventana de atención de 24 h. Sus variables `{{1}}`, `{{2}}`… se llenan con `parametros` (nombre y carrera, en el orden del texto de `reactivacion_hu1`).

## 2. Ritmo

- Meta permite **80 mensajes por segundo** por número en Cloud API.
- Se envía a **20 por segundo** por omisión (`WHATSAPP_MENSAJES_POR_SEGUNDO`), con margen para otros envíos del mismo número.
- Si aun así Meta responde 130429 (límite de ritmo), se trata como error temporal (§3).

## 3. Reintentos

Solo se reintentan los errores **temporales**, clasificados por el código de Meta (su documentación recomienda el código, no el HTTP):

| Temporales (se reintentan) | Permanentes (fallan de inmediato) |
|---|---|
| 4, 80007 límite de llamadas · 130429 ritmo · 131056 demasiados al mismo número · 131016, 133004 servicio no disponible · 131057 mantenimiento · 131000 desconocido · HTTP 5xx o 429 sin código · sin red · sin respuesta en 10 s | token o permisos (0, 10, 190…) · parámetros (100, 132000, 132012) · número sin WhatsApp (131026) · plantilla no aprobada, pausada o deshabilitada (132001, 132015, 132016) · restricción de calidad o políticas (131048, 368) · 131049 (Meta pide esperar 24 h) |

- Hasta **5 intentos** (`WHATSAPP_MAX_INTENTOS`).
- Espera exponencial: 2 s, 4 s, 8 s, 16 s… con tope de 60 s y ±20 % al azar, para no reintentar todos a la vez.
- Si se agotan: `fallido` con `codigo: REINTENTOS_AGOTADOS` y el código del proveedor.

## 4. Límite de 24 horas y qué pasa con los pendientes

Meta limita cuántos **usuarios distintos** puede contactar el negocio fuera de la ventana de atención, en **24 horas móviles**. Desde octubre de 2025 el límite se comparte en todo el portafolio. Una cuenta nueva empieza en **250**, y sube a 2 000, 10 000, 100 000 o ilimitado según verificación, calidad y uso.

**Decisión:**

1. La cola lleva la cuenta de los números contactados en las últimas 24 h y **no inicia más de `WHATSAPP_LIMITE_CONTACTOS_24H`** (250 por omisión; se sube cuando Meta suba el nivel).
2. Un número que ya recibió mensaje dentro de la ventana no cuenta otra vez.
3. Lo que no cabe **no se descarta**: queda **diferido** y se publica `disparo.envio.diferido` con `codigo: LIMITE_24H` y `reanudaEn` (cuando se libera el primer cupo). Se envía solo, en orden de llegada, en cuanto hay cupo.
4. Los diferidos respetan el **horario de HU9**: si el cupo se libera de noche, salen en la siguiente apertura (`FUERA_DE_HORARIO`, con `reanudaEn` = siguiente apertura).
5. Si algo sigue pendiente **72 h** después de solicitarse, se da por `fallido` con `codigo: CADUCADO`. Para entonces la situación del aspirante pudo cambiar; el colaborador decide si lanza otro lote, que volverá a aplicar las reglas de EQ-81.

Ejemplo: con límite 250 y un lote de 400, salen 250 hoy y 150 quedan diferidos. Al día siguiente, conforme se cumplen 24 h de los primeros envíos y dentro del horario, salen los 150.

**Alternativas descartadas:**
- Rechazar el lote completo si rebasa el límite: obliga a partirlo a mano.
- Enviar sin control y dejar que Meta falle: daña la calificación de calidad del número.

## 5. Configuración

Variables en `.env.example`, sección 6:

| Variable | Por omisión | Uso |
|---|---|---|
| `WHATSAPP_MOCK_ENABLED` | `true` | Con `false`, más token y número, usa Cloud API. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | — | Credenciales de la cuenta (EQ-115). |
| `WHATSAPP_API_URL` | `https://graph.facebook.com/v26.0` | Versión de la Graph API. |
| `WHATSAPP_PLANTILLA_REACTIVACION`, `WHATSAPP_IDIOMA_PLANTILLA` | `reactivacion_hu1`, `es_MX` | Plantilla aprobada en EQ-79. |
| `WHATSAPP_MENSAJES_POR_SEGUNDO` | 20 | Ritmo. |
| `WHATSAPP_LIMITE_CONTACTOS_24H` | 250 | Nivel de la cuenta en Meta. |
| `WHATSAPP_MAX_INTENTOS` | 5 | Reintentos. |

## 6. Limitaciones conocidas

- **Cola en memoria:** si el servidor se reinicia, lo pendiente se pierde (el lote sí queda guardado). Con RabbitMQ la cola será durable.
- **Cuenta local de contactos:** solo conoce lo que envió este servidor. Si el número se usa también desde otro sistema, hay que bajar `WHATSAPP_LIMITE_CONTACTOS_24H`.
- **Estado de entrega:** un 200 de Meta solo significa «aceptado» (`PENDIENTE`). Enviado, entregado, leído o fallido llegan por el webhook de **EQ-115**.
- **Correo:** lo envía su propia cola con el SMTP simulado de EQ-61 (ver `docs/contratos/hu1-lote-envio.md`).

## 7. Fuentes

- Meta, *Messaging limits*: https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits
- Meta, *Throughput*: https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput
- Meta, *WhatsApp error codes*: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
- Meta, *Graph API versions*: https://developers.facebook.com/docs/graph-api/changelog/versions
