# EQ-30 — Instalación y pruebas del monitoreo SIRA

Esta entrega agrega el frontend del monitoreo y conecta el interruptor de aspirantes aceptados con el endpoint oficial desarrollado en EQ-29.

## Archivos incluidos

- `public/app/index.html`: estructura de la pantalla de monitoreo basada en el prototipo ITSON.
- `public/app/app.js`: sesión, consulta del endpoint, interruptor EQ-30, búsqueda por nombre, paginación y columnas visibles.
- `public/app/styles.css`: estilos responsive.
- `docs/EQ-30-guia-pruebas.md`: esta guía.

## Dónde copiar

Copiar el contenido de la carpeta `SIRA` de este paquete dentro de la raíz del repositorio local `SIRA`.

Los tres archivos de `public/app/` reemplazan sus versiones actuales. El documento de `docs/` se agrega.

## No modificar

No reemplazar ni mover:

- `.git/`
- `node_modules/`
- `.env`
- `package.json`
- `src/servidor.js`
- `src/modulos/autenticacion/`
- `src/modulos/monitoreo/`
- `datos-semilla/`
- `public/login/`

El servidor actual ya entrega `/app/` y los recursos `/app/*.js` y `/app/*.css`; también registra el módulo de monitoreo. Esta entrega no necesita crear otra ruta de API.

## Contrato usado

Listado:
`GET /api/monitoreo/aspirantes`

Parámetros:
- `mostrar_aceptados=false` al entrar (oculta solicitudes con estado `ACEPTADA`).
- `mostrar_aceptados=true` al activar el interruptor.
- `nombre` para búsqueda parcial.
- `limit` y `offset` para paginación.
- `ordenar_por=fechaSolicitud`
- `orden_direccion=DESC`

Respuesta esperada:
`{ aspirantes: [], total: 0, limit: 12, offset: 0 }`

La consulta usa `credentials: same-origin`; el backend obtiene el colaborador de la sesión y aplica el aislamiento de cartera. El frontend no envía `colaborador_id`.

## Instalación segura

1. Verificar la rama:
   `git branch --show-current`
2. Verificar que no haya cambios locales que deban conservarse:
   `git status`
3. Hacer una copia de seguridad de `public/app/`.
4. Copiar los tres archivos de `public/app/` de este paquete sobre los existentes.
5. Agregar `docs/EQ-30-guia-pruebas.md`.
6. No copiar una carpeta `SIRA` completa encima del repositorio ni reemplazar `.git`.

## Pruebas

Desde la raíz del repositorio:

1. `npm test`
2. `npm run lint`
3. `npm start`
4. Iniciar sesión con un colaborador mock que tenga aspirantes asignados.
5. Abrir `http://localhost:3000/app`.

Comprobar:
- El tablero carga y muestra el nombre del usuario.
- El interruptor inicia desactivado.
- La primera petición contiene `mostrar_aceptados=false`.
- Al activarlo, la petición contiene `mostrar_aceptados=true`.
- Al desactivarlo, vuelve a enviar `false`.
- La búsqueda por nombre conserva el estado del interruptor.
- La paginación conserva el estado del interruptor y la búsqueda.
- El panel de columnas oculta y muestra columnas sin alterar los datos.
- Un 401 redirige al inicio de sesión.
- Cerrar sesión invalida la sesión.

## Alcance y pendientes

Esta entrega implementa la pantalla y el comportamiento de EQ-30. Los filtros combinables adicionales y la experiencia completa del panel de búsqueda deben coordinarse con EQ-34 para evitar duplicar el trabajo asignado a otro integrante. El panel de alertas y mensajes se presenta como espacio visual, no como funcionalidad conectada.

La integración debe validarse en el repositorio local con los datos reales disponibles. No marcar EQ-30 como terminada hasta completar las pruebas visuales y funcionales.
