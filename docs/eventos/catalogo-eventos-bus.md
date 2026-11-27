# Catálogo de Eventos del Bus (`crm.eventos`)

**Tarea:** EQ-24 · `[QA-5]`  
**Exchange:** `crm.eventos` (tipo `topic` en RabbitMQ / emulado en memoria por [bus-en-memoria.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/compartido/eventos/bus-en-memoria.js))

---

## 1. Arquitectura y Reglas de Enrutamiento

El bus de eventos desacopla los módulos de negocio para que ningún módulo necesite invocar efectos secundarios (correos, colas de WhatsApp, actualización de historiales o refresco de cachés) dentro de la transacción HTTP principal:

1. **Coincidencia de patrones (`topic`):**
   - Las claves de enrutamiento (`routingKey`) son palabras separadas por puntos (`<modulo>.<entidad>.<accion>[.<canal>]`).
   - `*` coincide con exactamente una palabra (p. ej. `disparo.envio.enviado.*` recibe tanto `.whatsapp` como `.correo`).
   - `#` coincide con cero o más palabras (p. ej. `colaboradores.#` recibe todos los eventos del módulo `Colaboradores`).
2. **Aislamiento de fallos:**
   - En [bus-en-memoria.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/compartido/eventos/bus-en-memoria.js), cada publicación clona el evento con `structuredClone` para evitar mutaciones compartidas entre suscriptores y captura cualquier excepción o rechazo de promesa de los consumidores sin interrumpir al publicador ni a los demás suscriptores.
   - Los eventos **solo se publican después de que la transacción de base de datos ha hecho `COMMIT`**. Si la transacción falla y hace `ROLLBACK`, no se publica ningún evento.
3. **Formatos de sobre coexistentes en el repositorio:**
   - **Sobre estándar con `datos` (`{ eventId, tipo, version, publicadoEn, datos }`):** Utilizado por `registro_escolar.solicitud.estado_cambiado`, `mensajes.configuracion.actualizada`, todos los eventos de `disparo.envio.*` y `whatsapp.webhook.recibido`.
   - **Sobre plano en raíz (`colaboradores.*`):** Utilizado por `colaboradores.registro.confirmado` y `colaboradores.baja.confirmada` (`{ eventId, tipo, colaboradorId, campus, ... }`), consumidos directamente por `consumidor-registro.js` y `consumidor-baja.js`.

---

## 2. Tabla Maestra de Eventos

