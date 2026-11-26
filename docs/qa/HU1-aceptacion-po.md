# HU 1 · Pruebas y aceptación con el PO (EQ-90, EQ-91, EQ-92)

**Historia:** HU 1, envío de mensajes automáticos a aspirantes inactivos.
**Reglas:** `docs/decisiones/HU1-reglas-lote-envio.md` (EQ-77, aprobadas por el PO el 19/11/2026).
**Cómo correr las pruebas:** `node --test` (en Git Bash en Windows: `node.exe --test`).

Tipos de prueba: **U** unitaria · **I** integración · **E2E** de extremo a extremo · **M** manual.

---

## 1. Trazabilidad

| Criterio (EQ-77) | Caso de prueba | Tipo | Archivo |
|---|---|---|---|
| Solo la cartera del colaborador; nunca verde | Combinaciones semáforo × carrera × inactividad contra un oráculo de las reglas; verde no se ofrece ni se cuenta | U | `eq90-unitarias-hu1.test.js` |
| Excluir ACEPTADAS y RECHAZADAS | Ninguna combinación las incluye | U | `eq90` |
| Inactividad inicial de 7 días, editable; meses documentados | Días, semanas y meses (31 de marzo, 29 de febrero, fin de año); el límite es inclusivo | U | `eq90`, `eq81` |
| 48 h de contacto previo (HU9) | Saliente correcto por conversación o por fecha de última notificación; 47:59 excluye y 48:00 no; los fallidos no cuentan; 72 h configuradas | U | `eq90`, `eq87` |
| Fuera de horario: consultar sí, enviar no, sin programar | Lunes a viernes 08:00 a 18:00 en Hermosillo; sábado: vista previa 200 y envío 409, sin eventos | U, I, E2E | `eq90`, `eq91`, `eq92` |
| El horario viene de HU9 | El administrador apaga el lunes en el panel ⚙: se bloquea al instante; lo enciende: se permite | I | `eq91` |
| Revalidación en servidor | Se recalcula al enviar; cero aplicables: 400 | U, E2E | `eq83`, `eq92` |
| Idempotencia ante doble clic o reintento | Misma clave: un lote; peticiones simultáneas: un lote y ningún evento repetido | U, I | `eq90`, `eq83` |
| Mensaje desde el catálogo de HU8 | Nombre y carrera en el orden de la plantilla; si falta un dato, no se envía y se registra | U | `eq90`, `eq84` |
| WhatsApp con teléfono válido; correo opcional | Un envío por aspirante y canal; el correo solo con la casilla marcada | U, E2E | `eq90`, `eq92` |
| Canales independientes y fallos parciales | WhatsApp rechazado pero correo enviado: notificado; correo inválido: WhatsApp sí sale | I | `eq91` |
| Reintentos de errores temporales | WhatsApp cae 2 veces y sale al tercer intento; el SMTP cae 2 veces y se recupera | I | `eq91`, `eq85` |
| Límite de 24 h de Meta | Lo que no cabe se difiere y sale al liberarse cupo; a las 72 h, CADUCADO | U | `eq85` |
| El saliente no cambia la última actividad | La «Última actividad» y el semáforo no cambian; sí la fecha de última notificación | I | `eq87`, `eq91` |
| Historial y conteo | `MENSAJE_AUTOMATICO` por canal; conteo por aspirante una vez por lote | I | `eq87`, `eq91` |
| Aislamiento entre colaboradores | B no puede usar carreras de A ni ver su lote; la misma clave en B es otro lote | I | `eq91` |
| Seguridad: rol | Sin sesión: 401. El administrador no envía (403) ni ve lotes ajenos (404). El colaborador no cambia HU9 | E2E | `eq92` |
| Seguridad: entradas | JSON inválido, cuerpo grande, tipos equivocados, inyección SQL o HTML, verde, valores fuera de rango y clave inválida: 400 sin enviar nada | E2E | `eq92` |
| Componentes de filtros y botón | Filtros que se mandan, ningún grupo vacío, botón Enviar y textos del modal | U | `eq90` (`frontend/js/disparo-logica.js`) |
| Prueba controlada con Cloud API | Script en simulacro, un solo envío con `--enviar`, errores claros | U, M | `eq92`, §3 |

## 2. Demostración para el PO (unos 15 minutos)

