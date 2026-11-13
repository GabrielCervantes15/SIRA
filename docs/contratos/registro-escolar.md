# Contrato del módulo Registro Escolar

**Tarea:** EQ-13 · BASE-8 · Sprint 1
**Estado:** borrador para revisión del equipo
**Código:** `src/modulos/registro-escolar/` · **Pruebas:** `test/registro-escolar.test.js`

## 1. Propósito

Registro Escolar es un **módulo de integración** de la arquitectura: conecta el CRM con la API de Registro Escolar (REST) y entrega al resto del sistema el **estado de la solicitud** de cada aspirante.

En el Sprint 1 **no se implementa el adaptador real**. El estado viene de los datos semilla (BASE-6) a través de un adaptador simulado que respeta la misma interfaz que tendrá el real, igual que se hace con Autenticación en BASE-7.

## 2. Lugar en la arquitectura

```
API de Registro Escolar  ⇄ REST ⇄  [Módulo de integración: Registro Escolar]
                                              │ publica
                                              ▼
                                   Bus de eventos (RabbitMQ)
                                              │ entrega
                                              ▼
                       Módulo de negocio dueño del esquema Aspirantes
                                              │ guarda estado e historial
                                              ▼
                       Monitoreo lee el estado desde Aspirantes (HU 2 y HU 3)
```

Propuesta: Monitoreo **no** consulta Registro Escolar en cada petición. Lee el estado que ya está guardado en el esquema Aspirantes, que se mantiene actualizado con los eventos.

## 3. Interfaz pública

| Método | Entrada | Salida | Notas |
|---|---|---|---|
| `obtenerEstadoSolicitud(aspiranteId)` | id del aspirante | `EstadoSolicitud` o `null` | `null` si Registro Escolar no tiene la solicitud |
| `obtenerCambiosDesde(desde)` | fecha ISO 8601 | `CambioEstado[]` | Cambios con `fechaCambio >= desde`, del más antiguo al más reciente. Sirve para sincronizar o recuperar eventos perdidos |

Ambos pueden lanzar `ErrorRegistroEscolar` con código `NO_DISPONIBLE` (la API no responde) o `RESPUESTA_INVALIDA` (respuesta con formato inesperado). `obtenerCambiosDesde` lanza `TypeError` si `desde` no es una fecha válida.

### Tipos

**`EstadoSolicitud`**

| Campo | Tipo | Descripción |
|---|---|---|
| `aspiranteId` | texto | Identificador del aspirante |
| `estado` | texto | Uno de los estados del catálogo (ver sección 5) |
| `fechaActualizacion` | texto ISO 8601 UTC | Última actualización del estado |

**`CambioEstado`**

| Campo | Tipo | Descripción |
|---|---|---|
| `aspiranteId` | texto | Identificador del aspirante |
| `estadoAnterior` | texto o `null` | `null` si es el primer estado conocido |
| `estadoNuevo` | texto | Estado al que pasó |
| `fechaCambio` | texto ISO 8601 UTC | Cuándo ocurrió el cambio en Registro Escolar |
| `motivoRechazo` | texto o `null` | Solo cuando `estadoNuevo` es `RECHAZADA` |

## 4. Evento `registro_escolar.solicitud.estado_cambiado`

Se publica cada vez que cambia el estado de la solicitud de un aspirante.

| Elemento | Valor propuesto |
|---|---|
| Exchange | `crm.eventos` (tipo *topic*) |
| Routing key | igual al campo `tipo` del evento |
| Versión | `1` |

