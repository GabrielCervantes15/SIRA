# SIRA — EQ-103 / HU9-2: Guía para finalizar el prototipo del panel de configuración

- **Responsable:** Nomar Alberto Limón Quintero
- **Sprint:** EQ Sprint 2
- **Estado en Jira:** En curso
- **Base de diseño:** Panel lateral «Configurar envío de mensajes» en la sección Mensajes del Administrador (Figma original, captura pendiente).
**Fuente de reglas:** `docs/decisiones/HU9-configuracion-parametros.md` (19/11/2026).

## Objetivo

Actualizar el prototipo existente en Figma sin crear una página nueva y sin rediseñar el catálogo de Mensajes. El resultado debe permitir visualizar la configuración institucional por día, los dos plazos, los errores y la confirmación de guardado.

## Pantalla propuesta (estructura, no diseño visual definitivo)

- Panel lateral: **Configurar envío de mensajes**; control para cerrar.
- Contexto: «Zona horaria institucional: America/Hermosillo».
- **Jornada laboral por día**:
  - Lunes: activado, 08:00 a 18:00.
  - Martes: activado, 08:00 a 18:00.
  - Miércoles: activado, 08:00 a 18:00.
  - Jueves: activado, 08:00 a 18:00.
  - Viernes: activado, 08:00 a 18:00.
  - Sábado: desactivado, sin horas editables.
  - Domingo: desactivado, sin horas editables.
  - Cada fila debe tener un control de habilitación, hora de inicio y hora de fin; estos dos últimos solo se pueden editar si el día está activo.
- Leyenda: «Los mensajes automáticos se envían durante toda la jornada configurada de cada día». **No crear una segunda ventana horaria**.
- **Tiempo máximo de espera de respuesta**: campo de valor **24** + selector de unidad **Horas**; equivalencia informativa «1 día».
- **Tiempo de espera por contacto previo**: campo de valor **48** + selector de unidad **Horas**; equivalencia informativa «2 días». Se prefiere este término frente a «notificación por inactividad», para no confundirlo con el filtro de inactividad mínima de HU1.
- Acciones: **Cancelar** y **Guardar** (con retroalimentación visible).

## Estados que deben existir en el prototipo

1. **Inicial:** muestra datos aprobados y todos los controles habilitados para Administrador.
2. **Edición válida:** permite cambiar horas por día y valores/unidades de plazo; sábados y domingos se pueden habilitar.
3. **Error numérico:** campo vacío, cero, número negativo, decimal, unidad distinta de horas/días o equivalencia superior a 30 días; error junto al campo.
4. **Error horario:** día habilitado con inicio igual/posterior a fin, formato horario inválido; error visible en la misma fila.
5. **Guardando:** estado de procesamiento; evita enviar dos veces el cambio.
6. **Guardado correcto:** confirmación «Configuración guardada correctamente».
7. **Error de servicio:** mensaje de fallo de guardado que no simula éxito; conservar valores editados para reintento.
8. **Sin permiso:** la entrada y el panel son exclusivos del Administrador; el acceso por ruta/API debe rechazarse para Colaborador (regla para implementación).

## Validaciones y reglas funcionales

- Los tiempos admiten enteros positivos en **horas** o **días**; equivalencia de **1 hora a 30 días (720 horas)**.
- Hora de inicio estrictamente anterior a hora de fin en cada día habilitado.
- Día deshabilitado no debe enviar mensajes ni permitir editar horas hasta reactivarse.
- Zona horaria fija `America/Hermosillo`; no usar la zona horaria local del navegador.
- Mensajes cuyo momento de envío cae fuera de jornada permanecen pendientes hasta la siguiente apertura; el prototipo puede comunicarlo mediante texto de ayuda, pero no tiene que implementar la programación.
- Guardado único y validaciones de servidor pertenecen a EQ-107/EQ-110; el prototipo solo debe mostrar sus resultados y estados.

## Criterios de aceptación de EQ-103

- [ ] El panel es lateral dentro de Mensajes, conserva el lenguaje visual del Figma original.
- [ ] Se configuran los siete días de forma independiente.
- [ ] Lunes a viernes arrancan 08:00–18:00; sábado y domingo desactivados.
- [ ] Se muestra que el envío abarca toda la jornada, sin segunda franja.
- [ ] Se visualizan plazos 24 horas y 48 horas, con unidad seleccionable y equivalencias.
- [ ] Hay mensajes de validación por campo y por fila de jornada.
- [ ] Hay confirmación de guardado y estado de error al fallar el servidor.
- [ ] La sección es administrativa y no aparece en el recorrido de Colaborador.
- [ ] Se validan con el PO las pantallas normal, error y guardado.

## Dependencia técnica detectada en el ZIP revisado

La implementación actual de `frontend/index.html`, `frontend/js/app.js` y `src/modulos/configuracion-envio/configuracion-envio.js` implementa otra pantalla: vista independiente, horario global 08:00–10:00 y jornada supuesta 06:00–21:00. En paralelo, el módulo reciente `src/modulos/mensajes` define `jornada` semanal, `tiempoMaximoEsperaRespuesta` y `tiempoEsperaContactoPrevio` y el endpoint `/api/v1/mensajes/configuracion`.

La diferencia queda **fuera del alcance directo de EQ-103**. Debe coordinarse con Gabriel (EQ-109/EQ-110) y Sebastián (EQ-104 a EQ-108) para alinear el frontend con el contrato definitivo y registrar o corregir cualquier fallo de integración.

Pruebas ejecutadas sobre la copia recibida (Node v22.16.0): **118/131 correctas**, 13 fallidas; para `test/hu9-configuracion-mensajes.test.js`, **7/8 correctas** y una prueba HTTP que esperaba 401 recibió 404, compatible con una ruta no conectada al servidor de entrada. `npm run lint` finalizó correctamente (67 archivos JavaScript).

## Material necesario para cerrar el diseño

- **Imprescindible:** captura legible de Figma donde se vea abierta la sección **Mensajes** y su panel lateral **«Configurar envío de mensajes»**, preferentemente a pantalla completa; alternativamente, enlace al archivo/nodo de Figma con acceso.
- **Ideal:** captura de un estado con error o interacción si ya existe.
- No se requieren nuevas decisiones funcionales para crear el primer borrador: los parámetros están definidos en el documento EQ-102.

> Documento preparatorio. No sustituye el archivo de Figma ni declara EQ-103 finalizada antes de revisar el prototipo con el PO.
