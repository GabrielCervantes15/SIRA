# Contrato del módulo de integración Autenticación (Active Directory ITSON)

**Tarea:** EQ-12 · BASE-7 · Sprint 1  
**Estado:** Implementado  
**Código:** `src/modulos/autenticacion/` · **Pruebas:** `test/autenticacion.test.js` · **Demo:** `scripts/demo-autenticacion.js`

---

## 1. Propósito

Autenticación es un **módulo de integración** (adaptador) en la arquitectura: aísla la conexión con el **Active Directory institucional (ITSON)** y entrega al resto del sistema la verificación de credenciales y los datos del colaborador.

En el Sprint 1 **no se implementa la conexión real con Active Directory ni Kerberos**. La identidad proviene de datos semilla a través de un **adaptador simulado** que cumple exactamente el mismo contrato que tendrá el adaptador de producción.

El CRM **no administra ni guarda contraseñas**; delega la autenticación íntegramente al directorio institucional.

---

## 2. Lugar en la Arquitectura (Puertos y Adaptadores)

```
Active Directory ITSON  ⇄ LDAP / Kerberos / SSO ⇄  [Módulo de integración: Autenticación]
                                                               │ implementa
                                                               ▼
                                                  Puerto: IProveedorAutenticacion
                                                               ▲
                                                               │ consume
               ┌───────────────────────────────────────────────┴───────────────────────────────┐
               │                                                                               │
   [Módulo de Seguridad / Auth]                                                  [Módulo de Colaboradores (HU 6)]
      - Inicio de sesión (AUT-1)                                                    - Registro por ID (HU6-5)
      - Consulta rol en 'usuarios' (AUT-2)                                          - Autocompletado de foto y datos
```

---

## 3. Interfaz Pública (Puerto `IProveedorAutenticacion`)

| Método | Parámetros | Retorno | Descripción |
|---|---|---|---|
| `autenticar(idInstitucional, password)` | `idInstitucional: string`, `password?: string` | `Promise<ResultadoAutenticacion>` | Valida identidad. Devuelve estado y perfil sin exponer la contraseña. |
| `obtenerPorIdInstitucional(idInstitucional)` | `idInstitucional: string` | `Promise<PerfilColaborador \| null>` | Consulta los datos institucionales por ID. Devuelve `null` si no existe. |

Ambos métodos pueden lanzar `ErrorAutenticacion` con código `SERVICIO_NO_DISPONIBLE` si el directorio institucional no responde o experimenta tiempo de espera agotado.

### Tipos de Datos

#### `PerfilColaborador`
| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idInstitucional` | texto | Sí | Matrícula / ID institucional del empleado (ej. `"00000252115"`). |
| `nombreCompleto` | texto | Sí | Nombre y apellidos. |
| `correoInstitucional` | texto | Sí | Correo `@itson.edu.mx` o `@potros.itson.edu.mx`. |
| `telefono` | texto | Sí | Teléfono institucional o móvil con formato E.164 (`+52...`). |
| `fotoUrl` | texto | Sí | URL o recurso Data URI de la fotografía oficial. |

#### `ResultadoAutenticacion`
| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `autenticado` | booleano | Sí | `true` si la identidad fue verificada con éxito. |
| `colaborador` | `PerfilColaborador \| null` | Sí | Datos del colaborador autenticado. |
| `motivoFalla` | texto \| null | No | `"USUARIO_INEXISTENTE"`, `"CREDENCIALES_INVALIDAS"`, `"CUENTA_BLOQUEADA"`. |

---

## 4. Quién usa este contrato

| Quién | Tarea | Uso |
|---|---|---|
| **Módulo Autenticación / Login** | AUT-1, AUT-2 | Valida las credenciales en la pantalla de acceso. Al autenticarse, consulta el rol (`colaborador` o `administrador`) en el esquema `usuarios` del CRM. |
| **Módulo Colaboradores** | HU6-5 | En el paso 1 del registro de colaboradores, el administrador ingresa el ID y el sistema obtiene automáticamente nombre, foto, correo y teléfono desde este proveedor. |
| **Adaptador Real (Fase posterior)** | Post-Sprint 1 | Conexión real vía Kerberos / SPNEGO / LDAP contra el Active Directory institucional de ITSON. |

---

## 5. Adaptador Simulado (`crearProveedorAutenticacionSimulado`)

Implementa el puerto en memoria utilizando los datos de `datos-semilla/autenticacion.json`. Provee métodos auxiliares para pruebas:

* `simularIndisponibilidad(boolean)`: Provoca que los métodos lancen `ErrorAutenticacion("SERVICIO_NO_DISPONIBLE")` para probar las pantallas de error de red (AUT-4).
* `agregarUsuario(usuario)`: Inserta un colaborador de prueba en memoria sin reiniciar la suite de pruebas.

### Ejecución de Pruebas y Demo

```bash
npm test                                  # Ejecuta suite completa incluyendo autenticacion.test.js
node scripts/demo-autenticacion.js        # Ejecuta la demo interactiva con datos semilla
```

