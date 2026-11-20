# HU9 — Configuración del envío de mensajes automáticos

**Ticket de definición:** EQ-102 — [HU9-1] Definir con el PO jornada laboral, parámetros y su significado
**Historia padre:** EQ-76 — HU 9: Configuración del envío de mensajes automáticos
**PO:** Nomar Alberto Limón Quintero
**Estado:** Definición funcional aprobada por el PO
**Versión:** Definitiva, consolidada después de revisar el prototipo de Mensajes
**Fecha:** 19/11/2026

---

## 1. Objetivo

Consolidar las decisiones del PO que deben utilizar los tickets técnicos de HU9: jornada institucional, zona horaria, horario permitido de envío, tiempos de espera, efecto sobre HU1, unidades, límites, valores iniciales, permisos, arquitectura y bitácora.

Este documento define comportamiento funcional. No implementa código ni crea una pantalla nueva. El panel de configuración existente en Figma se conserva como base visual para EQ-103 y se ajusta únicamente donde sea necesario para representar las decisiones aprobadas.

## 2. Decisiones aprobadas por el PO

### 2.1 Zona horaria

- **Zona horaria:** `America/Hermosillo`.
- **Desfase de referencia:** UTC−07:00.
- Todos los cálculos de jornada, horarios permitidos, vencimientos y programación de envíos deben utilizar esta zona horaria institucional.
- No se debe depender de la zona horaria configurada en la computadora o navegador del colaborador.

### 2.2 Jornada laboral: configurable por día

La jornada será configurable de forma independiente para cada día de la semana. Los valores iniciales aprobados son:

| Día | Habilitado | Inicio | Fin |
|---|---:|---:|---:|
| Lunes | Sí | 08:00 | 18:00 |
| Martes | Sí | 08:00 | 18:00 |
| Miércoles | Sí | 08:00 | 18:00 |
| Jueves | Sí | 08:00 | 18:00 |
| Viernes | Sí | 08:00 | 18:00 |
| Sábado | No | — | — |
| Domingo | No | — | — |

Reglas:
- Cada día debe poder habilitarse o deshabilitarse.
- Cada día habilitado debe permitir configurar su propia hora de inicio y fin.
- Los valores iniciales de lunes a viernes son iguales, pero no deben quedar codificados como un único horario semanal.
- Sábado y domingo comienzan deshabilitados.
- El inicio debe ser anterior al fin.
- El horario permitido para envíos no puede exceder la jornada configurada para ese día.

### 2.3 Horario permitido para enviar mensajes

**Decisión:** el horario permitido de envío abarca toda la jornada laboral configurada para cada día.

Con los valores iniciales:
- Lunes a viernes: 08:00–18:00.
- Sábado y domingo: sin envíos automáticos ni programados.

No se define una segunda ventana más corta dentro de la jornada. El horario de envío utiliza los límites de la jornada institucional.

### 2.4 Envíos automáticos que vencen fuera del horario

**Decisión aprobada:** mantener el envío pendiente y programarlo para el siguiente inicio de jornada habilitada.

Ejemplo: si un mensaje automático vence el viernes a las 19:00, queda pendiente y se programa para el lunes a las 08:00.

Reglas:
- No descartar un mensaje únicamente porque su vencimiento ocurrió fuera del horario.
- Mantenerlo pendiente hasta el siguiente inicio de jornada habilitada.
- Antes del despacho, volver a comprobar que el mensaje siga siendo aplicable según su regla de HU8/HU1, que el aspirante conserve el estado o requisito que lo originó y que no haya sido sustituido o cancelado.
- Si el motivo del mensaje dejó de existir, cancelar el pendiente en lugar de enviarlo tarde.
- Validar las reglas de la ventana de WhatsApp y las plantillas aprobadas por Meta en el momento efectivo del envío.
- Los reintentos y errores del proveedor de WhatsApp corresponden a los tickets de integración/envío, no a EQ-102.

## 3. Parámetros de tiempo

### 3.1 Tiempo máximo de espera de respuesta

**Valor inicial aprobado:** 24 horas.
**Unidad inicial:** horas.
**Equivalencia visible en el prototipo:** 1 día.

