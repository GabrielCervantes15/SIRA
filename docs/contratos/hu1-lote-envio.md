# Contrato · Lote de envío de HU1 (HU1-7 · EQ-83)

Código: `src/modulos/disparo-automatico/` (`aplicacion/crear-lote-envio.caso-uso.js`, `dominio/lote-envio.js`, `eventos.js`, `infraestructura/`)
Migración: `docker/postgres/migrations/07_lotes_envio.sql` (esquema `disparo`)
Pruebas: `test/eq83-lote-envio.test.js`

## Endpoint

`POST /api/v1/disparo-mensajes/enviar`

| Situación | Respuesta |
|---|---|
| Sin sesión | 401 `SESION_NO_VALIDA` |
| Rol distinto de Colaborador | 403 `SIN_PERMISO` |
| `Idempotency-Key` con formato inválido | 400 `CLAVE_IDEMPOTENCIA_INVALIDA` |
| La misma clave con otros filtros | 422 `CLAVE_IDEMPOTENCIA_REUTILIZADA` |
| Fuera del horario de HU9 | 409 `FUERA_DE_HORARIO_PERMITIDO` (no se crea nada) |
| Filtros inválidos | 400 `FILTROS_INVALIDOS` con `errores` |
| Cero aspirantes aplicables al recalcular | 400 `SIN_ASPIRANTES` |
| El catálogo no tiene el mensaje de reactivación | 409 `MENSAJE_REACTIVACION_NO_DISPONIBLE` |
| Lote creado | 200, `repetido: false` |
| Repetición de un lote ya creado | 200, `repetido: true`, el mismo `loteId` |

**Cuerpo:** `{ semaforos, carreras, inactividadValor, inactividadUnidad, enviarPorCorreo }`, igual que la vista previa (EQ-81).

**Cabecera opcional:** `Idempotency-Key`, de 8 a 100 letras, números, `-` o `_`. El modal de HU1 manda un UUID por intento y lo reutiliza si la petición falla.

### Respuesta

```json
{
  "loteId": "6f1c1f0e-2b7a-4c55-9a41-2c6b8e0f1d23",
  "repetido": false,
  "estado": "CREADO",
  "creadoEn": "2026-11-16T17:00:00.000Z",
  "totalAspirantes": 19,
  "totalEnviados": 19,
  "envios": { "whatsapp": 19, "correo": 19 },
  "noEnviados": { "total": 0, "detalles": [] },
  "correo": { "exitosos": 19, "fallidos": 0, "detalles": [] },
  "estadoHorario": { "permitido": true, "...": "..." }
}
```

- `totalEnviados`: aspirantes con al menos un envío publicado.
- `noEnviados`: aspirantes sin ningún envío, por variable faltante (EQ-84) o sin canal disponible.
- `correo`: se conserva por compatibilidad con el modal. `exitosos` son los correos solicitados y `fallidos` los que no tienen correo válido.

## Qué hace, en orden

Dentro de **una transacción**, con el colaborador bloqueado (en PostgreSQL, `pg_advisory_xact_lock`):

1. **Idempotencia.** Si ya existe un lote con esa clave (o, sin clave, con la misma huella del colaborador y del cuerpo en los últimos 2 minutos), lo devuelve con `repetido: true`. No recalcula ni crea nada.
2. **Horario de HU9.** Se valida con el reloj del servidor.
3. **Recalcula** a los aspirantes aplicables con las reglas de EQ-81. Si son cero, rechaza.
4. **Arma el mensaje** de cada uno con el catálogo de HU8 (EQ-84).
5. **Guarda el lote**, con un envío por aspirante y canal:
   - **WHATSAPP** siempre. Requiere un teléfono con formato internacional (`+` y de 8 a 15 dígitos, como el puerto de WhatsApp).
   - **CORREO** solo si `enviarPorCorreo` es `true`. Requiere un correo válido.
   - Estado `PENDIENTE`, o `NO_ENVIABLE` con `motivo` y `codigoMotivo` (`VARIABLE_FALTANTE` o `CANAL_NO_DISPONIBLE`).
6. **Aparta** (reclama por 30 s) los envíos `PENDIENTE` sin publicar.

Ya confirmada la transacción, publica un evento por cada envío apartado y lo marca como publicado. Si la publicación se corta, lo no publicado se libera, y repetir la petición con la misma clave lo publica. Una petición repetida mientras la primera publica no encuentra nada que apartar, así que no hay eventos duplicados.

## Evento `disparo.envio.solicitado`

Clave de enrutamiento: `disparo.envio.solicitado.whatsapp` o `disparo.envio.solicitado.correo`.

