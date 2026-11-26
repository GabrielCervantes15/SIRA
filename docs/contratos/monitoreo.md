# Contrato y Arquitectura del Módulo de Monitoreo

## 1. Visión General (Clean Architecture / Puertos y Adaptadores)

El módulo `Monitoreo` implementa el patrón de **Puertos y Adaptadores (Arquitectura Hexagonal)** en un **Monolito Modular** en Node.js ESM. La lógica de negocio no depende de una tecnología de base de datos específica ni de APIs externas.

```
+-------------------------------------------------------------------------+
|                              CONTROLADOR                                |
|  MonitoreoControlador (HTTP REST en /api/monitoreo/...)                 |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                          CASOS DE USO (APLICACIÓN)                      |
|  - ObtenerFiltrosCasoUso (HU2-7)                                        |
|  - ListarAspirantesCasoUso (HU2-4)                                      |
|  - ObtenerDetalleAspiranteCasoUso (HU3-3 / EQ-42)                       |
|  - ObtenerConversacionCasoUso (HU3-5)                                   |
|  - ObtenerHistorialAspiranteCasoUso (HU3-6 / EQ-43)                     |
+------------------------------------+------------------------------------+
                                     |
                                     v (Dependencia invertida)
+-------------------------------------------------------------------------+
|                           PUERTO DE DOMINIO                             |
|  IRepositorioMonitoreo:                                                 |
|    - obtenerFiltrosColaborador(colaboradorId)                           |
|    - listarAspirantes(filtros)                                          |
|    - obtenerAspirantePorId(id)                                          |
|    - obtenerConversacionAspirante(aspiranteId)                          |
|    - obtenerHistorialAspirante(aspiranteId, { desde, hasta })           |
|    - registrarActividad(evento)                                         |
+-------------------+---------------------------------+-------------------+
                    |                                 |
                    v (Sprint 1)                      v (Producción / BD)
+-----------------------------------+   +---------------------------------+
|   RepositorioMonitoreoMemoria     |   |   RepositorioMonitoreoPostgres  |
|   (Datos semilla JSON / memoria)  |   |   (PostgreSQL: aspirantes.*)    |
+-----------------------------------+   +---------------------------------+
```

---

## 2. Endpoints Implementados

### `GET /api/monitoreo/filtros` (HU2-7)
Devuelve las opciones para llenar los menús desplegables del panel de búsqueda en el frontend:
* **Carreras:** Únicamente las asignadas al colaborador autenticado (según esquema `usuarios.colaborador_carrera`).
* **Catálogos generales:** Preparatorias, períodos de admisión, estados de la solicitud y semáforos (`Verde`, `Amarillo`, `Naranja`, `Rojo`).

### `GET /api/monitoreo/aspirantes` (HU2-4)
Devuelve la lista paginada y filtrada de aspirantes de la cartera del colaborador autenticado:
* **Filtro obligatorio:** Solo aspirantes donde `colaborador_id = :colaboradorId`.
* **Filtros combinables (Query Params):**
  * `nombre`: Búsqueda parcial insensible a mayúsculas y acentos (unaccent).
  * `semaforo`: Color del semáforo (`VERDE`, `AMARILLO`, `ROJO`).
  * `carrera`: Carrera solicitada.
  * `preparatoria`: Preparatoria de procedencia.
  * `periodo`: Período de admisión (ej. `2027-1`).
  * `estado_solicitud`: Estado de la solicitud (`RECIBIDA`, `EN_REVISION`, `ACEPTADA`, `RECHAZADA`).
  * `mostrar_aceptados`: Interruptor (`false` oculta aspirantes aceptados; `true` o ausente los incluye).
  * `limit` y `offset`: Paginación.
  * `ordenar_por` y `orden_direccion`: Ordenamiento por columna (`ASC` / `DESC`).

### `GET /api/monitoreo/aspirantes/:id` (HU3-3 / EQ-42)
Detalle del expediente de un aspirante de la cartera del colaborador autenticado. También responde en `/api/v1/monitoreo/...`. `:id` acepta el id interno o el folio de solicitud.