| Routing Key | Tipo (`evento.tipo`) | Productor | Consumidor(es) | Idempotencia | Comportamiento ante Fallo / Reintento |
|---|---|---|---|---|---|
| `registro_escolar.solicitud.estado_cambiado` | `registro_escolar.solicitud.estado_cambiado` | `src/modulos/registro-escolar/adaptador-simulado.js` | `src/modulos/monitoreo/servicio.js` (`procesarEvento`) | Descarta `eventId` ya procesados (`eventosVistos`) e ignora eventos más antiguos que el estado actual. | Valida con `validarEventoEstadoCambiado`; eventos mal formados o de aspirantes desconocidos se ignoran sin lanzar error. |
| `colaboradores.registro.confirmado` | `colaboradores.registro.confirmado` | `ConfirmarRegistroCasoUso` (`EQ-59`) | `crearConsumidorRegistroConfirmado` (`src/modulos/notificaciones/consumidor-registro.js`, `EQ-61`) | Mapa `procesados` indexado por `eventId`. | Reintenta fallos SMTP temporales (`reintentable: true`) hasta 3 veces con backoff exponencial (`cola-envio.js`). Si agota intentos, registra en `fallidos()` sin revertir el alta. |
| `colaboradores.baja.confirmada` | `colaboradores.baja.confirmada` | `ConfirmarBajaCasoUso` (`HU6-18` / `EQ-69`) | `crearConsumidorBajaConfirmada` (`src/modulos/notificaciones/consumidor-baja.js`, `BASE-9`) | Mapa `procesados` indexado por `${eventId}:${receptor.colaboradorId}`. | Envía un correo independiente a cada receptor con reintentos exponenciales; el fallo de un destinatario no impide notificar a los demás ni revierte la baja. |
| `mensajes.configuracion.actualizada` | `mensajes.configuracion.actualizada` | `GuardarConfiguracionCasoUso` (`EQ-108`) | `crearInterfazLecturaConfiguracion` (`src/modulos/mensajes/aplicacion/servicio-lectura-configuracion.js`, `HU9-4`) | Sobrescribe la instantánea en memoria con `datos.valorNuevo` tras validar `validarEventoConfiguracionActualizada`. | Si el evento no pasa `validarEventoConfiguracionActualizada`, se ignora conservando la última configuración válida en memoria. |
| `disparo.envio.solicitado.whatsapp` | `disparo.envio.solicitado` | `CrearLoteEnvioCasoUso` (`EQ-83`) | `crearColaEnvioWhatsApp` (`src/modulos/disparo-automatico/aplicacion/cola-envio-whatsapp.js`, `EQ-85`) | `eventId === envio.id`. La cola descarta cualquier `envioId` ya encolado o procesado. | Controla ritmo (`20 msg/s`), ventana de horario de HU 9, tope de `250 contactos/24h` y hasta `5` intentos con backoff exponencial; emite `enviado`, `diferido` o `fallido`. |
| `disparo.envio.solicitado.correo` | `disparo.envio.solicitado` | `CrearLoteEnvioCasoUso` (`EQ-83`) | `crearColaEnvioCorreo` (`src/modulos/disparo-automatico/aplicacion/cola-envio-correo.js`, `EQ-91`) | `eventId === envio.id`. Descarta `envioId` duplicados. | Reintenta fallos temporales de correo hasta `maxIntentos` y publica `disparo.envio.enviado.correo` o `disparo.envio.fallido.correo`. |
| `disparo.envio.enviado.<canal>` | `disparo.envio.enviado` | `colaEnvioWhatsApp` / `colaEnvioCorreo` | `crearConsumidorResultadosEnvio` (`consumir-resultados-envio.js`, `EQ-87`) | `eventId = "${envioId}:disparo.envio.enviado"`. Además `lotesNotificados` garantiza sumar `vecesNotificado` a lo sumo 1 vez por `(loteId, aspiranteId)`. | Actualiza `disparo.envio`, actualiza `fechaUltimaNotificacion` y `vecesNotificado` en Monitoreo, agrega el mensaje a la conversación y registra evento `MENSAJE_AUTOMATICO`. |
| `disparo.envio.fallido.<canal>` | `disparo.envio.fallido` | `colaEnvioWhatsApp` / `colaEnvioCorreo` | `crearConsumidorResultadosEnvio` (`consumir-resultados-envio.js`, `EQ-87`) | `eventId = "${envioId}:disparo.envio.fallido"`. | Marca el envío como `FALLIDO` en el lote y registra el intento fallido en el historial del aspirante (`MENSAJE_AUTOMATICO`) sin incrementar `vecesNotificado`. |
| `disparo.envio.diferido.whatsapp` | `disparo.envio.diferido` | `colaEnvioWhatsApp` (`EQ-85`) | `crearConsumidorResultadosEnvio` (`consumir-resultados-envio.js`, `EQ-87`) | `eventId = "${envioId}:disparo.envio.diferido:${codigo}"` (`FUERA_DE_HORARIO` o `LIMITE_24H`). | Registra estado intermedio `DIFERIDO` con `reanudaEn` y deja constancia en el historial del aspirante mientras el envío aguarda reanudación en la cola. |
| `whatsapp.webhook.recibido` | `whatsapp.webhook.recibido` | `servicioWebhookWhatsApp` (`src/servidor.js`, `EQ-115`) | Suscriptores de mensajería entrante / estados de entrega (HU 4 / futuros consumidores). | Cada notificación verificada con HMAC recibe un `eventId` único y conserva los IDs de mensaje `wamid.*` de Meta en `datos`. | Solo se publica si la firma `X-Hub-Signature-256` sobre el cuerpo crudo es auténtica. |

