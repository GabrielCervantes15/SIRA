# SIRA · Integración del panel HU9 para Administrador

## Cómo queda el recorrido

1. El usuario inicia sesión en SIRA.
2. Entra a **Mensajes** desde la navegación principal.
3. Si la sesión corresponde al rol **Administrador**, aparece **Configurar envío de mensajes**.
4. Al pulsarlo se abre el panel lateral dentro de Mensajes. No se necesita abrir ni escribir una URL.
5. El panel consulta y guarda la configuración mediante `GET` y `PUT /api/v1/mensajes/configuracion`.

La entrada permanece oculta para Colaborador. No se creó una página o módulo independiente de Configuración: el panel vive dentro de Mensajes, conforme a la definición funcional HU9.

## Seguridad aplicada

- El botón comienza oculto y solo se habilita si `/api/v1/auth/session` devuelve `usuario.rol === "administrador"`.
- El frontend no envía el rol ni el identificador del usuario para autorizar la operación.
- El servidor obtiene la identidad desde la cookie de sesión `HttpOnly` y entrega ese usuario al módulo Mensajes.
- Los casos de uso del backend exigen sesión válida y rol Administrador: sin sesión responde `401`; Colaborador recibe `403` tanto al consultar como al guardar.
- Se reutiliza la autenticación existente de SIRA; no se crea un sistema paralelo de roles.
- Las solicitudes del frontend son same-origin y usan `cache: "no-store"`.

## Archivos

Los archivos incluidos en este paquete conservan sus rutas relativas al proyecto. Extrae el ZIP en la raíz de SIRA y permite reemplazar los archivos existentes.

## Verificación

Desde la raíz del proyecto:

```bash
node --test test/hu9-configuracion-mensajes.test.js test/hu9-navegacion-admin.test.js
npm run lint
```

En la copia revisada, las pruebas específicas HU9 pasan **11/11** y el lint revisa **68 archivos JavaScript sin errores**.

La suite completa del ZIP contiene otros fallos ajenos a esta integración (principalmente rutas HU6/EQ-62 y un export faltante de HU3). En la copia original se observaron 13 fallos; con esta integración quedan 12, porque se corrige además la prueba HTTP de configuración HU9.

## Nota sobre persistencia

En esta integración, el servidor crea `crearModuloMensajes()` con su repositorio en memoria predeterminado, igual que el modo de desarrollo de la copia recibida. La configuración se consulta y guarda en el servidor, pero se reinicia al reiniciar el proceso. La clase `RepositorioConfiguracionPostgres` ya existe en el proyecto; para conservar cambios entre reinicios se debe inyectar esa implementación con el pool PostgreSQL real cuando se conecte el cliente `pg` en el arranque. No se presenta el repositorio en memoria como persistencia definitiva.
