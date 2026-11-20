# HU8-1 — Catálogo de mensajes y reglas

**Ticket:** EQ-93
**Historia padre:** EQ-75 — HU 8: Consulta de mensajes predefinidos de la IA
**Responsable:** Nomar Alberto Limón Quintero
**Sprint:** EQ Sprint 2
**Estado:** Definición funcional cerrada con el PO
**Fecha:** 18/11/2026

## 1. Objetivo y alcance

Definir los mensajes que integrarán el catálogo de HU8, clasificarlos por categoría, documentar sus reglas de negocio y variables, y dejar aprobado el texto de reactivación que necesita EQ-79.

El catálogo contempla:

- **Mensajes de envío:** saludo inicial, recordatorio por falta de documentación y reactivación de HU1.
- **Mensajes de respuesta:** FAQ y aviso fuera del horario de atención.

Este ticket define el contenido y las reglas funcionales. No implementa el modelo de datos, endpoints, pantallas, integración con Meta Cloud API ni respuestas de IA. Esos trabajos corresponden a los tickets técnicos relacionados.

## 2. Acceso al catálogo

Decisión aprobada por el PO:

| Rol | Consultar catálogo | Modificar mensajes desde HU8 |
|---|---:|---:|
| Administrador | Sí | No |
| Colaborador | Sí | No |

La consulta del catálogo será de solo lectura para ambos roles. HU8 no incluye crear, editar ni eliminar mensajes.

La configuración de jornada y parámetros de HU9 se administra por separado y conserva el acceso exclusivo de Administrador definido en los tickets de HU9.

## 3. Reglas generales de WhatsApp

SIRA utilizará WhatsApp como canal de comunicación. El colaborador trabajará desde la interfaz de SIRA; el sistema decidirá qué modalidad de envío corresponde según la ventana de atención de WhatsApp.

### 3.1 Ventana de atención

- La ventana se calcula a partir del último mensaje **recibido del aspirante**.
- Si la ventana está abierta, SIRA puede enviar un mensaje normal.
- Si la ventana está cerrada, SIRA debe utilizar una plantilla aprobada por Meta.
- Si no existe una plantilla aprobada para el mensaje, SIRA bloquea el envío e informa al colaborador.
- Cuando el aspirante envía un nuevo mensaje, se actualiza la ventana de atención.

El colaborador no tendrá que decidir manualmente si corresponde un mensaje normal o una plantilla.

### 3.2 Dos contadores independientes

No deben confundirse:

1. **Tiempo de espera del recordatorio de documentación:** comienza cuando el aspirante permanece en el estado `RECIBIDA`; para este recordatorio se aprobó un plazo de 24 horas.
2. **Ventana de WhatsApp:** se calcula desde el último mensaje recibido del aspirante y determina si puede enviarse un mensaje normal o si se requiere una plantilla aprobada.

El envío de un mensaje del sistema no debe reiniciar ni modificar el contador de inactividad del aspirante.

## 4. Catálogo de mensajes de envío

### 4.1 Saludo inicial automático

**Categoría:** Envío
**Nombre sugerido en catálogo:** `saludo_inicial`
**Estado:** Texto aprobado por el PO.

**Texto:**

> ¡Hola, {{nombre}}! Bienvenido(a). Estamos aquí para ayudarte con tu proceso de ingreso a {{carrera}}. ¿En qué podemos apoyarte?

**Variables:**
- `nombre`: nombre del aspirante.
- `carrera`: carrera solicitada por el aspirante.

**Regla de negocio:**

- Se activa cuando el aspirante inicia por primera vez una conversación por WhatsApp.
- Si el primer contacto ocurre dentro del horario de atención, SIRA envía automáticamente este saludo.
- Después del saludo, el colaborador puede continuar la atención manualmente.
- Si el primer contacto ocurre fuera del horario, se envía el aviso fuera de horario en lugar del saludo; no se envían ambos mensajes consecutivamente.
- El horario vigente se consulta desde la configuración de HU9; no se fija directamente en el catálogo.

### 4.2 Contacto iniciado por el colaborador

**Categoría:** Envío
**Nombre sugerido en catálogo:** `contacto_iniciado_colaborador`
**Estado:** Texto aprobado por el PO.

**Texto:**

> Hola, {{nombre}}. Soy parte del equipo de atención de ITSON. Me gustaría apoyarte con tu proceso de ingreso a {{carrera}}. ¿Tienes alguna duda o necesitas ayuda?