```json
{
  "eventId": "<id del envío>",
  "tipo": "disparo.envio.solicitado",
  "version": 1,
  "publicadoEn": "2026-11-16T17:00:00.000Z",
  "datos": {
    "loteId": "…", "envioId": "…", "colaboradorId": "00000252115", "aspiranteId": "asp-016",
    "canal": "WHATSAPP", "destino": "+526441234567", "mensajeId": "reactivacion_hu1",
    "texto": "Hola, Emilio. Tu proceso de ingreso a Ingeniería en Software todavía puede continuar. …"
  }
}
```

`eventId` es el id del envío. Un consumidor que reciba el mismo evento dos veces debe descartar el repetido por ese id.

## Envío por WhatsApp y resultados (EQ-85)

La cola de envío (`aplicacion/cola-envio-whatsapp.js`) consume `disparo.envio.solicitado.whatsapp` y manda la plantilla por el puerto de BASE-10, con ritmo controlado, reintentos, límite de 24 h y horario de HU9. Las reglas y qué pasa con los pendientes están en `docs/decisiones/HU1-envio-whatsapp.md`.

El evento solicitado incluye `parametros` (valores de `{{1}}`, `{{2}}`… de la plantilla de Meta, en orden: nombre y carrera). Se guardan en `disparo.envio.parametros` (migración 08).

Por cada envío publica, con clave `<tipo>.whatsapp`:

| Evento | Cuándo | Datos además de `loteId`, `envioId`, `colaboradorId`, `aspiranteId`, `canal` |
|---|---|---|
| `disparo.envio.enviado` | Meta aceptó la plantilla | `whatsappMessageId`, `estadoEntrega` (`PENDIENTE` con Cloud API), `intentos`, `texto`, `enviadoEn` |
| `disparo.envio.fallido` | Error permanente, reintentos agotados o pendiente caducado | `codigo`, `motivo`, `codigoProveedor`, `intentos` |
| `disparo.envio.diferido` | Se pospuso por `LIMITE_24H` o `FUERA_DE_HORARIO` (una vez por motivo) | `codigo`, `motivo`, `reanudaEn` |

`eventId` = `<envioId>:<tipo>` (en diferido, con `:<codigo>` al final), para descartar repetidos.

## Consumo de resultados (EQ-87)

`aplicacion/consumir-resultados-envio.js` escucha `disparo.envio.enviado | fallido | diferido` (todos los canales). Código: `test/eq87-resultados-envio.test.js`; migración 09.

| Resultado | Qué hace |
|---|---|
| **Enviado** | Guarda el resultado en el envío del lote. Pide a Monitoreo actualizar la **fecha de última notificación** y sumar uno a `vecesNotificado` (una vez por lote, aunque reciba por dos canales). Registra `MENSAJE_AUTOMATICO` en el historial con canal, fecha y mensaje. Por WhatsApp, deja el mensaje en el Chat (HU3-5). |
| **Fallido** | Guarda el resultado y lo registra en el historial («no enviado» con el motivo). **No** cuenta ni cambia la fecha. |
| **Diferido** | Solo guarda el resultado; después llega enviado o fallido. |

- **No toca la fecha de última actividad** ni el semáforo (EQ-77 §6.3 y §11).
- **Es idempotente:** un resultado repetido, o uno que llega después de un resultado final, se ignora.
- **Decisión del equipo (pendiente en el ticket):** el mensaje enviado también aparece en la conversación del aspirante.
- **Fallos por dato faltante (EQ-84):** también se registran como `MENSAJE_AUTOMATICO` («no enviado»), con `metadatos.resultado = "NO_ENVIABLE"`.

### Conteo del lote

`GET /api/v1/disparo-mensajes/lotes/:loteId`: solo el colaborador que lanzó el lote; si no, 404.

```json
{
  "loteId": "…", "estado": "CREADO", "creadoEn": "…", "filtros": { "…": "…" },
  "totalAspirantes": 19, "notificados": 18, "fallidos": 1, "diferidos": 0, "pendientes": 0, "completo": true,
  "porCanal": { "WHATSAPP": { "enviados": 18, "fallidos": 1, "diferidos": 0, "pendientes": 0, "noEnviables": 0 } }
}
```

Se cuenta **por aspirante**, no por mensaje (EQ-77 §11). Cada aspirante cuenta una sola vez, en este orden:
1. **notificado:** algún canal enviado;
2. **pendiente:** algún canal sin resultado todavía;
3. **diferido:** algún canal diferido;
4. **fallido:** el resto.

`completo` es `true` cuando no quedan pendientes ni diferidos. EQ-89 puede usarlo para mostrar el resultado en el modal.

## Pendiente

- El servidor usa el repositorio **en memoria**, como el resto de los módulos. `RepositorioLotesPostgres` está listo y probado contra PostgreSQL 16, pero falta conectarlo cuando el servidor use base de datos.
- `docker-compose` todavía no monta las migraciones 07 a 09, igual que pasa con la 02 a la 06.
- Consentimiento de WhatsApp (EQ-77 §8.1): el modelo no tiene ese dato. Hoy solo se exige un teléfono válido.