```json
{
  "eventId": "3f1c9a52-7d0e-4b1a-9c55-2a4f8e6b1d10",
  "tipo": "registro_escolar.solicitud.estado_cambiado",
  "version": 1,
  "publicadoEn": "2026-11-12T15:30:00Z",
  "datos": {
    "aspiranteId": "asp-001",
    "estadoAnterior": "EN_REVISION",
    "estadoNuevo": "RECHAZADA",
    "fechaCambio": "2026-11-12T15:28:00Z",
    "motivoRechazo": "Constancia de estudios ilegible"
  }
}
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `eventId` | sí | UUID único por evento |
| `tipo` | sí | Siempre `registro_escolar.solicitud.estado_cambiado` |
| `version` | sí | Entero. Hoy es `1` |
| `publicadoEn` | sí | ISO 8601 con zona horaria (UTC recomendado) |
| `datos.aspiranteId` | sí | Texto no vacío |
| `datos.estadoAnterior` | sí | Estado válido o `null` |
| `datos.estadoNuevo` | sí | Estado válido |
| `datos.fechaCambio` | sí | ISO 8601 con zona horaria |
| `datos.motivoRechazo` | no | Texto no vacío. **Solo** si `estadoNuevo` es `RECHAZADA`; en otro caso debe ser `null` |

### Reglas para quien consume el evento

1. **Entrega al menos una vez.** RabbitMQ puede entregar un evento repetido: el consumidor guarda los `eventId` ya procesados y los ignora.
2. **El orden no está garantizado.** Si `fechaCambio` es más antigua que la del estado ya guardado, se registra en el historial pero no sobrescribe el estado actual.
3. **Validar antes de procesar** con `validarEventoEstadoCambiado(evento)`. Si es inválido, se rechaza y se registra el error.
4. **No se emiten eventos cuando el estado no cambia.**
5. **Cambios futuros.** Agregar un campo opcional no cambia `version`. Un cambio incompatible sube a `version: 2`.

## 5. Catálogo de estados (provisional)

`RECIBIDA`, `EN_REVISION`, `ACEPTADA`, `RECHAZADA`. El catálogo definitivo se define con el PO en **HU2-2**. Todo el código importa `ESTADOS_SOLICITUD` en lugar de escribir cadenas, así el cambio se hace en un solo archivo.

Término oficial para la interfaz y la documentación: **«estado de la solicitud»** (no «estatus de registro escolar»).

## 6. Quién usa este contrato

| Quién | Uso |
|---|---|
| Módulo Monitoreo, propietario actual del esquema Aspirantes (definido en BASE-2) | Consume el evento: actualiza el estado y agrega el cambio al historial del expediente. Un rechazo con motivo aparece en la línea de tiempo de HU 3 |
| Monitoreo (HU 2 y HU 3) | Lee el estado desde Aspirantes: columna y filtro de HU 2, y datos generales del expediente de HU 3 |
| Adaptador real (después del Sprint 1) | Implementa la interfaz con la API REST y publica los eventos. Puede usar webhooks o consultas periódicas con `obtenerCambiosDesde` |

## 7. Adaptador simulado (Sprint 1)

`crearRegistroEscolarSimulado({ solicitudes, cambios, bus })` cumple la interfaz con datos en memoria. Para desarrollo y demos agrega dos ayudas que **no** son parte del contrato:

- `simularCambioDeEstado({ aspiranteId, estadoNuevo, motivoRechazo })`: cambia el estado, lo agrega al historial y publica el evento.
- `simularIndisponibilidad(true | false)`: hace que los métodos lancen `NO_DISPONIBLE`, para probar los estados de error del front end.

El bus en memoria (`src/compartido/eventos/bus-en-memoria.js`) sustituye a RabbitMQ y tiene la misma forma (`publicar` / `suscribir`).

```bash
node --test                                  # pruebas
node scripts/demo-registro-escolar.js        # demo con datos semilla
```

## 8. Pendientes por confirmar

| # | Pendiente | Con quién |
|---|---|---|
| 1 | Catálogo definitivo de estados de la solicitud | PO (HU2-2) |
| 2 | Si el motivo de rechazo es obligatorio cuando el estado es `RECHAZADA` | PO |
| 3 | Qué identificador comparten el CRM y Registro Escolar (folio de solicitud, matrícula u otro) | Equipo y Registro Escolar |
| 4 | Nombres definitivos de exchange y routing keys | BASE-3 |
| 5 | | 5 | Resuelto en BASE-2: Monitoreo administra Aspirantes en la arquitectura actual. | BASE-2 |
| 6 | Cómo avisará la API real los cambios: webhook o consulta periódica | Mtro. Borrego / Registro Escolar |
