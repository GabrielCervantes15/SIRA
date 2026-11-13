# EQ-62 + EQ-63 · Registro de colaboradores · Sprint 1

## Alcance entregado

**EQ-62 (HU6-15):** Frontend del paso 1: ingresar ID, consultar el adaptador simulado de Autenticación, mostrar foto (con avatar alternativo), nombre, correo y teléfono en campos de solo lectura, seleccionar campus, mantener **Continuar** deshabilitado hasta tener perfil válido y campus seleccionado. Manejo de ID inválido/inexistente y respuesta de duplicado cuando el proveedor de EQ-55 lo indique.

**EQ-63 (HU6-16):** Frontend del paso 2: listar carreras del campus, permitir selección múltiple, bloquear **Guardar borrador** si no se ha elegido ninguna, mostrar claramente el motivo, validar también en el servidor las carreras seleccionadas y conservar el borrador temporal.

**Protección:** Interfaz y endpoints de registro accesibles solo para `administrador` usando el control de acceso existente (EQ-17). Autenticación y credenciales no se gestionan en el frontend de colaboradores.

### Qué es simulado y qué falta integrar

- **EQ-55 (Leonel):** La consulta por ID utiliza el adaptador de Autenticación ya disponible en el proyecto. La detección de colaboradores previamente registrados se puede inyectar con `idsColaboradoresYaRegistrados` mientras EQ-55 implementa la consulta oficial al CRM; **la consulta real de duplicados NO está integrada todavía**.
- **EQ-57 (Gabriel):** Se usa un catálogo *temporal* derivado de `datos-semilla/aspirantes.json`; no es el catálogo académico oficial. El adaptador `catalogoRegistro` se puede inyectar en `crearServidor` al integrar el servicio de Gabriel. La API solo envía las carreras disponibles para cada campus.
- **EQ-56 (ya implementado):** El guardado de borradores se extiende para conservar opcionalmente una lista de carreras. Es un `Map` en memoria, que se borra al reiniciar el servidor.
- **EQ-64 (Leonel):** El paso 3 de revisión, la confirmación, la distribución de aspirantes y las notificaciones siguen fuera del alcance. **Guardar borrador NO significa alta final**.

## Cómo demostrarlo en clase

Desde la raíz del repositorio:

```powershell
npm test
npm run lint
npm start
```

Abre `http://localhost:3000/` e inicia sesión como **administrador de prueba** de `datos-semilla/autenticacion.json` (en el proyecto semilla, ID `00000100001`; su contraseña de prueba se encuentra en el mismo archivo). Haz clic en **Colaboradores** o abre `http://localhost:3000/app/colaboradores/registro.html` después de iniciar sesión.

1. Muestra que **Continuar** aparece deshabilitado al abrir el paso 1.
2. Escribe un ID inexistente, por ejemplo `99999999999`: aparece un error.
3. Busca un ID de colaborador existente del archivo semilla, por ejemplo `00000247933`. Aparecen sus datos en solo lectura.
4. Elige **Campus Obregón Náinari**: se habilita **Continuar**.
5. En el paso 2, demuestra que sin carrera seleccionada aparece el mensaje de validación y **Guardar borrador** está deshabilitado.
6. Marca una carrera, guarda y muestra la confirmación **Borrador guardado**, sin alta definitiva.
7. Si quieres mostrar la seguridad, entra con una cuenta `colaborador`: el registro administrativo no se presenta ni se puede acceder a las rutas por URL.

> Las fotografías del adaptador usan URL institucionales ficticias; la interfaz muestra iniciales cuando no están disponibles. No publicar contraseñas ni perfiles de personas reales en las capturas.

## Contratos temporales (solo para demo integrada)

| Método y ruta | Propósito |
|---|---|
| `GET /api/v1/colaboradores/registro/catalogo` | Devuelve `campus`, `carrerasPorCampus` y `origen` |
| `GET /api/v1/colaboradores/registro/perfil/:id` | Obtiene el perfil simulado del directorio; no expone contraseñas |
| `POST /api/v1/colaboradores/registro/borrador` | Guarda `{idInstitucional,campus,carreras?}` y rechaza campos inválidos |
| `GET /api/v1/colaboradores/registro/borrador/:id` | Recupera un borrador temporal para pruebas |
| `GET /app/colaboradores/registro.html` | Frontend administrativo |

