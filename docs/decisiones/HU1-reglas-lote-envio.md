# HU1 — Reglas del lote de envío

**Proyecto:** SIRA — CRM de Seguimiento de Aspirantes
**Ticket de definición:** EQ-77 — [HU1-1] Definir con el PO las reglas del lote de envío
**Historia padre:** EQ-74 — HU 1: Disparo de mensajes automáticos
**Product Owner:** Nomar
**Fecha de aprobación:** 19/11/2026
**Versión:** 1.0
**Estado:** Definición funcional aprobada por el PO

---

## 1. Objetivo

Definir las reglas funcionales para determinar qué aspirantes pueden incluirse en un lote manual de reactivación de HU1, cómo se calculan los filtros de elegibilidad, qué canales pueden utilizarse y qué restricciones aplican al envío.

Este documento es la referencia funcional para los tickets técnicos de HU1. No sustituye las configuraciones ni los contratos públicos de otros módulos.

## 2. Decisiones aprobadas por el PO

El 19/11/2026, el PO aprobó las siguientes decisiones:

| N.º | Tema | Decisión |
|---:|---|---|
| 1 | Semáforo | Representa exclusivamente el nivel de inactividad, no el estado de admisión. |
| 2 | Estados excluidos | Se excluyen solicitudes ACEPTADAS y RECHAZADAS definitivamente. |
| 3 | Inactividad mínima | Valor inicial de 7 días; el colaborador puede modificarlo al preparar el lote. |
| 4 | Última actividad | Se consideran respuestas entrantes, entrega de documentos y cambios reales del estado de admisión. |
| 5 | Canales | WhatsApp y correo son independientes. Se requiere al menos un canal disponible y habilitado. |
| 6 | Correo | La casilla «Enviar por correo» está desactivada por defecto. |
| 7 | Fuera de horario | Se permite consultar y preparar el lote, pero no enviarlo fuera del horario permitido. |

## 3. Criterios de elegibilidad

Un aspirante puede formar parte de la vista previa del lote cuando cumple todas estas condiciones:

1. Pertenece a la cartera del colaborador autenticado.
2. Su semáforo es distinto de VERDE.
3. Su solicitud no está ACEPTADA ni RECHAZADA definitivamente.
4. Cumple el mínimo de inactividad seleccionado para ese lote.
5. No se encuentra dentro del periodo de exclusión de 48 horas por contacto previo definido en HU9.
6. Tiene al menos un canal válido y habilitado para el envío.

Si no cumple una condición obligatoria, no se incluye en el lote.

La cartera se determina en el servidor a partir de la identidad autenticada. El frontend no puede elegir ni sustituir el identificador del colaborador para consultar aspirantes de otra cartera.

## 4. Semáforo: inactividad, no estado de admisión

El semáforo representa exclusivamente la inactividad del aspirante:

| Nivel | Significado funcional para HU1 |
|---|---|
| VERDE | Actividad reciente. Se excluye del lote. |
| AMARILLO | Nivel intermedio de inactividad. Puede ser elegible. |
| NARANJA | Nivel intermedio de inactividad. Puede ser elegible. |
| ROJO | Nivel elevado de inactividad. Puede ser elegible. |

Reglas:

- HU1 excluye siempre el nivel VERDE.
- AMARILLO, NARANJA y ROJO son niveles seleccionables.
- El estado de admisión se evalúa por separado y no determina el color del semáforo.
- Los umbrales numéricos de cada color se toman de la definición aprobada de EQ-27; EQ-77 no crea umbrales nuevos ni los sustituye.
- Antes de implementar, se debe comprobar que el código y el contrato de Monitoreo reflejen la definición aprobada de EQ-27. En el código revisado, `src/modulos/monitoreo/semaforo.js` todavía se identifica como provisional y calcula el color con el estado de solicitud y el contacto iniciado.

## 5. Estados de solicitud

HU1 excluye:

