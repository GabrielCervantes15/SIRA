# Contrato del Catálogo de Mensajes (HU 8)

Módulo `src/modulos/mensajes-ia/` (esquema `mensajes`).

**Fuente de datos:** `datos-semilla/mensajes-ia.json`, el catálogo de Gabriel (EQ-98/99): el mismo que
muestra la pantalla de Mensajes y que usa el envío de HU 1. Por decisión del equipo se conserva este
catálogo y la pantalla de Gabriel; el catálogo de EQ-93 (`docs/decisiones/HU8-catalogo-mensajes.md`)
**no** está cargado. Si el PO pide que se use el de EQ-93, basta con reemplazar el JSON y regenerar la semilla SQL.

| Tarea | Historia | Qué cubre |
|---|---|---|
| EQ-95 | HU8-3 | Modelo de datos (dominio + migración 05) y semilla SQL generada desde `mensajes-ia.json` |
| EQ-96 | HU8-4 | `GET /api/v1/mensajes-ia` — lista por categoría |
| EQ-97 | HU8-5 | `GET /api/v1/mensajes-ia/:id` — detalle con vista previa y reglas |
| EQ-100 | HU8-8 | `test/eq100-catalogo-mensajes.test.js` |
| EQ-101 | HU8-9 | `test/eq101-e2e-catalogo-mensajes.test.js` (la aceptación del PO es manual) |

**Acceso:** Administrador y Colaborador, **solo lectura**. Sin sesión → 401.
Cualquier método distinto de GET → 405 `SOLO_LECTURA` con cabecera `Allow: GET`.
Errores: `{ "codigo": "...", "mensaje": "..." }`.

---

## Formato de la semilla y adaptador

Cada mensaje de `mensajes-ia.json` trae `{ id, categoria, llaves, mensaje }` (ids `env-001`…, `res-001`…).
`desdeSemilla` (dominio) completa el modelo **sin alterar el texto ni las llaves**:

| Campo | Cómo se obtiene si el mensaje no lo trae |
|---|---|
| `nombre` | La pregunta de la llave FAQ; si no hay, los valores de las llaves unidos con « · » |
| `pregunta` | Valor de la llave `FAQ` (solo en RESPUESTA) |
| `disparador` | `AUTOMATICO` (ENVIO) o `RESPUESTA` |
| `reglas` | Una por llave: «Aplica cuando semáforo es «Rojo».» / «Se usa para responder la pregunta «…».» |
| `variables` | Las que aparecen en el texto |
| `orden` | Posición dentro de su categoría |

Si un mensaje sí trae `nombre`, `reglas`, etc., se respetan.

**Variables:** `{aspirante}` (nombre del aspirante), `{valor}` y `{magnitud}` (tiempo sin actividad,
p. ej. «3 días»). También se acepta la forma `{{variable}}`.

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
  "totalGeneral": 20,
  "totalCategoria": 10,
  "categorias": {
    "ENVIO": 10,
    "RESPUESTA": 10
  },
  "pagina": 1,
  "tamano": 1,
  "totalPaginas": 10,
  "datos": [
    {
      "id": "env-001",
      "categoria": "ENVIO",
      "nombre": "Rojo · Sin documentos entregados",
      "grupo": null,
      "pregunta": null,
      "disparador": "AUTOMATICO",
      "requierePlantillaMeta": false,
      "llaves": [
        {
          "tipo": "Semáforo",
          "valor": "Rojo"
        },
        {
          "tipo": "Estatus",
          "valor": "Sin documentos entregados"
        }
      ],
      "mensaje": "¡Saludos {aspirante}! Estamos muy contentos de que desees formar parte …"
    }
  ]
}
```

`totalGeneral`, `totalCategoria`, `pagina`, `tamano`, `datos[].llaves` y `datos[].mensaje` son los
campos que usa la pantalla de Mensajes (EQ-98/99); se conservan. Orden: el del archivo, dentro de la categoría.

## `GET /api/v1/mensajes-ia/:id?aspirante=&valor=&magnitud=` (EQ-97)

Detalle de un mensaje. `aspirante`, `valor` y `magnitud` son opcionales y solo cambian la **vista previa**
(máximo 80 caracteres; sin ellos se usan los ejemplos «Ana», «3» y «días»).

```json
{
  "mensaje": {
    "id": "env-004",
    "categoria": "ENVIO",
    "nombre": "Naranja · {valor} {magnitud}",
    "grupo": null,
    "pregunta": null,
    "disparador": "AUTOMATICO",
    "requierePlantillaMeta": false,
    "llaves": [
      {
        "tipo": "Semáforo",
        "valor": "Naranja"
      },
      {
        "tipo": "Tiempo de inactividad",
        "valor": "{valor} {magnitud}"
      }
    ],
    "mensaje": "¡Hola {aspirante}! Han pasado {valor} {magnitud} desde la úl …",
    "canal": "WHATSAPP",
    "plantillaMeta": null,
    "variables": [
      {
        "nombre": "aspirante",
        "descripcion": "Nombre del aspirante"
      },
      {
        "nombre": "valor",
        "descripcion": "Cantidad de tiempo sin actividad"
      },
      {
        "nombre": "magnitud",
        "descripcion": "Unidad de ese tiempo (días, semanas…)"
      }
    ],
    "reglas": [
      "Aplica cuando semáforo es «Naranja».",
      "Aplica cuando tiempo de inactividad es «{valor} {magnitud}»."
    ],
    "vistaPrevia": {
      "texto": "¡Hola Ana! Han pasado 3 días desde la última vez que te cont …",
      "valores": {
        "aspirante": "Ana",
        "valor": "3",
        "magnitud": "días"
      }
    },
    "soloLectura": true
  }
}
```

| Código | `codigo` | Cuándo |
|---|---|---|
| 400 | `ID_INVALIDO` | El id no es de minúsculas, números, `_` y `-` (3 a 60). |
| 400 | `VALOR_DEMASIADO_LARGO` | `aspirante`, `valor` o `magnitud` de más de 80 caracteres. |
| 404 | `NO_ENCONTRADO` | No existe el mensaje. |

La vista previa nunca deja `{{variable}}` sin sustituir: si faltara un valor, `renderizarPlantilla`
lanza `VARIABLE_FALTANTE` (lo reutilizará EQ-84 para personalizar los envíos de HU 1).

---

## Modelo de datos (EQ-95)

`docker/postgres/migrations/05_catalogo_mensajes.sql` (idempotente, probado en PostgreSQL 16):

| Tabla | Contenido |
|---|---|
| `mensajes.catalogo_mensaje` | id, categoría, nombre, orden, grupo, pregunta, disparador, canal, plantilla de Meta, texto, activo |
| `mensajes.catalogo_variable` | variables del texto (`aspirante`, `valor`, `magnitud`) |
| `mensajes.catalogo_llave` | llaves que se muestran en la lista |
| `mensajes.catalogo_regla` | reglas de negocio, en orden |

Restricciones: solo las respuestas llevan `pregunta`; si se requiere plantilla de Meta debe indicarse
su estado (`PENDIENTE`, `ENVIADA`, `APROBADA`, `RECHAZADA`); el `orden` no se repite dentro de una categoría.

**Semilla SQL:** `datos-semilla/05_catalogo_mensajes_semilla.sql` se **genera** desde `mensajes-ia.json`
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
