# ADR-001: Adopción de Monolito Modular con Puertos y Adaptadores, Aislamiento de Esquemas y Cero Dependencias Externas

- **Estado:** Aprobado (Vigente en Sprints 1 y 2)
- **Fecha:** 2026-11-26
- **Tickets relacionados:** `EQ-7` (`BASE-2`), `EQ-53` (`BASE-5`), `EQ-59` (`HU6-9`), `EQ-69` (`HU6-10`), `EQ-24` (`QA-5`)
- **Referencias:** [propiedad-esquemas.md](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/docs/arquitectura/propiedad-esquemas.md), [modelo-de-datos.md](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/docs/modelado/modelo-de-datos.md)

---

## 1. Contexto

El sistema **SIRA** (CRM de Seguimiento de Aspirantes del ITSON) requiere coordinar múltiples dominios de negocio:
1. **Autenticación e Identidad** (`src/modulos/autenticacion/`).
2. **Monitoreo y Expediente del Aspirante** (`src/modulos/monitoreo/`).
3. **Administración de Colaboradores y Distribución de Carreras** (`src/modulos/colaboradores/`, `src/modulos/distribucion-carreras/`).
4. **Configuración de Mensajes y Catálogo IA** (`src/modulos/mensajes/`, `src/modulos/mensajes-ia/`).
5. **Disparo Automático de Lotes y Canales de Salida** (`src/modulos/disparo-automatico/`, `src/modulos/whatsapp/`, `src/modulos/notificaciones/`).
6. **Integración con Registro Escolar** (`src/modulos/registro-escolar/`).

El equipo de desarrollo necesitaba una arquitectura que:
- Permitiera a múltiples desarrolladores trabajar en paralelo sin acoplar tablas ni romper contratos entre historias de usuario (`HU 1`, `HU 2`, `HU 3`, `HU 6`, `HU 8`, `HU 9`).
- Garantizara ejecución determinista, rápida y sin problemas de cadena de suministro (`npm install`) tanto en máquinas locales como en contenedores Docker y pipelines de CI.
- Mantuviera abierta la posibilidad de extraer un módulo a un servicio independiente en el futuro sin reescribir su lógica de dominio.

---

## 2. Decisión

Se decidió construir SIRA bajo una arquitectura de **Monolito Modular con Puertos y Adaptadores (Arquitectura Hexagonal)** sobre **Node.js >= 20 (ESM nativo, cero dependencias externas de `npm`)** y **PostgreSQL 16 con aislamiento por esquemas**:

1. **Un módulo por dominio de negocio con arquitectura hexagonal (`dominio/`, `aplicacion/`, `infraestructura/`):**
   - Cada módulo expone únicamente una fábrica pública en su `index.js` (p. ej. `crearModuloMonitoreo`, `crearModuloColaboradores`, `crearModuloMensajes`).
   - Los controladores HTTP y adaptadores de base de datos viven en `infraestructura/`, mientras que las reglas de negocio y casos de uso no dependen de HTTP ni de SQL.
2. **Propiedad exclusiva de esquemas en PostgreSQL y prohibición de llaves foráneas cruzadas (`BASE-5`):**
   - Cada módulo es dueño exclusivo de su esquema (`usuarios`, `aspirantes`, `mensajes`, `disparo`, `alertas`, `conocimiento`).
   - Ningún módulo puede ejecutar `SELECT`, `INSERT`, `UPDATE` o `DELETE` sobre tablas de un esquema ajeno, ni existen `FOREIGN KEY` entre esquemas distintos.
   - La comunicación síncrona entre módulos ocurre estrictamente a través de interfaces públicas inyectadas en el punto de ensamblado ([src/servidor.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/servidor.js) / [src/ensamblar.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/ensamblar.js)), como `moduloMonitoreo.cartera` o `moduloMensajes.interfazLectura`.
3. **Coordinación transaccional entre esquemas mediante Patrón Saga con Compensación (`deshacer()`):**
   - Cuando un caso de uso modifica dos esquemas propietarios distintos (por ejemplo, `ConfirmarRegistroCasoUso`, `ConfirmarBajaCasoUso` o `TransferirAspiranteManualCasoUso`, que actualizan `usuarios` y reasignan carteras en `aspirantes`), la operación abre `repositorioColaboradores.transaccion(tx => ...)` sobre `usuarios` y solicita el cambio de cartera a `moduloMonitoreo.cartera`, el cual devuelve una clausura de compensación `deshacer()`.
   - Si falla la escritura de la bitácora o el `COMMIT` en `usuarios`, el bloque `catch` revierte `usuarios` (`ROLLBACK` o restauración de instantánea) e invoca `await movimiento.deshacer()` para restaurar exactamente los `colaborador_id` anteriores en `aspirantes`, sin publicar ningún evento.
