# Matriz de trazabilidad del Sprint 1

**Tarea:** EQ-20 · QA-1
**Estado:** esqueleto. Se completa cuando BASE-1 reescriba los criterios como escenarios Dado/Cuando/Entonces y se concrete cada caso de prueba.

Cómo leerla: **historia ↔ criterio de aceptación ↔ caso de prueba ↔ tarea de Jira donde se implementa la prueba.**

Tipos de prueba: **U** unitaria · **I** integración · **E2E** de extremo a extremo.

---

## HU 3: Consulta del expediente y trazabilidad del aspirante

| Criterio | Caso de prueba | Tipo | Tarea | Estado |
|---|---|---|---|---|
| **C1.** Al seleccionar un aspirante se muestran sus datos generales y la lista de mensajes, constancias y rechazos, del más reciente al más antiguo | CP-HU3-01 Se muestran todos los datos generales del aspirante | I, E2E | HU3-10, HU3-11 | Pendiente |
| | CP-HU3-02 El historial mezcla los tres tipos y queda ordenado del más reciente al más antiguo | U | HU3-9 | Pendiente |
| | CP-HU3-03 Dos eventos con la misma fecha mantienen un orden estable | U | HU3-9 | Pendiente |
| | CP-HU3-04 Un aspirante sin historial muestra el mensaje de «sin movimientos» | I, E2E | HU3-10, HU3-11 | Pendiente |
| | CP-HU3-05 Un aspirante con motivos de rechazo los muestra en la lista | I | HU3-10 | Pendiente |
| | CP-HU3-06 Un colaborador no puede ver un aspirante de otra cartera (403) | I | HU3-10 | Pendiente |
| | CP-HU3-07 Un aspirante inexistente responde 404 y la pantalla permite regresar | I, E2E | HU3-10, HU3-11 | Pendiente |
| **C2.** Al seleccionar la opción de chat se abre la vista de mensajería con la conversación de ese estudiante | CP-HU3-08 El botón Chat abre la conversación del aspirante correcto (solo lectura) | E2E | HU3-11 | Pendiente |

## HU 6A: Registro de colaboradores, carreras y distribución (entra al Sprint 1)

> **Ojo con el criterio 1:** menciona una contraseña temporal, pero con Active Directory el CRM **ya no maneja contraseñas** (ver desglose del Sprint 1). Hay que confirmarlo con el PO en BASE-1; mientras tanto, los casos no incluyen contraseña.

| Criterio | Caso de prueba | Tipo | Tarea | Estado |
|---|---|---|---|---|
| **C1.** El administrador ingresa el id, el sistema obtiene los datos personales, se elige el campus y se guarda un borrador | CP-HU6-01 Un id existente muestra foto, nombre, correo y teléfono | I, E2E | HU6-21, HU6-22 | Pendiente |
| | CP-HU6-02 Un id inexistente muestra un error | U | HU6-20 | Pendiente |
| | CP-HU6-03 Un id ya registrado no se puede volver a registrar | U | HU6-20 | Pendiente |
| | CP-HU6-04 «Continuar» queda bloqueado sin campus | U, E2E | HU6-20, HU6-22 | Pendiente |
| | CP-HU6-05 El borrador se guarda temporalmente para asignar carreras | I | HU6-21 | Pendiente |
| **C2.** Se propone una distribución equitativa y, al confirmar, el perfil queda registrado y se notifica por correo | CP-HU6-06 Si es el único colaborador del campus, recibe todas las carreras | U | HU6-20 | Pendiente |
| | CP-HU6-07 Con varios colaboradores, el reparto es equitativo (incluye carreras desbalanceadas y compartidas) | U | HU6-20 | Pendiente |
| | CP-HU6-08 La propuesta excluye a los colaboradores inactivos | U | HU6-20 | Pendiente |
| | CP-HU6-09 Al confirmar: perfil activo con rol, carreras asignadas y aspirantes reasignados con su expediente, historial y conversación | I | HU6-21 | Pendiente |
| | CP-HU6-10 Si algo falla al confirmar, no queda nada guardado (reversión) | I | HU6-21 | Pendiente |
| | CP-HU6-11 Se publica el evento de registro confirmado y los correos llegan al nuevo colaborador y a quienes ceden aspirantes | I, E2E | HU6-21, HU6-22 | Pendiente |
| | CP-HU6-12 Si el correo falla, se reintenta y se avisa al administrador | I | HU6-21 | Pendiente |
| **C3.** Sin al menos una carrera, el sistema bloquea la operación e indica el motivo | CP-HU6-13 Guardar sin carreras muestra el motivo y no registra | U, E2E | HU6-20, HU6-22 | Pendiente |
| *(transversal)* Solo el administrador accede | CP-HU6-14 Un colaborador no entra a las rutas de registro | I | AUT-5, HU6-23 | Pendiente |
| *(transversal)* Datos personales fuera de los registros (logs) | CP-HU6-15 Los datos personales del colaborador no aparecen en los logs | I | HU6-23 | Pendiente |