Comportamiento aprobado por el PO:
1. El contador comienza después de que SIRA confirma el envío de un mensaje saliente que requiere respuesta.
2. Mientras el contador está activo, el colaborador no puede enviar otro mensaje manual a ese aspirante desde la conversación.
3. Si el aspirante responde antes de vencer el plazo, se cancela el seguimiento automático pendiente y el colaborador puede continuar la conversación.
4. Si transcurren 24 horas sin respuesta, SIRA ejecuta el siguiente mensaje predefinido que resulte aplicable conforme a las reglas del catálogo HU8.
5. Una vez que el mensaje automático se envía correctamente, se habilita nuevamente la interacción del colaborador.
6. El mensaje debe ser un texto predefinido del catálogo; no debe generarse con IA ni inventarse un texto nuevo en este alcance.

Precisiones para evitar interpretaciones incorrectas:
- EQ-102 define el plazo y el comportamiento de espera; no crea una secuencia universal de mensajes distinta del catálogo HU8.
- La selección del mensaje debe respetar las condiciones de su propia regla en HU8. Por ejemplo, el recordatorio de documentación solo corresponde cuando se cumple su condición de documentación pendiente; la reactivación de HU1 solo corresponde cuando el aspirante cumple los criterios de HU1.
- No enviar un mensaje cuyo disparador no se cumpla.
- Si no existe otro mensaje de HU8 aplicable, no inventar uno: liberar la interacción del colaborador y dejar el caso disponible para atención manual.
- Si el vencimiento ocurre fuera de la jornada, el envío automático queda pendiente hasta la siguiente apertura, de acuerdo con la sección 2.4. La interacción se habilita al completarse el envío o si el aspirante responde antes.

### 3.2 Tiempo de espera por contacto previo / inactividad para HU1

**Valor inicial aprobado:** 48 horas.
**Unidad inicial:** horas.
**Equivalencia visible en el prototipo:** 2 días.

Comportamiento aprobado por el PO:
1. El periodo se calcula desde el último mensaje saliente enviado correctamente por un colaborador o por SIRA.
2. Mientras no se cumplan las 48 horas, el aspirante queda excluido de los lotes de contacto/reactivación de HU1.
3. Al cumplirse las 48 horas, termina la exclusión temporal.
4. Si además cumple los demás criterios de aplicabilidad definidos en HU1/EQ-77, el aspirante vuelve a ser elegible para un lote.
5. Cuando vuelve a ser elegible, SIRA notifica al colaborador asignado mediante el mecanismo interno de notificaciones de SIRA. Esta notificación no equivale a enviar otro WhatsApp al aspirante.
6. La notificación debe evitar duplicados mientras el aspirante permanezca en el mismo estado de elegibilidad.
7. La inclusión en un lote continúa dependiendo de la acción del colaborador y de las reglas de HU1; el vencimiento de las 48 horas no dispara por sí solo un envío masivo.

Precisiones:
- Las 48 horas son un periodo de exclusión por contacto reciente; no sustituyen el filtro de inactividad mínima de HU1.
- El aspirante debe cumplir también los demás criterios de HU1, como cartera, semáforo, teléfono válido y tiempo mínimo de inactividad que se defina en EQ-77.
- El envío de un mensaje del sistema no debe modificar la fecha de última actividad académica ni el semáforo.
- Cada nuevo mensaje saliente exitoso reinicia el periodo de contacto previo de 48 horas.

### 3.3 Contadores que deben permanecer independientes

No mezclar ni reutilizar el mismo contador/campo para estos conceptos:

| Contador | Inicio | Valor | Propósito |
|---|---|---:|---|
| Espera máxima de respuesta | Envío saliente exitoso que requiere respuesta | 24 horas | Bloquear temporalmente la interacción del colaborador; si no hay respuesta, ejecutar el siguiente mensaje HU8 aplicable |
| Contacto previo de HU1 | Último mensaje saliente exitoso | 48 horas | Excluir temporalmente al aspirante de los lotes HU1 y notificar cuando vuelva a ser elegible |
| Recordatorio de documentación HU8 | Entrada al estado `RECIBIDA` | 24 horas | Enviar una sola vez el recordatorio si continúa pendiente la documentación |
| Ventana de WhatsApp | Último mensaje entrante del aspirante | 24 horas | Determinar si se puede enviar mensaje libre o se requiere plantilla aprobada por Meta |

Estos tiempos tienen propósitos diferentes. El vencimiento de uno no debe reiniciar ni sustituir automáticamente a los demás, salvo el reinicio explícito del periodo de contacto previo cuando se realiza un nuevo envío saliente exitoso.

## 4. Unidades, límites y valores iniciales