4. **Comunicación asíncrona mediante Bus de Eventos (`crm.eventos`):**
   - Los efectos secundarios entre módulos (envío de correos de bienvenida o reasignación, encolado de envíos de WhatsApp/correo, actualización de historiales por resultados de envío y refresco reactivo de configuración) se publican como eventos de dominio en el exchange tipo `topic` `crm.eventos` únicamente después de confirmar la transacción principal.
5. **Stack Cero Dependencias Externas (Node.js >= 20 Nativo):**
   - Se utilizan exclusivamente módulos nativos de Node.js (`node:http`, `node:crypto`, `node:net`, `node:fs`, `node:test`, `node:assert/strict`, `Intl.DateTimeFormat`, `fetch` nativo) y Vanilla JS (ES Modules) en el frontend.

---

## 3. Alternativas Consideradas

### Alternativa A: Microservicios distribuidos desde el Sprint 1
- **Ventajas:** Aislamiento físico total de procesos y bases de datos por servicio.
- **Motivo de descarte:** Sobrecarga operativa desproporcionada para el tamaño del equipo y alcance de los Sprints 1 y 2 (despliegue de 6+ contenedores de aplicación, latencia de red interna, trazabilidad distribuida y complejidad en pruebas E2E). El Monolito Modular ofrece el mismo desacoplamiento lógico sin el costo operativo de red.

### Alternativa B: Monolito tradicional en capas con modelo de datos compartido (FKs globales)
- **Ventajas:** Permite hacer `JOIN` y transacciones SQL directas entre `usuarios` y `aspirantes` desde cualquier controlador.
- **Motivo de descarte:** Genera acoplamiento fuerte entre las tablas de todos los desarrolladores; un cambio en el esquema de `usuarios` rompe consultas de `monitoreo` o `disparo-automatico` y vuelve imposible extraer módulos en el futuro.

### Alternativa C: Uso de frameworks y ORMs externos (Express/Fastify, Prisma/TypeORM, Jest)
- **Ventajas:** Ecosistema conocido de middlewares y generadores de esquemas.
- **Motivo de descarte:** Introduce cientos de dependencias transitivas en `node_modules`, tiempos de instalación/compilación lentos en Docker y fricción de configuración con ES Modules nativos. Con Node.js >= 20 (`node:test`, `node:http`, `fetch`), el código propio es más explícito, auditable y ejecuta las 464 pruebas en ~4.5 segundos.

---

## 4. Consecuencias

### Positivas
- **Velocidad y confiabilidad de pruebas:** La suite completa (`464` pruebas unitarias, de integración y E2E HTTP/SMTP) corre en menos de 5 segundos sin requerir descargas de paquetes externos.
- **Fronteras de módulo verificables:** El cumplimiento de contratos (`METODOS_REPOSITORIO_MONITOREO`, `METODOS_REPOSITORIO_COLABORADORES`) y la propiedad de esquemas están protegidos por pruebas automatizadas.
- **Preparación real para extracción futura:** Al no existir FKs cruzadas entre esquemas y comunicarse solo por puertos o eventos en `crm.eventos`, cualquier módulo puede migrarse a su propio proceso o base de datos reemplazando únicamente su adaptador de infraestructura.

### Negativas / Compromisos (Trade-offs)
- **Consistencia eventual / compensación explícita:** Las operaciones que cruzan `usuarios` y `aspirantes` requieren programar y probar explícitamente la función de compensación `deshacer()` en lugar de depender de un único `ROLLBACK` monolítico sobre todas las tablas.
- **Implementación manual de utilidades de protocolo:** Al no usar librerías de terceros, componentes como el enrutador HTTP, el cliente SMTP mínimo ([servicio-correo-smtp.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/notificaciones/servicio-correo-smtp.js)) y la validación HMAC del webhook ([webhook.js](file:///c:/Users/sonic/OneDrive/Documentos/GitHub/SIRA/src/modulos/whatsapp/webhook.js)) se mantienen y prueban internamente dentro del repositorio.