## HU 6B: Inactivación y casos especiales (siguiente sprint)

Los criterios 4 y 5 de HU 6 se construyen y se prueban en el Sprint 2, junto con HU 7.

| Criterio | Caso de prueba | Tipo | Tarea | Estado |
|---|---|---|---|---|
| **C4.** Marcar inactivo reasigna equitativamente la cartera a los activos del mismo campus | CP-HU6-16 Inactivar con respaldo reasigna y notifica | U, I, E2E | HU6-20, HU6-22 (ampliar) | Sprint 2 |
| | CP-HU6-17 Si es el único activo del campus, se bloquea y pide registrar a otro antes | U, E2E | HU6-20, HU6-22 (ampliar) | Sprint 2 |
| **C5.** Con la casilla de casos especiales se pueden transferir expedientes de otros campus | CP-HU6-18 La transferencia manual solo es posible hacia perfiles con la casilla activa | I, E2E | HU6-22 (ampliar) | Sprint 2 |

## HU 2: Monitoreo y filtrado de aspirantes

**No tengo el texto de los criterios de aceptación de HU 2**, así que estos casos salen del desglose de tareas y **no** de los criterios oficiales. Hay que pegar los criterios y mapear cada caso a uno.

| Criterio | Caso de prueba (derivado del desglose) | Tipo | Tarea | Estado |
|---|---|---|---|---|
| *(pegar criterio)* | CP-HU2-01 Cada filtro por separado devuelve los resultados esperados | I | HU2-13 | Pendiente |
| | CP-HU2-02 Los filtros combinados devuelven la intersección correcta | U, I | HU2-12, HU2-13 | Pendiente |
| | CP-HU2-03 La búsqueda por nombre ignora mayúsculas y acentos | U, I | HU2-12, HU2-13 | Pendiente |
| | CP-HU2-04 Por defecto el interruptor oculta a los aceptados; al activarlo los incluye | U, E2E | HU2-12, HU2-14 | Pendiente |
| | CP-HU2-05 Orden ascendente y descendente por un campo, con paginación y total | U, I | HU2-12, HU2-13 | Pendiente |
| | CP-HU2-06 Sin resultados muestra el mensaje y permite restablecer los filtros | E2E | HU2-14 | Pendiente |
| | CP-HU2-07 Cada colaborador ve solo sus aspirantes | I | HU2-13 | Pendiente |
| | CP-HU2-08 La lista responde en tiempo aceptable con miles de aspirantes | no funcional | HU2-14, QA-3 | Pendiente |

## Autenticación (base de las tres HU)

| Caso de prueba | Tipo | Tarea | Estado |
|---|---|---|---|
| CP-AUT-01 Inicio de sesión con identidad válida (adaptador simulado) y cierre de sesión | I | AUT-5 | Pendiente |
| CP-AUT-02 Se asigna el rol (administrador o colaborador) desde el esquema Usuarios | U, I | AUT-5 | Pendiente |
| CP-AUT-03 Se rechaza a quien exista en el directorio pero no esté registrado o esté inactivo | I | AUT-5 | Pendiente |
| CP-AUT-04 Credenciales inválidas, usuario sin acceso y servicio de identidad caído muestran su mensaje | E2E | AUT-4, AUT-5 | Pendiente |
| CP-AUT-05 Un colaborador no entra a rutas de administrador | I | AUT-5 | Pendiente |

## Recorrido de humo (QA-2)

Login → lista de aspirantes → expediente → registro de colaborador. Se automatiza en la integración continua.