Decisiones aprobadas:
- Unidades permitidas: horas o días.
- Valores enteros positivos.
- No permitir decimales.
- Mínimo: 1 hora.
- Máximo: 30 días.
- Validar cada campo y mostrar el error junto al control correspondiente.
- El inicio del horario debe ser anterior al fin.
- El horario de envío debe estar dentro de la jornada del día configurado.
- El guardado debe realizarse en una sola transacción, conforme a EQ-107.

Valores iniciales:

| Parámetro | Valor inicial | Equivalencia |
|---|---:|---|
| Tiempo máximo de espera de respuesta | 24 horas | 1 día |
| Tiempo de espera por contacto previo de HU1 | 48 horas | 2 días |
| Jornada lunes a viernes | 08:00–18:00 | 10 horas |
| Jornada sábado | Deshabilitada | Sin atención |
| Jornada domingo | Deshabilitada | Sin atención |
| Horario permitido de envío | Toda la jornada | Según cada día habilitado |
| Zona horaria | `America/Hermosillo` | UTC−07:00 |

## 5. Propiedad de la configuración y arquitectura

**Decisión aprobada:** la configuración pertenece al módulo Mensajes. No crear un módulo independiente de Configuración.

- El módulo Mensajes administra y persiste los parámetros.
- Los demás módulos consultan la configuración vigente mediante una interfaz pública de lectura.
- La interfaz pública devuelve los parámetros vigentes y permite determinar si un instante está dentro del horario permitido, utilizando `America/Hermosillo`.
- Los módulos consumidores no deben leer directamente las tablas internas de Mensajes.
- La implementación corresponde a EQ-104 y EQ-105, asignadas a Sebastián. Esta definición no autoriza crear una estructura paralela ni modificar su trabajo.

## 6. Permisos de administración

La administración de la configuración es exclusiva del rol **Administrador**.

- Solo Administrador puede abrir el panel y consultar/guardar la configuración mediante el endpoint administrativo.
- Colaborador no debe ver el acceso al panel.
- Cualquier intento de acceso administrativo por otro rol debe responder `403 Forbidden`.
- La interfaz pública de lectura entre módulos es distinta del endpoint administrativo y debe permitir que los módulos autorizados consulten los valores vigentes.
- Aplicar el control de acceso existente de AUT-3; no crear un sistema paralelo de roles.

## 7. Bitácora y actualización de configuración

**Decisión aprobada por el PO:** incluir la bitácora de cambios y el evento de configuración actualizada propuestos en EQ-108.

Cada modificación debe registrar:
- Quién realizó el cambio.
- Cuándo se realizó.
- Valor anterior.
- Valor nuevo.

Después de guardar correctamente:
- Publicar un evento de configuración actualizada.
- Permitir que los módulos que conservan configuración en memoria refresquen sus valores.
- Mantener consistencia entre el guardado y su bitácora según el diseño técnico de EQ-108.

## 8. Requisitos de EQ-103 a partir del prototipo compartido

Se conserva el panel lateral existente de **«Configurar envío de mensajes»** dentro de la sección Mensajes del Administrador. No crear una página nueva ni rediseñar el catálogo.

El prototipo compartido ya contiene:
- Un panel lateral de configuración.
- Selector de hora de inicio y fin.
- Tiempo máximo de espera de respuesta con valor y unidad.
- Tiempo de espera por inactividad con valor y unidad.
- Botón Guardar.
- Estilo visual azul/blanco coherente con el resto del CRM.

Ajustes necesarios para reflejar las decisiones aprobadas:

1. **Jornada por día:** el prototipo actual muestra un único inicio y fin global. Debe ampliarse dentro del mismo panel para mostrar los siete días, con habilitación por día y hora de inicio/fin independientes para cada día.
2. **Valores iniciales:** lunes a viernes 08:00–18:00; sábado y domingo deshabilitados. Sustituir el fin de las 10:00 que aparece en la captura por 18:00.
3. **Horario permitido:** dejar claro que los envíos abarcan toda la jornada configurada de cada día; no agregar una segunda ventana horaria.
4. **Espera de respuesta:** conservar el control numérico y selector de unidad; valor inicial equivalente a 1 día (24 horas).
5. **Espera por contacto previo:** conservar el control numérico y selector de unidad; valor inicial equivalente a 2 días (48 horas).
6. **Validación:** mostrar errores por campo, incluidos valor fuera de rango, inicio igual o posterior al fin y horario fuera de la jornada.
7. **Guardado:** mostrar confirmación de guardado y manejo de errores del servidor.
8. **Permisos:** el panel, su ruta y su entrada de menú son visibles solo para Administrador.

