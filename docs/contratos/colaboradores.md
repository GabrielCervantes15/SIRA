# Contrato del Módulo de Colaboradores (HU 6)

Módulo `src/modulos/colaboradores/` (esquema `usuarios`). Arquitectura hexagonal, igual que Monitoreo.

| Tarea | Historia | Qué cubre |
|---|---|---|
| EQ-55 | HU6-5 | Consultar los datos del colaborador por ID en el directorio (paso 1) |
| EQ-71 | HU6-12 | Listado de colaboradores por campus |
| EQ-64 | HU6-17 | Paso 3: vista previa de la distribución (backend + frontend) |
| EQ-59 | HU6-9 | Confirmar el registro en una transacción |
| EQ-61 | HU6-14 | Consumir el evento del bus y enviar el correo (módulo `notificaciones`) |
| EQ-70 | HU6-11 | Casos especiales: habilitar recepción y transferir expedientes de otros campus con bitácora |

```
ColaboradoresControlador ─► casos de uso ─► IRepositorioColaboradores ─► Memoria | PostgreSQL (EQ-53)
                                    │
                                    ├─► IProveedorAutenticacion (BASE-7, directorio simulado)
                                    ├─► moduloMonitoreo.cartera  (interfaz pública; no toca el esquema aspirantes)
                                    └─► bus de eventos ─► notificaciones (EQ-61)
```

Todas las rutas son **solo para administrador**: 401 sin sesión y 403 con otro rol (`verificarAccesoRol`, EQ-17).
Los errores siempre tienen la forma `{ "codigo": "...", "mensaje": "..." }`.

---

## `GET /api/v1/colaboradores/registro/perfil/:id` (EQ-55)

Paso 1 del registro. Devuelve los datos de solo lectura del directorio, **nunca** credenciales.

```json
{ "perfil": { "idInstitucional": "00000260001", "nombreCompleto": "Valeria Ochoa Ruiz",
  "correoInstitucional": "valeria.ochoa260001@potros.itson.edu.mx", "telefono": "+526449990011",
  "fotoUrl": "https://ad.itson.mx/fotos/00000260001.jpg" } }
```

| Código | `codigo` | Cuándo (en este orden) |
|---|---|---|
| 400 | `ID_INVALIDO` | El ID no tiene de 5 a 20 dígitos. |
| 409 | `YA_REGISTRADO` | El ID ya está registrado en SIRA (activo **o inactivo**). |
| 503 | `SERVICIO_NO_DISPONIBLE` | El directorio no responde. |
| 404 | `ID_NO_ENCONTRADO` | El directorio no conoce el ID. |

## `GET /api/v1/colaboradores?campus=&incluir_inactivos=&busqueda=` (EQ-71)

| Parámetro | Default | Nota |
|---|---|---|
| `campus` | todos | Debe existir en el catálogo; si no, 400 `CAMPUS_INVALIDO`. |
| `incluir_inactivos` | `false` | `true` o `1` los incluye. |
| `busqueda` | — | Parte del nombre; sin acentos ni mayúsculas. |

```json
{
  "colaboradores": [{
    "idInstitucional": "00000252115", "nombreCompleto": "Sebastián Bórquez Huerta",
    "correoInstitucional": "…", "telefono": "…", "fotoUrl": "…",
    "campus": "Campus Obregón Náinari", "carreras": ["Ingeniería en Software", "Licenciatura en Administración"],
    "activo": true, "casosEspeciales": false,
    "fechaRegistro": "2026-08-03T16:00:00.000Z", "totalAspirantes": 40
  }],
  "total": 1,
  "campus": ["Campus Guaymas", "Campus Navojoa", "Campus Obregón Centro", "Campus Obregón Náinari"]
}
```

* Orden: nombre ascendente (sin acentos), luego ID.
* `totalAspirantes` es la cartera completa del colaborador (todas sus carreras y campus), según Monitoreo.
* Si el directorio no responde, el listado sale igual con `nombreCompleto`, `correoInstitucional`, `telefono` y `fotoUrl` en `null`.
* `campus` es el catálogo completo, para los botones de filtro.
* `casosEspeciales` indica si el colaborador puede recibir expedientes procedentes de otros campus. Por defecto es `false`.

## `PATCH /api/v1/colaboradores/:id/casos-especiales` (EQ-70)

Solo administrador. Activa o desactiva la casilla del perfil del colaborador.

Cuerpo:

```json
{ "casosEspeciales": true }
```

Respuesta 200:

```json
{ "actualizado": true, "colaborador": { "idInstitucional": "00000252115", "casosEspeciales": true } }
```

* `casosEspeciales` debe ser booleano; no se aceptan cadenas como `"true"`.
* La casilla inicia desactivada para todos los colaboradores existentes y nuevos.
* Códigos: 400 `ID_INVALIDO` o `CASOS_ESPECIALES_INVALIDO`; 401 sin sesión; 403 si no es administrador; 404 `COLABORADOR_NO_ENCONTRADO`.

## `POST /api/v1/colaboradores/transferencias-manuales` (EQ-70)

