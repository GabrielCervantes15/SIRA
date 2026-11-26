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

## Consumidor simulado (temporal)

`infraestructura/consumidor-envio-simulado.js` atiende `disparo.envio.solicitado.whatsapp` y hace lo mismo que hacía antes el endpoint:
- agrega el mensaje a la conversación;
- registra «Mensaje automático de reactivación» en el historial;
- actualiza `vecesNotificado` y `fechaUltimaActividad`.

El correo no hace nada, porque no hay SMTP. `crearServidor({ simularEnvios: false })` lo desactiva.

- **EQ-85** debe sustituir el canal WhatsApp de este consumidor por el puerto de `src/modulos/whatsapp/`.
- **EQ-87** decide qué resultados actualizan la última actividad. EQ-77 §6.3 dice que el mensaje saliente no debería actualizarla.

## Pendiente

- El servidor usa el repositorio **en memoria**, como el resto de los módulos. `RepositorioLotesPostgres` está listo y probado contra PostgreSQL 16, pero falta conectarlo cuando el servidor use base de datos.
- `docker-compose` todavía no monta la migración 07, igual que pasa con la 02 a la 06.
- Consentimiento de WhatsApp (EQ-77 §8.1): el modelo no tiene ese dato. Hoy solo se exige un teléfono válido.
