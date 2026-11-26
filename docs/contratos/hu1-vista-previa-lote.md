# Contrato · Vista previa del lote (HU1-5 · EQ-81)

Código: `src/modulos/disparo-automatico/vista-previa-lote.js` · Pruebas: `test/eq81-vista-previa-lote.test.js`
Reglas: `docs/decisiones/HU1-reglas-lote-envio.md` (EQ-77).

## Endpoint

`GET /api/v1/disparo-mensajes/vista-previa`

Requiere sesión (sin sesión, 401). La cartera siempre es la del usuario de la sesión; cualquier `colaboradorId` en la URL se ignora.

| Parámetro | Ejemplo | Regla |
|---|---|---|
| `semaforos` | `ROJO,NARANJA` | Al menos uno, de las opciones de HU2-7 sin VERDE. No distingue mayúsculas. |
| `carreras` | `Ingeniería en Software` | Al menos una, de las carreras de la cartera (HU2-7). Separadas por comas. |
| `inactividadValor` | `7` | Entero de 1 a 999. |
| `inactividadUnidad` | `DIAS` | `DIAS`, `SEMANAS` o `MESES`. |

## Respuesta (siempre 200 con sesión)

```json
{
  "valido": true,
  "errores": {},
  "semaforosDisponibles": ["NARANJA", "ROJO"],
  "carrerasDisponibles": ["Ingeniería en Software", "Licenciatura en Administración"],
  "fechaCorte": "2026-11-14T18:00:00.000Z",
  "horasContactoPrevio": 48,
  "total": 19,
  "excluidos": { "verde": 16, "estadoSolicitud": 5, "contactoReciente": 0 },
  "dentroDeHorario": false,
  "estadoHorario": { "permitido": false, "...": "..." },
  "mensajeHorario": "Fuera del horario…",
  "mensajesEjemplo": ["Hola, Ana. Tu proceso de ingreso a Ingeniería en Software todavía puede continuar. …"],
  "sinDatosParaMensaje": 0,
  "mensajeReactivacionDisponible": true
}
```

Con filtros inválidos responde `valido: false`, `errores` por campo (`semaforos`, `carreras`, `inactividadValor`, `inactividadUnidad`), `total: 0`, `fechaCorte: null` y `excluidos: null`, pero sí trae las opciones disponibles para que el modal se pueda pintar.

`excluidos` cuenta a quienes se descartaron por regla fija: semáforo VERDE, solicitud ACEPTADA o RECHAZADA, o contacto saliente dentro del tiempo de espera. No incluye a quienes solo quedaron fuera por los filtros elegidos.

## Reglas de conteo

Un aspirante aplica si cumple todo:

1. Es de la cartera del colaborador de la sesión.
2. Su semáforo no es VERDE y está entre los elegidos.
3. Su solicitud no es ACEPTADA ni RECHAZADA.
4. Su carrera está entre las elegidas.
5. Su última actividad (o, si no tiene, su fecha de solicitud) es **igual o anterior** a la fecha de corte. Si no tiene ninguna de las dos fechas, no aplica.
6. No recibió un mensaje SALIENTE en estado ENVIADO, ENTREGADO o LEÍDO dentro del tiempo de espera por contacto previo de HU9 (`tiempoEsperaContactoPrevio` del panel ⚙; 48 h por omisión). Los mensajes FALLIDOS o PENDIENTES no cuentan.

## Fecha de corte

- `DIAS`: se restan bloques exactos de 24 h.
- `SEMANAS`: se restan bloques exactos de 7 × 24 h.
- `MESES`: se restan meses de calendario en UTC. Si el día no existe en el mes destino, se usa su último día (31 mar − 1 mes = 28 feb, o 29 en año bisiesto).

## Mensaje (EQ-84)

El texto sale del mensaje `reactivacion_hu1` del catálogo de HU8 (código: `src/modulos/disparo-automatico/mensaje-reactivacion.js`, pruebas: `test/eq84-mensaje-reactivacion.test.js`), con:

- `{aspirante}`: campo `nombre` del aspirante o, si no lo tiene, la primera palabra de `nombreCompleto`.
- `{carrera}`: `carreraSolicitada`.

En la vista previa:

- `mensajesEjemplo`: hasta 5 textos ya personalizados, sin repetir.
- `sinDatosParaMensaje`: cuántos aplican al lote pero no recibirían mensaje por falta de una variable. Siguen contando en `total`.
- `mensajeReactivacionDisponible`: `false` si el catálogo no tiene el mensaje de reactivación.

## Envío

`POST /api/v1/disparo-mensajes/enviar` usa el mismo servicio, así que trabaja exactamente con quienes cuenta la vista previa. Con filtros inválidos responde 400 `FILTROS_INVALIDOS`.

Antes de enviar arma el mensaje de cada aspirante (EQ-84):

- Si el catálogo no tiene `reactivacion_hu1`, responde 409 `MENSAJE_REACTIVACION_NO_DISPONIBLE` y no envía nada.
- Si a un aspirante le falta una variable, **no se le envía por ningún canal**. Se registra en su historial un evento `NOTA_SEGUIMIENTO` con el título «Mensaje automático no enviado» y el motivo, y se devuelve en `noEnviados`. El fallo no cambia su última actividad.

```json
{
  "totalEnviados": 18,
  "noEnviados": {
    "total": 1,
    "detalles": [
      { "aspiranteId": "asp-016", "nombre": "asp-016", "codigo": "VARIABLE_FALTANTE", "faltantes": ["aspirante"], "motivo": "Falta «aspirante» del aspirante; el mensaje no se envió." }
    ]
  },
  "correo": { "exitosos": 0, "fallidos": 0, "detalles": [] }
}
```

## Pendiente (fuera de EQ-81)

- Criterio 6 de EQ-77: al menos un canal válido y consentimiento de WhatsApp. El modelo actual no tiene esos datos; lo aplicará el envío (EQ-83 / EQ-85).
- AMARILLO: EQ-77 lo marca como elegible, pero HU2-7 hoy no lo ofrece como opción. En cuanto HU2-7 lo devuelva, la vista previa lo acepta sin cambios.
- El modal de HU1 (EQ-88) inicia la inactividad en 1 día; EQ-77 pide 7.