**Variables:**
- `nombre`: nombre del aspirante.
- `carrera`: carrera solicitada por el aspirante.

**Regla de negocio:**

- El colaborador puede iniciar el contacto cuando el aspirante tenga semáforo rojo o amarillo/naranja, conforme a las reglas de aplicabilidad de HU1.
- SIRA presenta el mensaje como texto predefinido.
- El colaborador revisa el mensaje y decide si lo envía; no se envía automáticamente.
- SIRA aplica la regla general de la ventana de WhatsApp: mensaje normal si está abierta; plantilla aprobada si está cerrada.
- Si se requiere plantilla y no existe una aprobada, se bloquea el envío y se informa al colaborador.

### 4.3 Recordatorio por falta de documentación

**Categoría:** Envío
**Nombre sugerido en catálogo:** `recordatorio_documentacion`
**Estado:** Texto aprobado por el PO.

**Texto:**

> Hola, {{nombre}}. Te recordamos que aún tienes pendiente entregar tu constancia de calificaciones para continuar con tu proceso de admisión a {{carrera}}. Si tienes alguna duda sobre este requisito, estamos para apoyarte.

**Variables:**
- `nombre`: nombre del aspirante.
- `carrera`: carrera solicitada por el aspirante.

**Regla de negocio del envío automático:**

1. El aspirante permanece en estado `RECIBIDA`, que representa que la solicitud existe pero todavía no se ha entregado la constancia de calificaciones.
2. Se cuentan 24 horas continuas desde que entra en ese estado.
3. Si continúa en `RECIBIDA` al cumplirse las 24 horas, SIRA puede enviar un único recordatorio automático.
4. Si entrega la constancia antes de cumplirse el plazo y cambia al estado correspondiente a documentación entregada/en revisión, se cancela el recordatorio pendiente.
5. El recordatorio automático no se repite.

**Regla de negocio del envío manual:**

- El colaborador también puede seleccionar y enviar manualmente este mensaje.
- Si el colaborador lo envía antes de cumplirse las 24 horas, se cancela el recordatorio automático pendiente para evitar duplicados.
- Si el recordatorio automático ya se envió, el colaborador conserva la posibilidad de enviar otro recordatorio manual.
- Si la constancia ya fue entregada, no debe enviarse un recordatorio pendiente por esa documentación.

**Canal:**

SIRA aplica la regla general de la ventana de WhatsApp. Si la ventana está cerrada, se requiere una plantilla aprobada por Meta.

**Nota de implementación:** el código actual contiene `RECIBIDA` y `EN_REVISION`, pero el archivo `src/modulos/registro-escolar/estados.js` identifica su catálogo como provisional. Antes de implementar esta regla, debe comprobarse la correspondencia con el catálogo definitivo de estados acordado en EQ-27.

### 4.4 Reactivación de HU1

**Categoría:** Envío
**Nombre sugerido en catálogo:** `reactivacion_hu1`
**Estado:** Texto aprobado por el PO.
**Dependencia directa:** EQ-79.

**Texto final para EQ-79:**

> Hola, {{nombre}}. Tu proceso de ingreso a {{carrera}} todavía puede continuar. ¿Necesitas ayuda para completar tus siguientes pasos?
>
> Responde a este mensaje y con gusto te orientaremos.

**Variables:**
- `nombre`: nombre del aspirante.
- `carrera`: carrera solicitada por el aspirante.

**Regla de negocio:**

El mensaje se utiliza en los lotes de reactivación de HU1. Como definición funcional aprobada por el PO, se considera al aspirante que:

- Pertenece a la cartera del colaborador autenticado.
- Tiene semáforo distinto de verde, sujeto a la definición final y consistente del semáforo en EQ-77/EQ-27.
- Tiene teléfono válido.
- Está fuera del tiempo de espera por contacto previo configurado en HU9.
- Cumple el tiempo mínimo de inactividad definido en EQ-77.

Los umbrales, el tiempo mínimo y la regla definitiva de aplicabilidad pertenecen a EQ-77 y EQ-102; HU8 no debe duplicarlos ni fijarlos por su cuenta.

**Canal:**

EQ-79 contempla crear y enviar esta plantilla a aprobación de Meta. Cuando la ventana de WhatsApp esté cerrada, solo se podrá utilizar la plantilla si Meta la aprobó.

## 5. Catálogo de mensajes de respuesta

