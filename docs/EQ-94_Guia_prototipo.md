
# EQ-94 — Guía del prototipo de mensajes predefinidos

## Objetivo

Representar la consulta de mensajes predefinidos de HU8 mediante un prototipo navegable.

## Funcionalidades

- Navegación por categorías Envío y Respuesta.
- Listado de mensajes.
- Búsqueda por nombre y resumen.
- Selección de mensajes.
- Vista previa del contenido.
- Visualización de variables y reglas.
- Estados de carga, error y vacío.
- Consulta de solo lectura.

## Estructura

- prototipos/mensajes-predefinidos/index.html
- prototipos/mensajes-predefinidos/estilos.css
- prototipos/mensajes-predefinidos/catalogo.js
- prototipos/mensajes-predefinidos/app.js
- prototipos/mensajes-predefinidos/pruebas.js

## Datos

Los datos son demostrativos. No sustituyen el catálogo definitivo ni las decisiones pendientes del PO.

El texto de reactivación de HU1 corresponde al aprobado en HU8-1.

Los demás textos y reglas pendientes se identifican expresamente como tales.

## Restricciones

- No permite crear mensajes.
- No permite editar mensajes.
- No permite eliminar mensajes.
- No realiza envíos reales.
- No consume endpoints de producción.
- No modifica los módulos de EQ-78.

## Ejecución

Abrir index.html en un navegador o servir la carpeta mediante un servidor HTTP local.

Para ejecutar pruebas:

node prototipos/mensajes-predefinidos/pruebas.js

## Alcance

Este prototipo corresponde a EQ-94 y no sustituye las tareas de modelo de datos, endpoints, interfaz de producción ni pruebas de aceptación.