Solo administrador. Transfiere un expediente de un campus diferente al campus base del colaborador destino.

Cuerpo:

```json
{ "aspiranteId": "asp-003", "colaboradorDestino": "00000252115" }
```

Respuesta 200:

```json
{
  "transferido": true,
  "transferencia": {
    "aspiranteId": "asp-003",
    "nombreCompleto": "…",
    "campusOrigen": "Campus Obregón Centro",
    "colaboradorOrigen": "00000233231",
    "colaboradorDestino": "00000252115",
    "campusDestino": "Campus Obregón Náinari",
    "motivo": "manual",
    "realizadoPor": "00000100001",
    "fechaTransferencia": "2026-11-25T18:00:00.000Z"
  }
}
```

Reglas:

* El colaborador destino debe existir, estar `activo` y tener `casosEspeciales: true`.
* El campus del expediente debe ser distinto al campus base del colaborador destino.
* El identificador del expediente es el ID interno (`aspiranteId`), no el folio.
* Se actualiza únicamente `aspirantes.aspirantes.colaborador_id`; el historial y la conversación siguen ligados al mismo aspirante y no se pierden.
* Se registra una fila en `usuarios.bitacora_transferencia` con motivo `manual`, responsable anterior, responsable destino y administrador que ejecutó la acción.
* Si la escritura de la bitácora falla, se intenta restaurar el responsable anterior. Si la bitácora no confirma todas las filas en PostgreSQL, la operación se considera fallida y se ejecuta la compensación.

Códigos: 400 `ASPIRANTE_ID_INVALIDO` o `ID_INVALIDO`; 401 sin sesión; 403 si no es administrador; 404 `ASPIRANTE_NO_ENCONTRADO` o `COLABORADOR_DESTINO_NO_ENCONTRADO`; 409 `COLABORADOR_DESTINO_INACTIVO`, `COLABORADOR_SIN_CASOS_ESPECIALES` o `YA_ASIGNADO`; 422 `MISMO_CAMPUS`.

## `POST /api/v1/colaboradores/registro/vista-previa` (EQ-64)

Cuerpo: `{ "idInstitucional": "00000260001", "campus": "Campus Navojoa", "carreras": ["Ingeniería en Software"] }`.
**No modifica nada.** Valida con las mismas reglas y códigos que la confirmación (abajo).

```json
{
  "colaborador": { "idInstitucional": "00000260001", "nombreCompleto": "Valeria Ochoa Ruiz", "…": "…" },
  "campus": "Campus Navojoa",
  "carreras": [{
    "carrera": "Ingeniería en Software", "totalAspirantes": 18, "sinResponsable": 0,
    "responsablesActuales": [
      { "colaboradorId": "00000247933", "nombreCompleto": "Nomar Alberto Limón Quintero", "aspirantes": 11 },
      { "colaboradorId": "00000235352", "nombreCompleto": "Leonel Carballo", "aspirantes": 4 },
      { "colaboradorId": "00000252115", "nombreCompleto": "Sebastián Bórquez Huerta", "aspirantes": 3 }
    ]
  }],
  "totalAspirantes": 18,
  "cargas": [
    { "colaboradorId": "00000260001", "nombreCompleto": "Valeria Ochoa Ruiz", "esNuevo": true, "antes": 0, "despues": 18 },
    { "colaboradorId": "00000252115", "nombreCompleto": "Sebastián Bórquez Huerta", "esNuevo": false, "antes": 40, "despues": 37 }
  ]
}
```

* `cargas[0]` siempre es el colaborador nuevo; después los afectados, de mayor a menor carga actual.
* El frontend solo habilita «Confirmar registro» si lo que va a enviar es **exactamente** lo que se revisó (`puedeConfirmar` en `frontend/colaboradores/validaciones.js`).

## `POST /api/v1/colaboradores/registro` (EQ-59)

También acepta `/registro/confirmar` y el alias heredado `/api/colaboradores/registro`. Mismo cuerpo que la vista previa.

| Código | `codigo` | Cuándo (en este orden) |
|---|---|---|
| 400 | `ID_INVALIDO` | ID no numérico de 5 a 20 dígitos. |
| 409 | `YA_REGISTRADO` | El ID ya está registrado (también si dos altas llegan al mismo tiempo). |
| 400 | `CAMPUS_OBLIGATORIO` / `CAMPUS_INVALIDO` | Falta el campus o no existe. |
| 400 | `CARRERAS_OBLIGATORIAS` / `CARRERA_INVALIDA` | Sin carreras, o alguna no es del campus. |
| 503 / 404 | `SERVICIO_NO_DISPONIBLE` / `ID_NO_ENCONTRADO` | Igual que EQ-55. |
| 201 | — | Registro confirmado. |

Respuesta 201 (sin cambios respecto a la versión anterior en `servidor.js`, para no romper HU6-22):

