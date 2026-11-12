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
|  - ObtenerConversacionCasoUso (HU3-5)                                   |
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