### 5.1 Preguntas frecuentes (FAQ)

**Categoría:** Respuesta
**Nombre sugerido en catálogo:** `faq_admision`
**Estado:** Contenido inicial aprobado por el PO con base en el proceso de admisión vigente que indicó.

Las siguientes preguntas y respuestas forman el conjunto inicial del catálogo:

| Pregunta | Respuesta aprobada |
|---|---|
| ¿Qué documentos necesito? | Necesitas entregar tu constancia de calificaciones y tu certificado de preparatoria. |
| ¿Tengo que presentar examen de admisión? | Actualmente no se realiza examen de admisión. El ingreso se determina con base en el promedio de preparatoria y los requisitos correspondientes. |
| ¿Cuánto tarda la validación? | La validación tarda aproximadamente de 3 a 5 días hábiles por parte de Registro Escolar. Se te notificará cuando esté lista. |

**Regla de negocio:**

- Las FAQ se consultan como mensajes de respuesta predefinidos.
- La lista y el detalle deben mostrar la pregunta/respuesta y la regla asociada.
- La implementación de interpretación de preguntas, generación de respuestas o atención mediante IA no forma parte de EQ-93.
- Si una pregunta no está cubierta por el catálogo, la respuesta o escalamiento correspondiente deberá definirse en el trabajo de IA/Conocimiento; no se inventará una respuesta.

### 5.2 Aviso fuera del horario de atención

**Categoría:** Respuesta
**Nombre sugerido en catálogo:** `aviso_fuera_horario`
**Estado:** Texto y comportamiento aprobados por el PO.

**Texto:**

> Gracias por comunicarte con ITSON. En este momento estamos fuera de nuestro horario de atención. Hemos recibido tu mensaje y te brindaremos orientación.

**Regla de negocio:**

- SIRA consulta el horario vigente mediante la configuración de HU9.
- Si el aspirante inicia una conversación fuera del horario, SIRA envía este aviso en lugar del saludo inicial.
- El aviso se envía una sola vez por conversación, aunque el aspirante mande varios mensajes mientras continúa fuera de horario.
- La atención posterior mediante IA queda contemplada para una etapa futura; no se implementa en EQ-93.
- El horario no debe escribirse de forma fija en el texto ni duplicarse dentro del catálogo.

## 6. Consentimiento para comunicaciones de WhatsApp: restricción externa

**Decisión del PO:** el proceso de admisión debe solicitar autorización expresa para recibir comunicaciones de ITSON por WhatsApp. El aspirante no debería continuar el registro si no marca la casilla de aceptación.

**Situación del sistema fuente:**

- El registro del aspirante ocurre en Mi Admisión de ITSON: https://apps9.itson.edu.mx/admisiones/miadmision/index.aspx
- El equipo SIRA no tiene acceso al código fuente ni a la administración de ese portal.
- Por lo tanto, EQ-93 y el repositorio SIRA no pueden agregar ni hacer obligatoria la casilla en Mi Admisión.

**Regla para SIRA:**

- No asumir que proporcionar un número telefónico equivale a autorizar comunicaciones.
- SIRA solo debe considerar autorizado a un aspirante cuando la integración o fuente de datos proporcione evidencia verificable de esa autorización.
- Si el dato de autorización no llega, es desconocido o está revocado, no enviar mensajes proactivos por WhatsApp.
- La condición de impedir que el aspirante continúe el registro debe implementarla el equipo responsable de Mi Admisión. No se declara implementada por este ticket.

Esta restricción se documenta para coordinarla con los tickets existentes de modelo e integración, sin crear una incidencia nueva por decisión del PO.

## 7. Plantillas de Meta necesarias

La lógica general de WhatsApp se aplica a los mensajes de envío. Para mensajes proactivos fuera de la ventana de atención, se requieren plantillas aprobadas.

| Mensaje | Referencia de trabajo |
|---|---|
| Reactivación HU1 | EQ-79 ya contempla crear y enviar la plantilla a aprobación |
| Recordatorio de documentación | El PO aprobó agregar una tarea para preparar y enviar la plantilla a aprobación |
| Contacto iniciado por colaborador | El PO aprobó agregar una tarea para preparar y enviar la plantilla a aprobación |

Las dos tareas adicionales fueron acordadas por el PO, pero no se les asigna clave en este documento. La aprobación de Meta, el identificador, el idioma y el estado final deberán registrarse cuando se tramiten.