---

## 3. Fichas Detalladas y Ejemplos JSON

### 3.1. `registro_escolar.solicitud.estado_cambiado` (`BASE-8` · `EQ-13`)
- **Definición y validador:** [src/modulos/registro-escolar/eventos.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/registro-escolar/eventos.js) (`crearEventoEstadoCambiado`, `validarEventoEstadoCambiado`).
- **Regla de negocio:** `motivoRechazo` solo se permite cuando `estadoNuevo` es `CONSTANCIA_RECHAZADA` o `RECHAZADA`.

```json
{
  "eventId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "tipo": "registro_escolar.solicitud.estado_cambiado",
  "version": 1,
  "publicadoEn": "2026-11-26T17:15:00.000Z",
  "datos": {
    "aspiranteId": "asp-002",
    "estadoAnterior": "EN_REVISION",
    "estadoNuevo": "CONSTANCIA_RECHAZADA",
    "fechaCambio": "2026-11-26T17:14:58.000Z",
    "motivoRechazo": "El documento adjunto es ilegible o no cuenta con sello oficial."
  }
}
```

---

### 3.2. `colaboradores.registro.confirmado` (`HU6-9` · `EQ-59` / `HU6-14` · `EQ-61`)
- **Productor:** [confirmar-registro.caso-uso.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/colaboradores/aplicacion/confirmar-registro.caso-uso.js)
- **Consumidor:** [consumidor-registro.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/notificaciones/consumidor-registro.js) (envía el correo de bienvenida sin incluir nunca contraseñas).

```json
{
  "eventId": "evt-reg-9a8b7c6d5e4f",
  "tipo": "colaboradores.registro.confirmado",
  "colaboradorId": "00000260001",
  "nombreCompleto": "Valeria Ochoa Ruiz",
  "correoInstitucional": "valeria.ochoa260001@potros.itson.edu.mx",
  "campus": "Campus Navojoa",
  "carrerasAsignadas": [
    "Ingeniería en Software"
  ],
  "aspirantesAsignados": [
    "asp-014",
    "asp-015",
    "asp-016"
  ],
  "registradoPor": "00000100001",
  "fechaConfirmacion": "2026-11-26T18:00:00.000Z"
}
```

---

### 3.3. `colaboradores.baja.confirmada` (`HU6-10` · `EQ-69` / `HU6-18` / `BASE-9`)
- **Definición y validador:** [src/modulos/colaboradores/eventos.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/colaboradores/eventos.js) (`crearEventoBajaConfirmada`, `validarEventoBajaConfirmada`).
- **Consumidor:** [consumidor-baja.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/notificaciones/consumidor-baja.js) (notifica por correo a cada colaborador en `receptores`).

```json
{
  "eventId": "evt-baja-4f5e6d7c8b9a",
  "tipo": "colaboradores.baja.confirmada",
  "colaboradorId": "00000252115",
  "nombreCompleto": "Sebastián Bórquez Huerta",
  "correoInstitucional": "sebastian.borquez252115@potros.itson.edu.mx",
  "campus": "Campus Obregón Náinari",
  "baja": {
    "indefinida": false,
    "desde": "2026-11-26",
    "hasta": "2027-01-15"
  },
  "receptores": [
    {
      "colaboradorId": "00000252390",
      "nombreCompleto": "Gabriel Cervantes",
      "correoInstitucional": "gabriel.cervantes252390@potros.itson.edu.mx",
      "aspirantesRecibidos": 40,
      "carrerasRecibidas": [
        {
          "campus": "Campus Obregón Náinari",
          "carrera": "Ingeniería en Software",
          "aspirantes": 25
        },
        {
          "campus": "Campus Obregón Náinari",
          "carrera": "Licenciatura en Administración",
          "aspirantes": 15
        }
      ]
    }
  ],
  "realizadoPor": "00000100001",
  "fechaConfirmacion": "2026-11-26T18:30:00.000Z"
}
```