```json
{
  "confirmado": true,
  "colaborador": { "idInstitucional": "…", "nombreCompleto": "…", "correoInstitucional": "…", "telefono": "…",
                   "campus": "…", "rol": "colaborador", "activo": true, "carrerasAsignadas": ["…"] },
  "asignacion": { "campus": "…", "carreras": ["…"], "totalAspirantesAsignados": 18, "aspirantesIds": ["…"] },
  "evento": { "eventId": "evt-reg-…", "tipo": "colaboradores.registro.confirmado", "…": "…" }
}
```

### Transacción (todo o nada)

1. Valida y consulta el directorio (fuera de la transacción).
2. `repositorio.transaccion(tx => …)`:
   1. vuelve a revisar `tx.existe(id)` (dentro del bloqueo, evita dobles altas);
   2. `tx.guardar(...)` → `usuarios.usuario` + `usuarios.colaborador_carrera`;
   3. `cartera.asignarCarreras(...)` → Monitoreo reasigna los aspirantes del campus/carreras;
   4. `tx.registrarTransferencias(...)` → `usuarios.bitacora_transferencia` (motivo `alta`).
3. Si cualquier paso falla (incluido el `COMMIT`): se revierte `usuarios` y se llama a `deshacer()` de la cartera
   (compensación, porque `aspirantes` es otro esquema y no entra en la misma transacción). No se publica nada.
4. Ya confirmado: se borra el borrador y se publica el evento. Si el bus falla, el registro **no** se revierte (se registra el error).

En memoria, `transaccion` serializa las llamadas y restaura una instantánea si `fn` falla.
En PostgreSQL usa un cliente del pool con `BEGIN` / `COMMIT` / `ROLLBACK`.

### EQ-70: consistencia de la transferencia manual

La transferencia manual modifica la cartera a través de la interfaz pública de Monitoreo y después registra el motivo `manual` en `usuarios.bitacora_transferencia`. Como los adaptadores pueden estar en esquemas/repositorios distintos, la aplicación conserva una función `deshacer()` para compensar el cambio de `colaborador_id` si falla la bitácora. En PostgreSQL el INSERT de bitácora usa `RETURNING` y valida que se haya insertado una fila por cada transferencia.

La tabla `usuarios.usuario` requiere la columna `casos_especiales BOOLEAN NOT NULL DEFAULT FALSE`. Ejecutar `docker/postgres/migrations/06_casos_especiales_transferencias.sql` después de que exista la tabla `usuarios.usuario` creada por EQ-53. El administrador que ejecuta la transferencia y el colaborador destino deben existir en `usuarios.usuario`, como requiere la bitácora de EQ-53.

---

## Evento `colaboradores.registro.confirmado` → correo (EQ-61)

```json
{ "eventId": "evt-reg-…", "tipo": "colaboradores.registro.confirmado", "colaboradorId": "00000260001",
  "nombreCompleto": "…", "correoInstitucional": "…", "campus": "…", "carrerasAsignadas": ["…"],
  "aspirantesAsignados": ["…"], "registradoPor": "00000100001", "fechaConfirmacion": "2026-11-24T17:00:00.000Z" }
```

`src/modulos/notificaciones/consumidor-registro.js`:

* Envía el correo de bienvenida al `correoInstitucional`, con campus, carreras, número de aspirantes y la URL de SIRA (`SIRA_URL_PUBLICA`, default `http://localhost:3000`). **Nunca** incluye contraseñas.
* **Idempotente** por `eventId` (una reentrega de RabbitMQ no manda dos correos).
* **Reintenta** fallos temporales (`reintentable: true`) hasta 3 veces con espera creciente; un destinatario inválido no se reintenta.
* Lo que no se pudo mandar queda en `fallidos()` y puede reprocesarse si el evento se vuelve a entregar.
* No frena la respuesta HTTP: el envío corre aparte (`esperarPendientes()` existe para pruebas y apagado).
* En el Sprint 1 el correo es simulado: la bandeja está en `servidor.modulos.notificaciones.servicioCorreo.bandeja()`.

---

## PostgreSQL: tablas de EQ-53 (`Tablas.sql`)

Probado en PostgreSQL 16. Las consultas de `RepositorioColaboradoresPostgres` corren contra estas tablas.
Hallazgos al probarlo:

1. **`bitacora_transferencia.aspirante_id` es `BIGINT`**, pero los ids de `aspirantes.aspirantes` son `VARCHAR(50)` (`'asp-001'`).
   El INSERT falla (`column "aspirante_id" is of type bigint but expression is of type text`). Con
   `aspirante_id VARCHAR(50) NOT NULL` funciona.
2. **El script no se puede correr dos veces**: `CREATE TYPE usuarios.rol` falla con `type "rol" already exists`.
   Conviene envolver los `CREATE TYPE` en `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
   y usar `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, como las migraciones 01–04.
3. `campus_id` y `carrera_id` son `SMALLINT` sin catálogo en `usuarios` (correcto según BASE-5: sin FKs entre esquemas).
   Por eso el adaptador recibe `catalogoIds` para traducir nombre ↔ id.
4. `realizado_por` es `NOT NULL`: el administrador que confirma también debe existir en `usuarios.usuario`.
