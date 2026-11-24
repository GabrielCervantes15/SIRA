# EQ-78 — Prototipo de envío de mensajes

## Alcance

EQ-78 agrega al apartado Aspirantes una tarjeta «Mensajes automáticos» y un modal para preparar un lote de demostración. No sustituye el catálogo de mensajes ni la configuración administrativa de EQ-103.

## Archivos

- `frontend/index.html`: tarjeta de acceso y estructura del modal.
- `frontend/css/envio-mensajes.css`: estilos aditivos del módulo.
- `frontend/js/envio-mensajes.js`: interacción, filtros y simulación.
- `frontend/js/envio-mensajes-validaciones.js`: reglas de elegibilidad del lote.
- `prototipos/configuracion-mensajes/envio-mensajes/pruebas.js`: pruebas unitarias de las reglas.

## Reglas de demostración

- Semáforos amarillo, naranja y rojo; verde excluido.
- Selección múltiple de carreras.
- Inactividad mínima configurable en días, semanas o meses; valor inicial de 7 días.
- Correo desactivado inicialmente.
- Aspirantes fuera de cartera, aceptados/rechazados definitivamente o contactados hace menos de 48 horas quedan excluidos.
- Se cuentan aspirantes únicos.
- Solo un menú desplegable personalizado permanece abierto a la vez.
- El escenario «Fuera de horario» bloquea el envío; «Cero aspirantes» muestra un conteo de cero.

## Seguridad y límites

El módulo usa datos ficticios en memoria. El botón «Enviar» únicamente simula el procesamiento y muestra un resultado local. No llama a WhatsApp, correo ni endpoints reales.

## Pruebas

Desde la raíz del repositorio:

```powershell
node prototipos/configuracion-mensajes/envio-mensajes/pruebas.js
npm test
```

## Ejecución

```powershell
npm start
```

Abrir `http://localhost:3000`, iniciar sesión con un usuario colaborador y entrar a Aspirantes. La tarjeta «Mensajes automáticos» abre el modal EQ-78.