---

### 3.4. `mensajes.configuracion.actualizada` (`HU9-7` · `EQ-108`)
- **Definición y validador:** [src/modulos/mensajes/eventos.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/mensajes/eventos.js) (`crearEventoConfiguracionActualizada`, `validarEventoConfiguracionActualizada`).
- **Consumidor:** [servicio-lectura-configuracion.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/mensajes/aplicacion/servicio-lectura-configuracion.js) (actualiza inmediatamente la configuración consultada por `HU1-5` y `HU1-6`).

```json
{
  "eventId": "3d6f8a20-91b4-4c1e-8e52-71c9a0d12b34",
  "tipo": "mensajes.configuracion.actualizada",
  "version": 1,
  "publicadoEn": "2026-11-26T19:00:00.000Z",
  "datos": {
    "bitacoraId": "8b1e4c92-33f1-4a77-9b10-12a4f5e6d7c8",
    "usuarioId": "00000248910",
    "fechaCambio": "2026-11-26T19:00:00.000Z",
    "valorAnterior": {
      "zonaHoraria": "America/Hermosillo",
      "tiempoEsperaRespuesta": { "valor": 24, "unidad": "horas" },
      "tiempoEsperaContactoPrevio": { "valor": 48, "unidad": "horas" },
      "jornada": {
        "lunes": { "habilitado": true, "inicio": "08:00", "fin": "18:00" },
        "martes": { "habilitado": true, "inicio": "08:00", "fin": "18:00" },
        "miercoles": { "habilitado": true, "inicio": "08:00", "fin": "18:00" },
        "jueves": { "habilitado": true, "inicio": "08:00", "fin": "18:00" },
        "viernes": { "habilitado": true, "inicio": "08:00", "fin": "18:00" },
        "sabado": { "habilitado": false, "inicio": null, "fin": null },
        "domingo": { "habilitado": false, "inicio": null, "fin": null }
      }
    },
    "valorNuevo": {
      "zonaHoraria": "America/Hermosillo",
      "tiempoEsperaRespuesta": { "valor": 36, "unidad": "horas" },
      "tiempoEsperaContactoPrevio": { "valor": 2, "unidad": "dias" },
      "jornada": {
        "lunes": { "habilitado": true, "inicio": "08:00", "fin": "19:00" },
        "martes": { "habilitado": true, "inicio": "08:00", "fin": "19:00" },
        "miercoles": { "habilitado": true, "inicio": "08:00", "fin": "19:00" },
        "jueves": { "habilitado": true, "inicio": "08:00", "fin": "19:00" },
        "viernes": { "habilitado": true, "inicio": "08:00", "fin": "18:00" },
        "sabado": { "habilitado": false, "inicio": null, "fin": null },
        "domingo": { "habilitado": false, "inicio": null, "fin": null }
      }
    }
  }
}
```

---

### 3.5. `disparo.envio.solicitado.<canal>` (`HU1-7` · `EQ-83`)
- **Definición:** [src/modulos/disparo-automatico/eventos.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/disparo-automatico/eventos.js) (`crearEventoEnvioSolicitado`).
- **Routing keys:** `disparo.envio.solicitado.whatsapp` y `disparo.envio.solicitado.correo`.

```json
{
  "eventId": "9f8e7d6c-5b4a-4321-8765-1029384756ab",
  "tipo": "disparo.envio.solicitado",
  "version": 1,
  "publicadoEn": "2026-11-26T16:00:00.000Z",
  "datos": {
    "loteId": "11223344-5566-4777-8888-99aabbccddee",
    "envioId": "9f8e7d6c-5b4a-4321-8765-1029384756ab",
    "colaboradorId": "00000252115",
    "aspiranteId": "asp-001",
    "canal": "WHATSAPP",
    "destino": "+526441000001",
    "mensajeId": "reactivacion-lote-hu1",
    "texto": "Hola Mariana López Soto, notamos que tu solicitud para Ingeniería en Software sigue pendiente...",
    "parametros": [
      "Mariana López Soto",
      "Ingeniería en Software"
    ]
  }
}
```