- `ACEPTADA`.
- `RECHAZADA` definitivamente.

Los demás estados pueden evaluarse para inclusión en el lote, siempre que cumplan todos los criterios de elegibilidad.

La exclusión por estado es independiente del semáforo. Por ejemplo:

- Una solicitud ACEPTADA se excluye aunque su semáforo sea ROJO.
- Una solicitud RECHAZADA definitivamente se excluye aunque su semáforo sea ROJO.
- Una solicitud que todavía puede continuar o corregirse no se excluye únicamente por tener una incidencia documental; se evalúa con los demás criterios.

Esta regla aplica al lote HU1. No modifica por sí sola el comportamiento general del interruptor de aspirantes aceptados de HU2/EQ-30.

## 6. Inactividad mínima y última actividad

### 6.1 Valor inicial y filtros

- El valor inicial del filtro es **7 días**.
- El filtro es obligatorio.
- El colaborador puede modificar el valor al preparar cada lote.
- Se conservan las unidades previstas en EQ-81 y EQ-88: días, semanas y meses.
- El valor debe ser positivo.
- La vista previa debe recalcularse cuando cambie el valor o la unidad.

La regla funcional es incluir únicamente aspirantes cuya última actividad cumpla el tiempo mínimo seleccionado.

EQ-81 debe convertir el valor y la unidad a una fecha de corte de forma consistente. La equivalencia técnica de «mes» y el tratamiento exacto del límite temporal deben quedar documentados en la implementación y sus pruebas; EQ-77 no establece que un mes equivalga a 30 días.

### 6.2 Eventos que actualizan la última actividad

Se consideran actividad del aspirante:

- Un mensaje o respuesta entrante enviado por el aspirante.
- La entrega de documentación por parte del aspirante.
- Un cambio real del estado de admisión registrado por Registro Escolar.

### 6.3 Eventos que no actualizan la última actividad

No actualizan la fecha de última actividad académica:

- Mensajes salientes de SIRA.
- Mensajes enviados manualmente por el colaborador.
- Notificaciones internas.
- Recordatorios automáticos.
- Intentos de envío fallidos.

El envío saliente debe registrarse como contacto, pero no debe reiniciar la inactividad académica ni modificar el semáforo.

## 7. Exclusión por contacto previo: HU9

Se conserva la regla aprobada en EQ-102:

- **Valor inicial:** 48 horas.
- **Inicio del contador:** último mensaje saliente enviado correctamente por un colaborador o por SIRA.
- Mientras no hayan transcurrido las 48 horas, el aspirante queda excluido de los lotes HU1.
- Cada nuevo mensaje saliente exitoso reinicia este periodo.
- Al cumplirse las 48 horas, el aspirante vuelve a evaluarse con todos los criterios de elegibilidad de HU1.
- Cuando vuelve a ser elegible, SIRA genera una notificación interna para el colaborador asignado.
- La notificación interna no equivale a enviar un mensaje al aspirante.
- La notificación debe evitar duplicados mientras el aspirante permanezca en el mismo estado de elegibilidad.
- El vencimiento de las 48 horas no crea ni envía un lote automáticamente; la inclusión requiere la acción del colaborador.

Las 48 horas son independientes del filtro de inactividad mínima de 7 días.

También son independientes del tiempo máximo de espera de respuesta y de la ventana de atención de WhatsApp definidos en HU8/HU9. No deben reutilizarse como un único contador.

## 8. Canales de comunicación

### 8.1 WhatsApp

Para que WhatsApp esté disponible en un lote se requiere:

- Número telefónico válido.
- Evidencia verificable de autorización del aspirante para recibir comunicaciones proactivas por WhatsApp.
- Que la autorización no esté revocada.

Tener un número telefónico registrado no equivale a tener consentimiento.

Si falta el teléfono, no es válido o no existe autorización verificable vigente, WhatsApp no puede utilizarse para ese aspirante.

