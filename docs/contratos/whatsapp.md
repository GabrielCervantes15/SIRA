# Contrato del módulo de integración WhatsApp

**EQ-114 · BASE-10 · Sprint 2**
Código: `src/modulos/whatsapp/` · Pruebas: `test/eq114-whatsapp.test.js`

## 1. Alcance

Como BASE-7 (Autenticación), WhatsApp ofrece un puerto independiente del proveedor y un adaptador simulado para desarrollo y CI. El simulador funciona exclusivamente en memoria: no usa red, credenciales, base de datos ni envía mensajes reales. No se modifica el servidor HTTP, la interfaz de usuario ni los consumidores actuales de HU1.

EQ-115 se ocupa de la cuenta de pruebas y webhook; EQ-85 consume el evento y conecta el adaptador real, aplica reintentos, ritmo y publica resultados; EQ-79 tramita la aprobación de la plantilla. Las reglas de consentimiento, ventana de atención y selección de canal de `docs/decisiones/HU1-reglas-lote-envio.md` y HU8 deben ser aplicadas por el consumidor antes de invocar el puerto. La validación estructural del teléfono no prueba que el número exista ni que esté autorizado. El nombre de ejemplo no corresponde a una plantilla aprobada de Meta.

## 2. Puerto `IProveedorWhatsApp`

| Método | Resultado |
|---|---|
| `enviarPlantilla(solicitud)` | `Promise<EstadoEntregaWhatsApp>`: aceptación del envío o error tipado; aceptación no equivale a entrega. |
| `obtenerEstadoEntrega(whatsappMessageId)` | `Promise<EstadoEntregaWhatsApp\|null>`: último estado conocido, `null` para ID desconocido. |

No se presupone que Meta exponga una consulta directa de estado por ID. El adaptador real puede obtener su último estado conocido desde un registro alimentado por webhooks.

### Solicitud

| Campo | Regla |
|---|---|
| `telefono` | Texto con + y 8–15 dígitos, primer dígito distinto de cero (validación estructural del proyecto). |
| `plantilla` | Nombre técnico, minúsculas ASCII, números y guiones bajos, 1–512 caracteres. |
| `idioma` | Código como `es` o `es_MX`, explícito. |
| `parametros` | Array ordenado de textos no vacíos; opcional, por defecto `[]`. Corresponde a parámetros de texto del cuerpo. |

Este es el contrato inicial para plantillas de texto de SIRA, no una implementación de todos los formatos de Meta (multimedia, botones y encabezados quedan fuera).

### Estado de entrega

```json
{
  "whatsappMessageId": "sim-wa-ejemplo",
  "estadoEntrega": "ENVIADO",
  "fechaActualizacion": "2026-11-25T00:00:00.000Z",
  "motivoFalla": null
}
```

Los identificadores son opacos; `sim-wa-` identifica datos simulados y no es un `wamid` real. Estados alineados con el esquema `aspirantes`: `PENDIENTE`, `ENVIADO`, `ENTREGADO`, `LEIDO`, `FALLIDO`. El simulador comienza en ENVIADO al aceptar la solicitud, sin afirmar entrega al destinatario. Los estados no avanzan solos: las pruebas pueden simular la entrega, lectura o fallo. Se permiten saltos de estados intermedios y no se permite retroceder. Una notificación duplicada del mismo estado es inocua. FALLIDO requiere motivo. Las consultas devuelven copias.

### Errores

| Código | Reintentable | Significado |
|---|---|---|
| `SOLICITUD_INVALIDA` | No | Solicitud o ID inválido. |
| `SERVICIO_NO_DISPONIBLE` | Sí | Indisponibilidad temporal simulada, antes de aceptar un envío. |
| `ENVIO_RECHAZADO` | No | Rechazo simulado antes de aceptar. |
| `RESPUESTA_INVALIDA` | No | Identificador duplicado generado por el simulador. |
| `ESTADO_INVALIDO` | No | Transición o motivo inválido en un control de pruebas. |
| `MENSAJE_NO_ENCONTRADO` | No | ID desconocido al simular una transición. |

`ErrorWhatsApp` incluye `codigo`, `message`, `reintentable`. Un fallo posterior a la aceptación se representa mediante `estadoEntrega: FALLIDO`, no como una excepción de la consulta. El contrato no autoriza reintentos automáticos de envíos de resultado incierto; la estrategia de idempotencia y reintentos pertenece a EQ-85.

## 3. Uso desde desarrollo o pruebas

```js
import { crearProveedorWhatsAppSimulado } from './src/modulos/whatsapp/index.js';

const whatsapp = crearProveedorWhatsAppSimulado();
const envio = await whatsapp.enviarPlantilla({
  telefono: '+12025550123', // número ficticio de prueba
  plantilla: 'reactivacion_prueba',
  idioma: 'es_MX',
  parametros: ['Aspirante QA', 'Carrera QA'],
});
whatsapp.simularEstadoEntrega(envio.whatsappMessageId, 'ENTREGADO');
console.log(await whatsapp.obtenerEstadoEntrega(envio.whatsappMessageId));
```

Controles exclusivos de prueba: `simularEstadoEntrega(id, estado, motivo)`, `simularIndisponibilidad(boolean)`, `simularRechazoSiguiente()`, `reiniciar()`. Se puede inyectar `reloj` y `generarId` para resultados deterministas. Los estados se pierden al reiniciar el proceso; no es almacenamiento de producción. No se guardan teléfonos ni parámetros en el almacén simulado.

## 3.1 Adaptador real de Cloud API (EQ-85)

`crearProveedorWhatsAppCloudApi({ token, phoneNumberId, urlBase })` implementa el mismo puerto con `POST {urlBase}/{phone-number-id}/messages`.

- **Cuándo se usa:** el servidor lo usa en lugar del simulador cuando `WHATSAPP_MOCK_ENABLED=false` y existen `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` (`leerConfiguracionCloudApi`).
- **`enviarPlantilla`:** manda la plantilla con `parametros` como variables de texto del cuerpo, y devuelve el `wamid` de Meta con estado `PENDIENTE`. Un 200 solo significa «aceptado».
- **Errores:** se clasifican por el código de Meta en `reintentable: true` (ritmo, servicio no disponible, 5xx, sin red, sin respuesta) o `false` (token, parámetros, plantilla, número sin WhatsApp, políticas). El código queda como `META_<código>`.
- **`obtenerEstadoEntrega`:** devuelve el último estado conocido; el webhook de EQ-115 lo actualizará.

Ver `docs/decisiones/HU1-envio-whatsapp.md`.

## 4. Verificación

```sh
node --test test/eq114-whatsapp.test.js
npm test
npm run lint
```

La prueba de EQ-114 no requiere Docker, Internet, token de Meta ni un teléfono real. No valida la cuenta Cloud API ni el webhook de EQ-115.
