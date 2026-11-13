# Definiciones de vistas: HU 2 y HU 3

**Tareas:** EQ-26 · HU2-1 y EQ-40 · HU3-1
**Estado:** BORRADOR hecho a partir de los criterios y del desglose. **Falta contrastarlo con el Figma** (no pude abrirlo): los puntos marcados con ☐ son para revisar contra las pantallas.

---

## Parte A · HU2-1: prototipo de la tabla de aspirantes

Lista de lo que debe estar en el prototipo antes de pasar a código (HU2-8 a HU2-11).

### Tabla

- ☐ Columnas: nombre, carrera, preparatoria, período, estado de la solicitud y semáforo (las mismas dimensiones que los filtros de HU2-4).
- ☐ Orden por **un** campo a la vez, con indicador ascendente/descendente en el encabezado.
- ☐ Paginación con el total de resultados.
- ☐ Clic en una fila abre el expediente (HU 3).

### Semáforo

- ☐ Se distingue por **color y también por texto o ícono**, para que no dependa solo del color.
- ☐ Los colores y umbrales dependen de HU2-2 (con el PO). El semáforo mide **inactividad**, no admisión.

### Filtros y controles

- ☐ Búsqueda por nombre (parcial, sin distinguir mayúsculas ni acentos).
- ☐ Filtros por semáforo, carrera, preparatoria, período y estado de la solicitud, combinables.
- ☐ Interruptor «mostrar aspirantes aceptados»: **apagado por defecto**. Pendiente en HU2-2 si oculta por estado «aceptado» o por semáforo verde.
- ☐ Botón para limpiar filtros.

### Estados de la pantalla

| Estado | Qué debe mostrar | ¿Existe en Figma? |
|---|---|---|
| Cargando | Indicador de carga en la tabla | ☐ |
| Error | Mensaje claro y opción de reintentar | ☐ |
| Sin resultados | «No se encontraron resultados» y opción de restablecer filtros | ☐ |
| Con datos | Tabla, filtros y paginación | ☐ |

---

## Parte B · HU3-1: línea de tiempo del expediente

### Datos generales (criterio 1 de HU 3)

Nombre, carrera solicitada, preparatoria de procedencia, **estado de la solicitud**, fecha de solicitud, teléfono y correo electrónico.

> **Término único:** «estado de la solicitud». Es el mismo de HU 2 y de la arquitectura. No usar «estatus de registro escolar» ni «estatus de admisión».

### Eventos de la línea de tiempo

El criterio pide tres tipos de evento, mezclados en una sola lista y ordenados **del más reciente al más antiguo**.

| Tipo | Qué representa | Qué muestra (propuesta) | Ícono sugerido | De dónde viene |
|---|---|---|---|---|
| Mensaje enviado | Mensaje que se envió al aspirante | Fecha y hora, texto o extracto, quién lo envió (supuesto) | Burbuja de chat | Historial de mensajes (esquema Aspirantes) |
| Constancia entregada | Documento que el aspirante entregó | Fecha, nombre o tipo de constancia | Documento con palomita | Historial de constancias (esquema Aspirantes) |
| Motivo de rechazo | Rechazo escolar de la solicitud | Fecha, motivo y estado resultante | Alerta o equis | Evento `registro_escolar.solicitud.estado_cambiado` con `motivoRechazo` (ver `docs/contratos/registro-escolar.md`) |

### Reglas

1. Orden descendente por fecha. **Desempate propuesto** cuando dos eventos tienen la misma fecha y hora: por identificador del evento, también descendente, para que el orden sea estable (lo prueba HU3-9).
2. La línea de tiempo muestra solo los **mensajes enviados**. La conversación completa (enviados y recibidos) se ve en la vista de mensajería.
3. Carga incremental: se muestran los más recientes y se piden más al bajar.
4. Sin eventos: mensaje tipo «Este aspirante aún no tiene movimientos».
5. El botón **Chat** abre la vista de mensajería con la conversación de ese aspirante. En este sprint es de **solo lectura**.
6. Errores: aspirante inexistente (404) o de otro colaborador (403), con opción de regresar a la lista.

### Para contrastar con el Figma

- ☐ ¿Los tres tipos de evento tienen el mismo diseño de tarjeta o uno distinto cada uno?
- ☐ ¿Qué ícono y color usa cada tipo?
- ☐ ¿El texto del mensaje se muestra completo o recortado?
- ☐ ¿Hay pantalla para el expediente sin eventos y para el error 403/404?
- ☐ ¿La palabra «estatus» aparece en alguna pantalla en lugar de «estado de la solicitud»?