La modalidad de mensaje (mensaje normal o plantilla aprobada por Meta) debe respetar la ventana de WhatsApp definida en HU8.

### 8.2 Correo electrónico

- La casilla «Enviar por correo» está desactivada por defecto.
- El colaborador decide si habilita el envío por correo en el lote.
- Se requiere una dirección de correo válida.
- Si no existe correo válido, se registra el motivo y el canal WhatsApp puede continuar si está disponible.

### 8.3 Independencia de los canales

| Situación | Resultado |
|---|---|
| WhatsApp disponible y correo habilitado con dirección válida | Se procesan ambos canales. |
| WhatsApp disponible y correo deshabilitado | Se procesa WhatsApp. |
| WhatsApp no disponible y correo habilitado con dirección válida | Se procesa correo. |
| Un canal falla y el otro está habilitado | El otro canal continúa de forma independiente. |
| Ningún canal está disponible o habilitado | El aspirante se excluye del lote. |

Los resultados, fallos y motivos se registran por canal. Un fallo en un canal no debe invalidar un envío exitoso en el otro.

## 9. Filtros de la pantalla de HU1

La pantalla debe contemplar:

### 9.1 Semáforo

- Selección múltiple.
- VERDE no se ofrece como opción elegible.
- AMARILLO, NARANJA y ROJO se seleccionan inicialmente.
- El colaborador puede desmarcar niveles.
- Debe permanecer al menos un nivel seleccionado.

### 9.2 Carrera

- Selección múltiple.
- Solo se muestran carreras correspondientes a la cartera del colaborador autenticado.
- Las opciones disponibles se seleccionan inicialmente, conforme a EQ-88.
- El colaborador puede desmarcar carreras.
- Debe permanecer al menos una carrera seleccionada.

### 9.3 Inactividad mínima

- Campo numérico con valor inicial 7.
- Unidad inicial: días.
- Unidades disponibles: días, semanas y meses.
- El colaborador puede modificar el valor y la unidad para preparar el lote.

### 9.4 Enviar por correo

- Casilla desactivada por defecto.
- Al activarla, se agrega el correo como canal adicional cuando existe una dirección válida.
- No sustituye ni habilita el consentimiento requerido para WhatsApp.

### 9.5 Vista previa

- El conteo se actualiza cuando cambian los filtros.
- El conteo representa aspirantes únicos aplicables, no la suma de mensajes por canal.
- Si el conteo es cero, se deshabilita «Enviar» y se informa que ningún aspirante cumple las condiciones.

## 10. Horario de envío y comportamiento fuera de horario

La jornada y el horario permitido se consultan desde la interfaz pública de lectura de HU9 (EQ-105). No deben duplicarse ni codificarse de forma independiente en HU1.

Configuración inicial documentada en EQ-102:

| Día | Jornada inicial |
|---|---|
| Lunes a viernes | 08:00–18:00 |
| Sábado y domingo | Deshabilitados |

Zona horaria institucional: `America/Hermosillo`.

La jornada es configurable por día en HU9; los valores anteriores son los iniciales y no deben quedar fijados como constantes de HU1.

### Fuera del horario permitido

El colaborador puede:

- Acceder al módulo.
- Consultar aspirantes.
- Modificar filtros.
- Consultar la vista previa y el conteo.

El colaborador no puede:

- Confirmar ni ejecutar el envío fuera del horario permitido.

Comportamiento de la interfaz y del servidor:

- El botón «Enviar» permanece deshabilitado.
- Se muestra un aviso claro de que el envío está fuera de horario.
- El servidor vuelve a validar el horario antes de aceptar el envío; no basta con deshabilitar el botón en frontend.
- El lote manual no se programa automáticamente para el siguiente horario.
- El colaborador debe volver durante el horario permitido y confirmar el envío.