---

### 3.6. Eventos de Resultado de Envío (`disparo.envio.enviado`, `fallido`, `diferido` · `EQ-85` y `EQ-87`)
- **Definición:** [src/modulos/disparo-automatico/eventos.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/disparo-automatico/eventos.js) (`crearEventoResultadoEnvio`).
- **Consumidor:** [consumir-resultados-envio.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/disparo-automatico/aplicacion/consumir-resultados-envio.js) (suscrito a `disparo.envio.enviado.*`, `disparo.envio.fallido.*` y `disparo.envio.diferido.*`).

#### A. `disparo.envio.enviado.whatsapp`
```json
{
  "eventId": "9f8e7d6c-5b4a-4321-8765-1029384756ab:disparo.envio.enviado",
  "tipo": "disparo.envio.enviado",
  "version": 1,
  "publicadoEn": "2026-11-26T16:00:01.000Z",
  "datos": {
    "loteId": "11223344-5566-4777-8888-99aabbccddee",
    "envioId": "9f8e7d6c-5b4a-4321-8765-1029384756ab",
    "colaboradorId": "00000252115",
    "aspiranteId": "asp-001",
    "canal": "WHATSAPP",
    "destino": "+526441000001",
    "mensajeId": "reactivacion-lote-hu1",
    "texto": "Hola Mariana López Soto...",
    "whatsappMessageId": "wamid.HBgNNTIxNjQ0MTAwMDAwMRUCABIYFjNFQjA...",
    "estadoEntrega": "ENVIADO",
    "intentos": 1,
    "enviadoEn": "2026-11-26T16:00:01.000Z"
  }
}
```

#### B. `disparo.envio.fallido.whatsapp`
```json
{
  "eventId": "9f8e7d6c-5b4a-4321-8765-1029384756ab:disparo.envio.fallido",
  "tipo": "disparo.envio.fallido",
  "version": 1,
  "publicadoEn": "2026-11-26T16:00:05.000Z",
  "datos": {
    "loteId": "11223344-5566-4777-8888-99aabbccddee",
    "envioId": "9f8e7d6c-5b4a-4321-8765-1029384756ab",
    "colaboradorId": "00000252115",
    "aspiranteId": "asp-001",
    "canal": "WHATSAPP",
    "destino": "+526441000001",
    "mensajeId": "reactivacion-lote-hu1",
    "codigo": "DESTINATARIO_INVALIDO",
    "motivo": "El número de teléfono no está registrado en WhatsApp.",
    "intentos": 1,
    "fallidoEn": "2026-11-26T16:00:05.000Z"
  }
}
```

#### C. `disparo.envio.diferido.whatsapp`
```json
{
  "eventId": "9f8e7d6c-5b4a-4321-8765-1029384756ab:disparo.envio.diferido:FUERA_DE_HORARIO",
  "tipo": "disparo.envio.diferido",
  "version": 1,
  "publicadoEn": "2026-11-27T01:00:00.000Z",
  "datos": {
    "loteId": "11223344-5566-4777-8888-99aabbccddee",
    "envioId": "9f8e7d6c-5b4a-4321-8765-1029384756ab",
    "colaboradorId": "00000252115",
    "aspiranteId": "asp-001",
    "canal": "WHATSAPP",
    "destino": "+526441000001",
    "mensajeId": "reactivacion-lote-hu1",
    "codigo": "FUERA_DE_HORARIO",
    "motivo": "Envío pospuesto hasta la siguiente apertura del horario laboral en America/Hermosillo.",
    "reanudaEn": "2026-11-27T15:00:00.000Z",
    "diferidoEn": "2026-11-27T01:00:00.000Z"
  }
}
```
