# Contrato del Catálogo de Mensajes (HU 8)

Módulo `src/modulos/mensajes-ia/` (esquema `mensajes`). Contenido y reglas aprobados por el PO en
EQ-93 (`docs/decisiones/HU8-catalogo-mensajes.md`).

| Tarea | Historia | Qué cubre |
|---|---|---|
| EQ-95 | HU8-3 | Modelo de datos (dominio + migración 05) y semilla (JSON + SQL) |
| EQ-96 | HU8-4 | `GET /api/v1/mensajes-ia` — lista por categoría |
| EQ-97 | HU8-5 | `GET /api/v1/mensajes-ia/:id` — detalle con vista previa y reglas |
| EQ-100 | HU8-8 | `test/eq100-catalogo-mensajes.test.js` |
| EQ-101 | HU8-9 | `test/eq101-e2e-catalogo-mensajes.test.js` (la aceptación del PO es manual) |

**Acceso:** Administrador y Colaborador, **solo lectura** (EQ-93 §2). Sin sesión → 401.
Cualquier método distinto de GET → 405 `SOLO_LECTURA` con cabecera `Allow: GET`.
Errores: `{ "codigo": "...", "mensaje": "..." }`.

---

## Catálogo aprobado (semilla)

| id | Categoría | Disparador | Variables | Plantilla de Meta |
|---|---|---|---|---|
| `saludo_inicial` | ENVIO | AUTOMATICO | nombre, carrera | No |
| `contacto_iniciado_colaborador` | ENVIO | MANUAL | nombre, carrera | Sí (PENDIENTE) |
| `recordatorio_documentacion` | ENVIO | AUTOMATICO_Y_MANUAL | nombre, carrera | Sí (PENDIENTE) |
| `reactivacion_hu1` | ENVIO | LOTE_HU1 | nombre, carrera | Sí, EQ-79 (PENDIENTE) |
| `faq_documentos` | RESPUESTA | RESPUESTA | — | No |
| `faq_examen` | RESPUESTA | RESPUESTA | — | No |
| `faq_validacion` | RESPUESTA | RESPUESTA | — | No |
| `aviso_fuera_horario` | RESPUESTA | AUTOMATICO | — | No |

* Variables con la sintaxis `{{nombre}}` y `{{carrera}}`. Solo existen esas dos.
* Las tres FAQ comparten `grupo: "faq_admision"` (un mensaje por pregunta para poder listarlas).
* Ningún texto fija un horario: el horario se consulta en HU9 (la validación lo impide).
* `datos-semilla/mensajes-ia.json` es el catálogo **provisional anterior**. Ya no lo usa la API;
  solo lo sigue leyendo `disparo-automatico` (HU 1) hasta que EQ-84 cambie a este catálogo.

---

## `GET /api/v1/mensajes-ia?categoria=&semaforo=&busqueda=&pagina=&tamano=` (EQ-96)

| Parámetro | Default | Regla |
|---|---|---|
| `categoria` | `ENVIO` | `ENVIO` o `RESPUESTA` (sin importar mayúsculas). Otro valor → 400 `CATEGORIA_INVALIDA`. |
| `semaforo` | — | Deja los mensajes con esa llave de semáforo (sin acentos ni mayúsculas). |
| `busqueda` | — | Busca en nombre, pregunta y texto (sin acentos ni mayúsculas). |
| `pagina` | 1 | Se ajusta a ≥ 1. |
| `tamano` | 10 | Se ajusta entre 1 y 50. |

```json
{
  "categoria": "ENVIO",
  "totalGeneral": 8,
  "totalCategoria": 4,
  "categorias": { "ENVIO": 4, "RESPUESTA": 4 },
  "pagina": 1, "tamano": 10, "totalPaginas": 1,
  "datos": [{
    "id": "reactivacion_hu1", "categoria": "ENVIO", "nombre": "Reactivación (lote de HU1)",
    "grupo": null, "pregunta": null, "disparador": "LOTE_HU1", "requierePlantillaMeta": true,
    "llaves": [{ "tipo": "Semáforo", "valor": "Rojo" }, { "tipo": "Semáforo", "valor": "Naranja" }, { "tipo": "Lote", "valor": "Reactivación de HU1" }],
    "mensaje": "Hola, {{nombre}}. Tu proceso de ingreso a {{carrera}} todavía puede continuar. …"
  }]
}
```