Preparación: `npm start` y abrir http://localhost:3000. Por ser demo fuera de horario, el administrador (00000100001 / AdminPassword2026!) abre el horario en **Mensajes → ⚙** (00:00 a 23:59 → Guardar).

| # | Qué hacer | Qué debe ver el PO | Aprobado |
|---|---|---|---|
| 1 | Como Sebastián (00000252115 / Password123!), en Aspirantes, **Enviar mensajes automáticos** | Rojo y Naranja marcados; sin verde; sus carreras; el conteo y ejemplos con nombre y carrera | ☐ |
| 2 | Cambiar semáforo, carrera e inactividad (1 día, 2 semanas, 1 mes) | El conteo cambia; no deja desmarcar todas las casillas de un grupo | ☐ |
| 3 | Poner 12 meses | «No hay aspirantes…» y el botón Enviar apagado | ☐ |
| 4 | Volver a 1 día, marcar **Enviar por correo** y **Enviar** (doble clic) | Una sola confirmación y un solo lote | ☐ |
| 5 | Abrir a **Carlos Mendoza Armenta** | La «Última actividad» no cambió; en Actividades aparece «MENSAJE AUTOMÁTICO» por WhatsApp y por correo; en el Chat, el mensaje | ☐ |
| 6 | Volver a abrir el modal | Ya no hay aspirantes (espera de 48 h) | ☐ |
| 7 | Administrador: apagar el día de hoy en el panel ⚙; Sebastián: abrir el modal | Aviso de fuera de horario y Enviar apagado; se puede consultar | ☐ |
| 8 | Revisar con el PO la decisión de pendientes al rebasar el límite de Meta | `docs/decisiones/HU1-envio-whatsapp.md` §4 aprobada o con cambios | ☐ |

## 3. Prueba controlada con el número de pruebas de Cloud API

La hace quien tenga la cuenta de Meta (EQ-115). Manda **un solo** mensaje al número de pruebas.

1. En `.env` pon el token y el número de la cuenta:
   ```
   WHATSAPP_ACCESS_TOKEN=<token de Meta>
   WHATSAPP_PHONE_NUMBER_ID=<id del número>
   ```
2. **Simulacro** (no envía nada; muestra la petición con el token oculto):
   ```
   node --env-file=.env scripts/prueba-cloud-api.js --numero +52XXXXXXXXXX
   ```
3. **Envío real** a un número de prueba registrado en Meta:
   ```
   node --env-file=.env scripts/prueba-cloud-api.js --numero +52XXXXXXXXXX --enviar
   ```
   Si `reactivacion_hu1` aún no está aprobada (EQ-79), usa la plantilla de ejemplo de Meta:
   ```
   node --env-file=.env scripts/prueba-cloud-api.js --numero +52XXXXXXXXXX --plantilla hello_world --idioma en_US --parametros "" --enviar
   ```
4. Debe responder «Meta aceptó el mensaje: wamid.…» y el mensaje debe llegar al teléfono.
5. Para el lote completo por Cloud API: `WHATSAPP_MOCK_ENABLED=false` en `.env` y un lote pequeño (por ejemplo, 1 día con una sola carrera).

| Resultado | Fecha | Responsable |
|---|---|---|
| ☐ Simulacro correcto · ☐ Mensaje recibido en el número de pruebas · ☐ Lote pequeño por Cloud API | | |

## 4. Observaciones encontradas al probar

- **Cuerpo demasiado grande:** con más de 16 KB, `leerCuerpo` (en `servidor.js`, código previo a HU1) corta la conexión en lugar de responder 413. Es seguro, porque no se procesa nada, pero el cliente no recibe un mensaje claro.
- **Tipos del envío:** el envío aceptaba `semaforos` como texto (`"ROJO"`) en lugar de lista. Ya se corrigió en EQ-92: ahora responde 400 con el campo indicado.
- **Correo:** desde EQ-83, los correos del lote no tenían quién los enviara. Ya se corrigió: los envía una cola con el SMTP simulado de EQ-61, igual que la de WhatsApp. El SMTP real depende de BASE-9.
- **Modal:** el resumen después de enviar no se ve, porque `#disparo-resultado` está dentro de `#disparo-cuerpo` (ver PR #9).

## 5. Acta de aceptación

| Campo | Valor |
|---|---|
| Fecha | |
| Product Owner | |
| Equipo presente | |
| Resultado | ☐ Aceptada · ☐ Aceptada con cambios · ☐ No aceptada |
| Cambios solicitados | |
| Firma del PO | |