El diseño de los mensajes del Colaborador y las pantallas de FAQ no se modifican como parte de EQ-103.

## 9. Dependencias y responsabilidades de Jira

| Ticket | Responsabilidad |
|---|---|
| EQ-102 | Definición funcional consolidada en este documento |
| EQ-103 | Prototipo del panel de configuración |
| EQ-104 | Modelo de datos y valores iniciales |
| EQ-105 | Interfaz pública de lectura para otros módulos |
| EQ-106 | Endpoint administrativo, solo Administrador |
| EQ-107 | Guardado con validaciones y transacción única |
| EQ-108 | Bitácora y evento de configuración actualizada |
| EQ-109 | Formulario frontend conforme al prototipo |
| EQ-110 | Guardado, errores y acceso solo para Administrador |
| EQ-111 | Pruebas unitarias de validaciones y componentes |
| EQ-112 | Pruebas de integración: persistencia, autorización y lectura desde HU1 |
| EQ-113 | Pruebas E2E y aceptación con el PO |
| EQ-77 | Reglas de aplicabilidad del lote HU1, semáforo y tiempo mínimo de inactividad |
| EQ-79 | Plantilla de reactivación WhatsApp de HU1 y aprobación de Meta |
| EQ-81 a EQ-87 | Vista previa, validación de horario, lote, mensaje y envío de HU1 |
| EQ-93 | Catálogo de mensajes y reglas HU8 |

## 10. Criterios de aceptación funcionales de EQ-102

- [x] Zona horaria institucional definida como `America/Hermosillo`.
- [x] Jornada configurable de forma independiente por día.
- [x] Valores iniciales de lunes a viernes de 08:00 a 18:00.
- [x] Sábado y domingo deshabilitados inicialmente.
- [x] Horario permitido de envío igual a toda la jornada configurada.
- [x] Envíos automáticos vencidos fuera de horario quedan pendientes para la siguiente apertura.
- [x] Tiempo máximo de espera de respuesta de 24 horas.
- [x] Durante la espera se bloquea la interacción manual del colaborador; si el aspirante responde, se cancela el seguimiento pendiente y se libera la conversación.
- [x] Si no hay respuesta, SIRA ejecuta el siguiente mensaje predefinido que resulte aplicable según HU8; no se genera texto con IA ni se inventan mensajes.
- [x] Después del envío automático correcto, se habilita de nuevo la interacción del colaborador.
- [x] Tiempo de espera por contacto previo de HU1 de 48 horas.
- [x] Durante las 48 horas el aspirante se excluye de los lotes HU1.
- [x] Al terminar las 48 horas, vuelve a ser elegible solo si cumple los demás criterios de HU1 y se notifica al colaborador asignado.
- [x] Unidades permitidas: horas o días; enteros positivos; mínimo 1 hora y máximo 30 días.
- [x] Configuración propiedad del módulo Mensajes, con interfaz pública de lectura.
- [x] Administración exclusiva para Administrador.
- [x] Bitácora y evento de configuración actualizada aprobados.

## 11. Historial de decisiones del PO

| Tema | Decisión |
|---|---|
| Zona horaria | `America/Hermosillo` |
| Jornada | Configurable por día |
| Jornada inicial | Lunes a viernes 08:00–18:00; sábado y domingo cerrados |
| Horario permitido | Toda la jornada de cada día habilitado |
| Envío que vence fuera de horario | Pendiente hasta la siguiente apertura |
| Espera máxima de respuesta | 24 horas |
| Acción al vencer espera | Enviar el siguiente mensaje predefinido aplicable de HU8 y habilitar de nuevo al colaborador |
| Respuesta recibida antes del vencimiento | Cancelar seguimiento automático pendiente y habilitar al colaborador |
| Espera por contacto previo HU1 | 48 horas |
| Efecto de las 48 horas | Exclusión temporal de lotes; al vencer, elegibilidad sujeta a HU1 y notificación al colaborador asignado |
| Unidades y límites | Horas o días; enteros; mínimo 1 hora y máximo 30 días |
| Propiedad de configuración | Módulo Mensajes |
| Permisos | Administración exclusiva para Administrador |
| Bitácora y evento | Aprobados |

---

**Resultado:** EQ-102 queda definido funcionalmente con las decisiones del PO. EQ-103 conserva el panel lateral de Figma, pero debe incorporar la configuración independiente de los siete días para respetar la jornada variable aprobada. Los tickets técnicos deben implementar este comportamiento sin crear pantallas, mensajes ni lógica de IA fuera del alcance acordado.