`totalGeneral`, `totalCategoria`, `pagina`, `tamano`, `datos[].llaves` y `datos[].mensaje` son los
campos que ya usa la pantalla de EQ-98/99; se conservan. Orden: `orden` ascendente dentro de la categoría.

## `GET /api/v1/mensajes-ia/:id?nombre=&carrera=` (EQ-97)

Detalle de un mensaje. `nombre` y `carrera` son opcionales y solo cambian la **vista previa**
(máximo 80 caracteres; sin ellos se usan los ejemplos «Ana» e «Ingeniería en Software»).

```json
{
  "mensaje": {
    "…": "todos los campos de la lista",
    "canal": "WHATSAPP",
    "plantillaMeta": { "referencia": "EQ-79", "estado": "PENDIENTE" },
    "variables": [
      { "nombre": "nombre", "descripcion": "Nombre del aspirante" },
      { "nombre": "carrera", "descripcion": "Carrera solicitada por el aspirante" }
    ],
    "reglas": ["Se usa en los lotes de reactivación de HU1.", "…"],
    "vistaPrevia": {
      "texto": "Hola, Ana. Tu proceso de ingreso a Ingeniería en Software todavía puede continuar. …",
      "valores": { "nombre": "Ana", "carrera": "Ingeniería en Software" }
    },
    "soloLectura": true
  }
}
```

| Código | `codigo` | Cuándo |
|---|---|---|
| 400 | `ID_INVALIDO` | El id no es de minúsculas, números y `_` (3 a 60). |
| 400 | `VALOR_DEMASIADO_LARGO` | `nombre` o `carrera` de más de 80 caracteres. |
| 404 | `NO_ENCONTRADO` | No existe el mensaje. |

La vista previa nunca deja `{{variable}}` sin sustituir: si faltara un valor, `renderizarPlantilla`
lanza `VARIABLE_FALTANTE` (lo reutilizará EQ-84 para personalizar los envíos de HU 1).

---

## Modelo de datos (EQ-95)

`docker/postgres/migrations/05_catalogo_mensajes.sql` (idempotente, probado en PostgreSQL 16):

| Tabla | Contenido |
|---|---|
| `mensajes.catalogo_mensaje` | id, categoría, nombre, orden, grupo, pregunta, disparador, canal, plantilla de Meta, texto, activo |
| `mensajes.catalogo_variable` | variables del texto (solo `nombre` y `carrera`) |
| `mensajes.catalogo_llave` | llaves que se muestran en la lista |
| `mensajes.catalogo_regla` | reglas de negocio, en orden |

Restricciones: solo las respuestas llevan `pregunta`; si se requiere plantilla de Meta debe indicarse
su estado (`PENDIENTE`, `ENVIADA`, `APROBADA`, `RECHAZADA`); el `orden` no se repite dentro de una categoría.

**Semilla SQL:** `datos-semilla/05_catalogo_mensajes_semilla.sql` se **genera** desde el JSON
(`node scripts/generar-semilla-catalogo-mensajes.js`) para que nunca difieran; una prueba lo verifica.
Se puede correr más de una vez.

Para cargarlo a mano:

```
psql -d sira_db -f docker/postgres/migrations/05_catalogo_mensajes.sql
psql -d sira_db -f datos-semilla/05_catalogo_mensajes_semilla.sql
```

`docker-compose.yml` hoy solo monta la migración 01 y su semilla (tampoco monta la 02 a la 04);
agregar las demás es una decisión del equipo.

`RepositorioCatalogoPostgres` implementa el mismo puerto que el de memoria; el servidor sigue usando
el de memoria en este sprint.
