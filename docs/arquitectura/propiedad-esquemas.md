# BASE-2 — Arquitectura modular y propiedad de esquemas

**Proyecto:** SIRA — CRM de Seguimiento de Aspirantes
**Ticket:** EQ-7
**Sprint:** 1

## 1. Arquitectura adoptada

SIRA utiliza una arquitectura de monolito modular basada en separación de responsabilidades, interfaces públicas e inyección de dependencias.

Los módulos implementados actualmente son:

- Autenticación.
- Monitoreo.
- Registro Escolar.

La aplicación cuenta con un punto de ensamblado (`src/ensamblar.js`) y un bus de eventos simulado para la comunicación entre componentes.

Los módulos adicionales se incorporarán de acuerdo con las historias de usuario de futuros sprints.

## 2. Propiedad de los esquemas

| Esquema | Módulo responsable |
|---|---|
| usuarios | Seguridad/Usuarios, responsabilidad definida y pendiente de implementación específica |
| aspirantes | Monitoreo, en la implementación actual |
| alertas | Alertas, módulo futuro |
| conocimiento | Conocimiento, módulo futuro |

Autenticación y Registro Escolar son módulos de integración y no tienen permiso de escritura directa sobre los esquemas de otros módulos.

## 3. Comunicación entre módulos

Cada módulo es responsable de las modificaciones a los datos de su esquema.

Los demás módulos deben comunicarse mediante interfaces públicas, casos de uso o eventos.

En el Sprint 1 se utiliza un bus de eventos en memoria y repositorios simulados.

## 4. Decisión sobre HU6-9

El módulo Colaboradores no modificará directamente las tablas pertenecientes a Aspirantes.

Las reasignaciones deberán solicitarse mediante la interfaz pública del módulo propietario.

Cuando se implemente la persistencia en PostgreSQL, las operaciones que requieran cambios atómicos en varios esquemas deberán coordinarse mediante un mecanismo transaccional definido en la capa de aplicación.

Esta decisión establece la responsabilidad arquitectónica; la operación transaccional de HU6-9 queda pendiente de implementación.

## 5. Alcance del Sprint 1

Se valida la estructura modular inicial, las interfaces existentes, la integración de módulos y las decisiones de propiedad de datos.

No forma parte de esta validación implementar todos los módulos futuros, conectar Active Directory real ni desarrollar las transacciones de HU6-9.

La suite automatizada registró 84 pruebas aprobadas, sin fallos.