Los endpoints devuelven 401 sin sesión y 403 si el rol no es administrador. Los errores de validación usan 400, 404, 409 o 422 según el caso. Estas rutas de **demo** pueden reemplazarse por el controlador oficial una vez que EQ-55 y EQ-57 estén integrados.

## Resultado de calidad

- `npm test`: **113/113** pruebas aprobadas en el entorno de trabajo con el ZIP del 13/11/2026: 102 existentes y 11 nuevas (incluida la regresión de borradores).
- `npm run lint`: validación de sintaxis exitosa.
- Nuevas pruebas: `test/registro-colaboradores-http.test.js`.
- Validaciones frontend verificables en: `frontend/colaboradores/validaciones.js`.

## Rama y pull request

**Rama sugerida:** `feature/EQ-62-EQ-63-registro-colaboradores`.

Si usas el parche entregado junto con este proyecto, **no reemplaces tu carpeta `.git` ni vuelvas a inicializar el repositorio**. Desde tu copia local actualizada:

```powershell
git switch main
git pull --ff-only origin main
git switch -c feature/EQ-62-EQ-63-registro-colaboradores
git apply --check "C:\RUTA\SIRA_EQ-62_EQ-63.patch"
git apply "C:\RUTA\SIRA_EQ-62_EQ-63.patch"
npm test
npm run lint
git add frontend src test docs
git commit -m "feat(EQ-62,EQ-63): registro de colaboradores pasos 1 y 2"
git push -u origin feature/EQ-62-EQ-63-registro-colaboradores
```

**Si ya existe la rama:** cámbiate a ella (`git switch ...`) en lugar de crearla de nuevo. Si Git informa conflictos, revísalos con el equipo; no fuerces el push. Abre un PR de esta rama a `main`, comprueba CI, obtén revisión de tu equipo y **solo entonces** fusiona. No trabajar directamente sobre `main` mientras se revisa.

### Texto sugerido para PR

**Título:** `EQ-62 + EQ-63 · HU6A · Registro de colaboradores: pasos 1 y 2`

**Descripción:**
- Vista administrativa de registro en dos pasos, integrada con la sesión y roles existentes.
- Paso 1: búsqueda por ID, perfil de solo lectura, selección y validación de campus.
- Paso 2: catálogo de carreras por campus, selección múltiple y bloqueo sin carreras.
- Borrador en memoria validado también en el servidor; sin confirmación definitiva.
- Pruebas automatizadas nuevas y regresión satisfactoria.
- Dependencias por integrar: EQ-55 (duplicados), EQ-57 (catálogo definitivo) y EQ-64 (confirmación).

### Texto de Jira para EQ-62

**Comentario:** "Implementada la interfaz de paso 1 de HU6A: búsqueda de colaborador por ID con adaptador simulado, datos personales en solo lectura, selector de campus y botón Continuar bloqueado hasta completar los requisitos. Incluye validaciones, errores, control de acceso de administrador y pruebas HTTP/UI de estado. Evidencia: PR de rama feature/EQ-62-EQ-63-registro-colaboradores. Pendiente conectar la validación definitiva de duplicados con EQ-55."

### Texto de Jira para EQ-63

**Comentario:** "Implementada la interfaz de paso 2 de HU6A: carreras filtradas por campus, selección múltiple, mensaje de obligatoriedad, botón Guardar borrador deshabilitado sin carreras y validación equivalente en API. El borrador temporal conserva las carreras elegidas. Evidencia: PR de rama feature/EQ-62-EQ-63-registro-colaboradores. El catálogo oficial depende de EQ-57 y la confirmación corresponde a EQ-64."

**Estados Jira recomendados:** pasar a **En progreso** mientras se revisa el PR; usar **Finalizada** solo tras revisar, integrar y cumplir la definición de terminado acordada por el equipo. Los pendientes de otros tickets no se deben presentar como implementados.