## 8. Dependencias y límites entre tickets

| Ticket | Relación con esta definición |
|---|---|
| EQ-77 | Define aplicabilidad del lote de reactivación, inactividad y reglas pendientes del semáforo |
| EQ-79 | Usa el texto final de reactivación y gestiona su plantilla de Meta |
| EQ-80 | Modelo de datos del lote y detalle por aspirante |
| EQ-83 | Recalcula aplicabilidad y publica eventos de envío |
| EQ-84 | Arma el mensaje personalizado desde el catálogo de HU8 |
| EQ-85 | Envía por WhatsApp Cloud API y gestiona reintentos/ritmo |
| EQ-87 | Registra resultados e historial |
| EQ-95 | Modelo de datos del catálogo y datos semilla |
| EQ-96 | Endpoint de lista por categoría |
| EQ-97 | Endpoint de detalle, vista previa y reglas |
| EQ-98/EQ-99 | Interfaz de lista y vista previa |
| EQ-101 | Pruebas E2E y aceptación con el PO |
| EQ-102/EQ-105 | Define y expone jornada, zona horaria y evaluación de horario |
| EQ-106/EQ-110 | Configuración de HU9 exclusiva para Administrador |

## 9. Criterios de aceptación de EQ-93

- [x] Se listan los mensajes de envío requeridos: saludo inicial, recordatorio por falta de documentación y reactivación de HU1.
- [x] Se listan los mensajes de respuesta requeridos: FAQ y aviso fuera de horario.
- [x] Cada mensaje tiene una regla de negocio documentada.
- [x] Se identifican las variables de los mensajes que las requieren.
- [x] El texto final de reactivación está aprobado para EQ-79.
- [x] Se confirmó que Administrador y Colaborador pueden consultar el catálogo.
- [x] Se definió que ambos roles consultan en modo de solo lectura.
- [x] Se documentó la prioridad entre saludo y aviso fuera de horario.
- [x] Se definió el recordatorio automático, manual y la prevención de duplicados.
- [x] Se separó el contador de documentación de la ventana de WhatsApp.
- [x] Se documentó la dependencia del horario de HU9.
- [x] Se documentaron las restricciones de consentimiento y del portal externo sin afirmar que estén implementadas.

## 10. Historial de decisiones del PO

| Fecha | Decisión |
|---|---|
| 18/11/2026 | Administrador y Colaborador consultan el catálogo en modo de solo lectura |
| 18/11/2026 | Aprobado el texto de reactivación con variables `nombre` y `carrera` |
| 18/11/2026 | Aprobado el saludo automático cuando el aspirante inicia dentro del horario |
| 18/11/2026 | Aprobado el mensaje predefinido que el colaborador decide enviar |
| 18/11/2026 | El colaborador puede iniciar contacto con aspirantes en semáforo rojo o amarillo/naranja, conforme a reglas de HU1 |
| 18/11/2026 | Aprobado recordatorio automático tras 24 horas en `RECIBIDA`, una sola vez |
| 18/11/2026 | Si se entrega la constancia antes del vencimiento, se cancela el recordatorio pendiente |
| 18/11/2026 | Si el colaborador envía manualmente antes del vencimiento, se cancela el automático pendiente |
| 18/11/2026 | El colaborador puede enviar otro recordatorio manual después del automático |
| 18/11/2026 | Aprobadas las tres FAQ iniciales sobre documentos, examen y tiempo de validación |
| 18/11/2026 | El horario se consulta desde HU9 y no se fija en el catálogo |
| 18/11/2026 | Aprobado aviso fuera de horario en lugar del saludo inicial |
| 18/11/2026 | El aviso fuera de horario se envía una sola vez por conversación |
| 18/11/2026 | La IA fuera de horario queda para una etapa posterior |
| 18/11/2026 | SIRA debe aplicar automáticamente las reglas de ventana de WhatsApp y plantillas aprobadas |
| 18/11/2026 | El PO solicita consentimiento explícito para WhatsApp en Mi Admisión; el equipo SIRA no tiene acceso al portal para implementar la casilla |

---

**Resultado:** EQ-93 queda definido funcionalmente para continuar con el modelo de datos, endpoints, prototipo y pruebas de HU8. Los parámetros de jornada, umbrales de inactividad, resolución de la discrepancia del semáforo y aprobación de plantillas permanecen en sus tickets/dependencias correspondientes.