Esta regla se refiere al lote manual de HU1. No modifica la regla de HU9 para mensajes automáticos que vencen fuera de jornada: esos mensajes automáticos conservan el comportamiento de programación al siguiente inicio de jornada habilitada definido en EQ-102.

## 11. Revalidación y resultados del envío

Al confirmar el envío, el servidor debe volver a evaluar los criterios de elegibilidad y el horario vigente. No debe confiar únicamente en el conteo calculado previamente en frontend.

Por cada canal se debe registrar, como mínimo:

- Aspirante.
- Canal utilizado.
- Fecha y hora del intento.
- Resultado del envío.
- Motivo del fallo, cuando corresponda.
- Mensaje o referencia al mensaje enviado, conforme al modelo de historial.

Los envíos exitosos actualizan el registro de último contacto saliente exitoso y el periodo de 48 horas de HU9.

Los envíos fallidos se registran, pero no se consideran contactos exitosos y no deben reiniciar el periodo de 48 horas.

**Importante:** ningún mensaje saliente debe actualizar la fecha de última actividad académica del aspirante. EQ-87 debe distinguir el registro de contacto saliente de la fecha de última actividad académica y del historial del aspirante.

Los resultados de WhatsApp y correo se procesan independientemente. El conteo de aspirantes notificados debe seguir el criterio que establezca EQ-87, sin confundir aspirantes únicos con intentos o mensajes por canal.

## 12. Seguridad y propiedad de datos

- Solo el rol Colaborador puede iniciar un lote HU1.
- La cartera se determina a partir del colaborador autenticado en el servidor.
- No se permite consultar ni enviar mensajes a aspirantes de otra cartera.
- El servidor valida parámetros, elegibilidad, canales y horario.
- WhatsApp requiere autorización verificable vigente.
- Los módulos deben respetar la propiedad de esquemas definida en `docs/arquitectura/propiedad-esquemas.md`.
- El esquema `aspirantes` pertenece al módulo Monitoreo en la arquitectura documentada.
- Mensajes y otros módulos deben solicitar cambios mediante interfaces públicas, casos de uso o eventos; no deben escribir directamente en el esquema de otro módulo.

## 13. Dependencias y ajustes para los tickets relacionados

| Ticket | Relación con EQ-77 |
|---|---|
| EQ-27 | Fuente de la definición de colores y umbrales de inactividad. Verificar que la implementación vigente coincida con la definición aprobada; el código revisado de `semaforo.js` aún se declara provisional. |
| EQ-30 | El interruptor general de aspirantes aceptados de HU2 conserva su alcance. La exclusión de aceptados y rechazados definitivamente de HU1 aplica específicamente al lote. |
| EQ-32 | Las opciones de filtros deben exponer el catálogo completo de semáforos. Verificar que el contrato de Monitoreo incluya VERDE, AMARILLO, NARANJA y ROJO. |
| EQ-78 | El prototipo debe reflejar filtros, valor inicial de 7 días, canales y estado fuera de horario. |
| EQ-79 | Utiliza el texto de reactivación aprobado en HU8 y respeta consentimiento y ventana de WhatsApp. |
| EQ-80 | Modela lote, detalle, canal, resultado y conteos sin violar la propiedad del esquema `aspirantes`. |
| EQ-81 | Implementa la vista previa con cartera autenticada, estados excluidos, semáforo, inactividad y 48 horas de HU9. |
| EQ-82 | Consulta la interfaz pública de HU9 y valida el horario en servidor. |
| EQ-83 | Recalcula elegibilidad al confirmar y publica los eventos de envío por aspirante y canal. |
| EQ-84 | Personaliza el mensaje desde el catálogo de HU8. |
| EQ-85 | Envía WhatsApp respetando autorización, ventana y plantilla aprobada. |
| EQ-86 | Envía correo solo si la casilla está habilitada y existe dirección válida; mantiene independencia de canales. |
| EQ-87 | Registra contacto saliente e historial sin modificar la fecha de última actividad académica. |
| EQ-88 | Implementa filtros y valor inicial aprobados. |
| EQ-89 | Implementa conteo, confirmación, resultado y bloqueo de envío fuera de horario. |
| EQ-90 | Incluye pruebas unitarias de filtros, estados, inactividad, contacto previo, canales y horario. |
| EQ-91 | Incluye integración con adaptadores simulados, fallos parciales, historial y aislamiento de carteras. |
| EQ-92 | Incluye pruebas E2E, seguridad y aceptación del PO. |
| EQ-102 | Fuente de los parámetros de jornada, zona horaria y periodos de HU9. |
| EQ-105 | Interfaz pública que HU1 utiliza para consultar la configuración y validar el horario. |
| EQ-112 | Pruebas de integración de lectura de configuración y rechazo de envíos fuera de horario. |