**Respuesta 200**
```json
{
  "aspirante": {
    "id": "asp-001",
    "nombreCompleto": "…",
    "carreraSolicitada": "Ingeniería en Software",
    "preparatoriaProcedencia": "CBTIS 37",
    "estadoSolicitud": "EN_REVISION",
    "fechaSolicitud": "2026-10-15T09:00:00Z",
    "telefono": "+52…",
    "correo": "…",
    "semaforo": "ROJO"
  }
}
```
* `preparatoriaProcedencia`, `telefono` y `correo` pueden ser `null`.
* **No** se devuelve `colaboradorId` (el expediente no expone a quién está asignado).

| Código | `codigo` | Cuándo |
|---|---|---|
| 200 | — | El aspirante existe y es de la cartera del colaborador. |
| 400 | `PARAMETRO_INVALIDO` | El `:id` no se puede decodificar. |
| 401 | `NO_AUTORIZADO` | No hay sesión. |
| 403 | `SIN_PERMISO` | El aspirante existe pero pertenece a otro colaborador. |
| 404 | `NO_ENCONTRADO` | No existe un aspirante con ese id o folio. |

El orden de validación es 401 → 404 → 403.

### `GET /api/monitoreo/aspirantes/:id/actividades?desde=&hasta=` (HU3-6 / EQ-43)
Historial de actividades del aspirante (tabla `aspirantes.historial_eventos`): mensajes enviados, constancias entregadas, cambios de estado, rechazos y notas de seguimiento.

**Query params (opcionales)**
* `desde`, `hasta`: fecha ISO 8601 (`2026-10-18T12:00:00Z`) o solo fecha (`2026-10-18`). El rango es **inclusivo**. Si `hasta` es solo fecha, cubre hasta las 23:59:59.999 UTC de ese día. Sin parámetros se devuelve todo el historial.

**Respuesta 200**
```json
{
  "actividades": [
    { "id": "a1000000-…-0002", "tipo": "MENSAJE_ENVIADO", "fecha": "2026-10-16T10:05:00.000Z", "texto": "Envío de Bienvenida Automatizado — Mensaje de WhatsApp informativo…" }
  ],
  "total": 1
}
```
* **Orden:** del más reciente al más antiguo; con la misma fecha, por `id` descendente.
* `tipo`: `MENSAJE_ENVIADO`, `CONSTANCIA_ENTREGADA`, `CAMBIO_ESTADO`, `RECHAZO_SOLICITUD`, `NOTA_SEGUIMIENTO` o `MENSAJE_AUTOMATICO` (lote de HU1, EQ-87: «Mensaje automático enviado por WhatsApp — <mensaje>» o «Mensaje automático no enviado por WhatsApp — <motivo>»).
* `texto`: `titulo — detalle` (o solo `titulo` si no hay detalle).
* `fecha`: siempre ISO 8601 en UTC.
* `total`: número de actividades devueltas (después de aplicar el rango).

| Código | `codigo` | Cuándo |
|---|---|---|
| 200 | — | Consulta correcta (la lista puede venir vacía). |
| 400 | `PARAMETRO_INVALIDO` | `desde`/`hasta` mal formados, `desde` > `hasta`, o `:id` no decodificable. |
| 401 | `NO_AUTORIZADO` | No hay sesión. |
| 403 | `SIN_PERMISO` | El aspirante pertenece a otro colaborador. |
| 404 | `NO_ENCONTRADO` | El aspirante no existe. |

El orden de validación es 401 → 404 → 403 → 400 (rango).

Cuando el colaborador envía un mensaje (`POST /api/monitoreo/aspirantes/:id/conversacion`), se registra un evento `MENSAJE_ENVIADO` con `repositorio.registrarActividad(...)`, así que aparece de inmediato en este historial.

### Notificaciones del lote de HU1 (EQ-87)

El módulo de disparo pide a Monitoreo, por su repositorio y sin escribir en el esquema `aspirantes`:

| Método | Qué hace |
|---|---|
| `registrarNotificacion({ aspiranteId, fecha, contar })` | Guarda la **fecha de última notificación** (se queda la más reciente) y, si `contar`, suma una a `vecesNotificado`. **No toca `fechaUltimaActividad`.** |
| `registrarMensajeConversacion(mensaje)` | Agrega un mensaje a la conversación (HU3-5); un `id` repetido se ignora. |
| `registrarActividad(evento)` | Acepta además `metadatos` (en el evento automático: canal, lote, envío, resultado y `whatsappMessageId`). |