### Observaciones de consistencia encontradas en los archivos revisados

1. `src/modulos/monitoreo/semaforo.js` está marcado como provisional y calcula el semáforo con estado de solicitud y contacto iniciado. Debe verificarse contra la decisión de EQ-27 y la decisión B aprobada en EQ-77.
2. `docs/contratos/monitoreo.md` enumera los cuatro colores en el catálogo general, pero en la descripción del parámetro `semaforo` no incluye NARANJA. Debe corregirse la inconsistencia del contrato.
3. La descripción de EQ-80 plantea que Mensajes escribe en el esquema Aspirantes, mientras `docs/arquitectura/propiedad-esquemas.md` asigna ese esquema a Monitoreo. EQ-80 debe respetar la propiedad del esquema.
4. La descripción actual de EQ-87 menciona actualizar la fecha según HU1-1. Debe precisarse que se actualiza el último contacto saliente exitoso, no la fecha de última actividad académica.

## 14. Criterios de aceptación de EQ-77

- [x] Se definió que el semáforo representa inactividad y no estado de admisión.
- [x] Se definió excluir solicitudes ACEPTADAS y RECHAZADAS definitivamente.
- [x] Se estableció 7 días como valor inicial del filtro de inactividad.
- [x] Se definió que el colaborador puede modificar el valor del filtro.
- [x] Se definieron las actividades que actualizan la última actividad académica.
- [x] Se definieron los eventos salientes que no modifican la última actividad académica.
- [x] Se conservó el periodo independiente de 48 horas de HU9.
- [x] Se definió la notificación interna cuando el aspirante vuelve a ser elegible.
- [x] Se definió que WhatsApp requiere teléfono válido y autorización verificable.
- [x] Se definió que correo es opcional y está desactivado por defecto.
- [x] Se definió la independencia de los canales y el manejo de fallos parciales.
- [x] Se definió que fuera de horario se permite consultar, pero no enviar ni programar automáticamente el lote manual.
- [x] Se definió la revalidación en servidor.
- [x] Se identificaron las dependencias y contradicciones documentales/técnicas que deben atender los tickets relacionados.

## 15. Alcance y pendientes fuera de EQ-77

EQ-77 deja aprobadas las reglas funcionales del lote. No implementa código, migraciones, endpoints, prototipos ni pruebas.

Los siguientes detalles permanecen en sus tickets o requieren precisión técnica sin cambiar las decisiones aprobadas:

- Los umbrales numéricos del semáforo se consultan en EQ-27; no se inventan en EQ-77.
- EQ-81 debe documentar la conversión de meses y el límite temporal exacto del filtro.
- EQ-80 debe resolver su diseño conforme a la propiedad de esquemas de BASE-2.
- EQ-87 debe separar el último contacto saliente exitoso de la última actividad académica.

---

**Resultado:** EQ-77 queda definido funcionalmente con las siete decisiones aprobadas por el Product Owner el 19/11/2026. Los tickets técnicos de HU1 deben implementar estas reglas y respetar las interfaces públicas y decisiones vigentes de HU8, HU9 y la arquitectura modular de SIRA.