Campos nuevos del aspirante (migración 09):
- `fechaUltimaNotificacion`: último mensaje saliente enviado correctamente; con ella empieza la espera de 48 h de HU9.
- `vecesNotificado`: lotes en los que recibió al menos un mensaje.

Por EQ-77 §6.3, un mensaje saliente **no** es actividad del aspirante: la columna «Última actividad» y el semáforo no cambian al enviarle un mensaje automático.

### Orden de la lista por semáforo (EQ-48)
`ordenar_por=semaforo` ordena por **severidad** (`ROJO` > `NARANJA` > `AMARILLO` > `VERDE`), no alfabéticamente:
`DESC` muestra primero a quien más atención necesita. En todas las columnas los empates se resuelven por `id`,
así que paginar no repite ni pierde aspirantes, y los valores vacíos van al final en ambas direcciones.

### Interfaz pública `cartera` (para HU 6)
`crearModuloMonitoreo()` expone `cartera`, que usa el módulo Colaboradores sin tocar el esquema `aspirantes`:

| Método | Devuelve |
|---|---|
| `idInstitucionalDe(colaboradorId)` | ID institucional canónico (resuelve alias de semilla como `colab-001`). |
| `contarPorColaborador()` | `{ [idInstitucional]: totalAspirantes }` |
| `previsualizarAsignacion({ campus, carreras })` | `[{ aspiranteId, carrera, colaboradorActual }]` sin modificar nada. |
| `asignarCarreras({ colaboradorId, campus, carreras })` | `{ aspirantesIds, transferencias, deshacer() }` |
| `obtenerAspirantePorId(id)` | Expediente actual por ID o folio |
| `transferirAspiranteManual({ aspiranteId, colaboradorDestino })` | Cambio individual de responsable y `deshacer()` para compensación |

---

## 3. Transición a Base de Datos PostgreSQL

Cuando el contenedor o la instancia de PostgreSQL esté conectada, el adaptador `RepositorioMonitoreoPostgres` implementará la misma interfaz `IRepositorioMonitoreo`. La consulta SQL equivalente para `listarAspirantes` mapea directamente a:

```sql
SELECT 
    id,
    folio_solicitud AS "folioSolicitud",
    nombre_completo AS "nombreCompleto",
    correo,
    telefono,
    campus,
    carrera_solicitada AS "carreraSolicitada",
    preparatoria_procedencia AS "preparatoriaProcedencia",
    periodo,
    fecha_solicitud AS "fechaSolicitud",
    estado_solicitud AS "estadoSolicitud",
    semaforo,
    colaborador_id AS "colaboradorId",
    fecha_ultima_actividad AS "fechaUltimaActividad"
FROM aspirantes.aspirantes
WHERE colaborador_id = $1
  AND ($2::text IS NULL OR aspirantes.norm(nombre_completo) LIKE '%' || aspirantes.norm($2) || '%')
  AND ($3::text IS NULL OR lower(semaforo) = lower($3))
  AND ($4::text IS NULL OR lower(carrera_solicitada) = lower($4))
  AND ($5::text IS NULL OR lower(preparatoria_procedencia) = lower($5))
  AND ($6::text IS NULL OR lower(periodo) = lower($6))
  AND ($7::text IS NULL OR lower(estado_solicitud) = lower($7))
  AND ($8::boolean IS TRUE OR lower(estado_solicitud) != 'aceptada')
ORDER BY 
  CASE WHEN $9 = 'nombre' AND $10 = 'ASC' THEN aspirantes.norm(nombre_completo) END ASC,
  CASE WHEN $9 = 'nombre' AND $10 = 'DESC' THEN aspirantes.norm(nombre_completo) END DESC,
  CASE WHEN $9 = 'fechaSolicitud' AND $10 = 'ASC' THEN fecha_solicitud END ASC,
  CASE WHEN $9 = 'fechaSolicitud' AND $10 = 'DESC' THEN fecha_solicitud END DESC
LIMIT $11 OFFSET $12;
```

Gracias a la inyección de dependencias en `crearModuloMonitoreo({ repositorio })`, sustituir la memoria por PostgreSQL requerirá únicamente pasar la nueva instancia en la configuración del servidor, sin modificar una sola línea de controladores o casos de uso.

