-- =========================================================================
-- HU 8 · EQ-95: semilla del catálogo de mensajes (EQ-98/99).
-- GENERADO por scripts/generar-semilla-catalogo-mensajes.js desde
-- datos-semilla/mensajes-ia.json. No editar a mano.
-- Requiere docker/postgres/migrations/05_catalogo_mensajes.sql.
-- Se puede correr más de una vez: reemplaza el catálogo completo.
-- =========================================================================

BEGIN;

DELETE FROM mensajes.catalogo_mensaje WHERE id IN ('env-001', 'env-002', 'env-003', 'env-004', 'env-005', 'env-006', 'env-007', 'env-008', 'env-009', 'env-010', 'reactivacion_hu1', 'res-001', 'res-002', 'res-003', 'res-004', 'res-005', 'res-006', 'res-007', 'res-008', 'res-009', 'res-010');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('env-001', 'ENVIO', 'Rojo · Sin documentos entregados', 1, NULL, NULL, 'AUTOMATICO', 'WHATSAPP', FALSE, NULL, NULL, '¡Saludos {aspirante}! Estamos muy contentos de que desees formar parte de esta universidad. Te recordamos que debes entregar tu kardex oficial de calificaciones y tu certificado de preparatoria para completar tu proceso de admisión.');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('env-001', 'aspirante', 1);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-001', 1, 'Semáforo', 'Rojo');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-001', 2, 'Estatus', 'Sin documentos entregados');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-001', 1, 'Aplica cuando semáforo es «Rojo».');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-001', 2, 'Aplica cuando estatus es «Sin documentos entregados».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('env-002', 'ENVIO', 'Naranja · Falta de entregar el certificado', 2, NULL, NULL, 'AUTOMATICO', 'WHATSAPP', FALSE, NULL, NULL, 'Hola {aspirante}. Hace tiempo que no te hemos contactado, así que queremos avisarte que estás a solo un paso de terminar tu admisión con ITSON: tan solo falta entregar tu certificado de preparatoria.');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('env-002', 'aspirante', 1);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-002', 1, 'Semáforo', 'Naranja');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-002', 2, 'Estatus', 'Falta de entregar el certificado');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-002', 1, 'Aplica cuando semáforo es «Naranja».');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-002', 2, 'Aplica cuando estatus es «Falta de entregar el certificado».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('env-003', 'ENVIO', 'Naranja · Constancia rechazada', 3, NULL, NULL, 'AUTOMATICO', 'WHATSAPP', FALSE, NULL, NULL, 'Hola {aspirante}. Hace tiempo que no te hemos contactado y queremos informarte que tu constancia fue rechazada por Registro Escolar. Si tienes dudas, recuerda que puedes solicitar comunicarte con una persona.');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('env-003', 'aspirante', 1);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-003', 1, 'Semáforo', 'Naranja');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-003', 2, 'Estatus', 'Constancia rechazada');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-003', 1, 'Aplica cuando semáforo es «Naranja».');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-003', 2, 'Aplica cuando estatus es «Constancia rechazada».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('env-004', 'ENVIO', 'Naranja · {valor} {magnitud}', 4, NULL, NULL, 'AUTOMATICO', 'WHATSAPP', FALSE, NULL, NULL, '¡Hola {aspirante}! Han pasado {valor} {magnitud} desde la última vez que te contactaste con nosotros. Te recordamos que tu proceso de admisión no ha concluido.');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('env-004', 'aspirante', 1);
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('env-004', 'valor', 2);
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('env-004', 'magnitud', 3);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-004', 1, 'Semáforo', 'Naranja');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-004', 2, 'Tiempo de inactividad', '{valor} {magnitud}');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-004', 1, 'Aplica cuando semáforo es «Naranja».');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-004', 2, 'Aplica cuando tiempo de inactividad es «{valor} {magnitud}».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('env-005', 'ENVIO', 'Rojo · Falta de entregar el certificado', 5, NULL, NULL, 'AUTOMATICO', 'WHATSAPP', FALSE, NULL, NULL, 'Hola {aspirante}. Somos muy afortunados de que desees formar parte de ITSON. Este aviso es para recordarte que estás a tan solo un paso de terminar tu proceso de admisión: debes entregar tu certificado de preparatoria.');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('env-005', 'aspirante', 1);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-005', 1, 'Semáforo', 'Rojo');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-005', 2, 'Estatus', 'Falta de entregar el certificado');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-005', 1, 'Aplica cuando semáforo es «Rojo».');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-005', 2, 'Aplica cuando estatus es «Falta de entregar el certificado».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('env-006', 'ENVIO', 'Falta de entregar el certificado · 1 semana', 6, NULL, NULL, 'AUTOMATICO', 'WHATSAPP', FALSE, NULL, NULL, 'Hola {aspirante}. Te avisamos que ya solo falta una semana y te falta entregar tu certificado de preparatoria para concluir el periodo de admisiones. Entrega tu documento lo antes posible.');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('env-006', 'aspirante', 1);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-006', 1, 'Estatus', 'Falta de entregar el certificado');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-006', 2, 'Proximidad con término de periodo de admisiones', '1 semana');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-006', 1, 'Aplica cuando estatus es «Falta de entregar el certificado».');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-006', 2, 'Aplica cuando proximidad con término de periodo de admisiones es «1 semana».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('env-007', 'ENVIO', 'Rojo · Solicitud rechazada', 7, NULL, NULL, 'AUTOMATICO', 'WHATSAPP', FALSE, NULL, NULL, 'Hola {aspirante}. Lamentamos informarte que tu solicitud fue rechazada por Registro Escolar. Si crees que esto es un error, puedes solicitar comunicarte con una persona.');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('env-007', 'aspirante', 1);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-007', 1, 'Semáforo', 'Rojo');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-007', 2, 'Estatus', 'Solicitud rechazada');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-007', 1, 'Aplica cuando semáforo es «Rojo».');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-007', 2, 'Aplica cuando estatus es «Solicitud rechazada».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('env-008', 'ENVIO', 'Solicitud aceptada', 8, NULL, NULL, 'AUTOMATICO', 'WHATSAPP', FALSE, NULL, NULL, '¡Felicidades {aspirante}! Tu solicitud fue aceptada. Ya puedes descargar tu ficha de inscripción desde el portal de aspirantes.');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('env-008', 'aspirante', 1);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-008', 1, 'Estatus', 'Solicitud aceptada');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-008', 1, 'Aplica cuando estatus es «Solicitud aceptada».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('env-009', 'ENVIO', 'Verde · 2 semanas', 9, NULL, NULL, 'AUTOMATICO', 'WHATSAPP', FALSE, NULL, NULL, 'Hola {aspirante}. Tu proceso va muy bien. Quedan 2 semanas para el cierre del periodo; revisa que todos tus datos estén completos en el portal.');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('env-009', 'aspirante', 1);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-009', 1, 'Semáforo', 'Verde');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-009', 2, 'Proximidad con término de periodo de admisiones', '2 semanas');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-009', 1, 'Aplica cuando semáforo es «Verde».');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-009', 2, 'Aplica cuando proximidad con término de periodo de admisiones es «2 semanas».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('env-010', 'ENVIO', 'Sin contacto previo', 10, NULL, NULL, 'AUTOMATICO', 'WHATSAPP', FALSE, NULL, NULL, '¡Hola {aspirante}! Somos ITSON. Queremos darte la bienvenida a tu proceso de admisión y resolver cualquier duda que tengas desde el inicio.');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('env-010', 'aspirante', 1);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('env-010', 1, 'Estatus', 'Sin contacto previo');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('env-010', 1, 'Aplica cuando estatus es «Sin contacto previo».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('reactivacion_hu1', 'ENVIO', 'Reactivación de HU1', 11, NULL, NULL, 'LOTE_HU1', 'WHATSAPP', TRUE, 'reactivacion_hu1', 'PENDIENTE', E'Hola, {aspirante}. Tu proceso de ingreso a {carrera} todavía puede continuar. ¿Necesitas ayuda para completar tus siguientes pasos?\n\nResponde a este mensaje y con gusto te orientaremos.');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('reactivacion_hu1', 'aspirante', 1);
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('reactivacion_hu1', 'carrera', 2);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('reactivacion_hu1', 1, 'Lote', 'Reactivación HU1');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('reactivacion_hu1', 1, 'Texto aprobado por el PO el 18/11/2026 (EQ-93, docs/decisiones/HU8-catalogo-mensajes.md §4.4); es el mismo de la plantilla de Meta (EQ-79).');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('reactivacion_hu1', 2, 'Lo envía el lote de reactivación de HU1 a los aspirantes que cumplen las reglas de EQ-77.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('reactivacion_hu1', 3, 'Si falta el nombre o la carrera del aspirante, no se envía y se registra el fallo (EQ-84).');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('res-001', 'RESPUESTA', '¿Dónde entrego mi certificado?', 1, NULL, '¿Dónde entrego mi certificado?', 'RESPUESTA', 'WHATSAPP', FALSE, NULL, NULL, 'El certificado de preparatoria debe entregarse en el módulo de Registro Escolar. En Ciudad Obregón, Registro Escolar se ubica en Campus Náinari, justo en frente de la explanada.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('res-001', 1, 'FAQ', '¿Dónde entrego mi certificado?');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('res-001', 1, 'Se usa para responder la pregunta «¿Dónde entrego mi certificado?».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('res-002', 'RESPUESTA', 'COBACH 1 · Constancia de Calificaciones', 2, NULL, NULL, 'RESPUESTA', 'WHATSAPP', FALSE, NULL, NULL, 'Para obtener la constancia de calificaciones del COBACH 1 de Ciudad Obregón, debes solicitarla en ventanilla, ubicada en el edificio que se encuentra en frente de la explanada.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('res-002', 1, 'Preparatoria', 'COBACH 1');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('res-002', 2, 'Documento', 'Constancia de Calificaciones');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('res-002', 1, 'Aplica cuando preparatoria es «COBACH 1».');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('res-002', 2, 'Aplica cuando documento es «Constancia de Calificaciones».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('res-003', 'RESPUESTA', '¿Dónde puedo consultar los requisitos para ser aceptado por la carrera que seleccioné?', 3, NULL, '¿Dónde puedo consultar los requisitos para ser aceptado por la carrera que seleccioné?', 'RESPUESTA', 'WHATSAPP', FALSE, NULL, NULL, 'Para saber la puntuación requerida para ser aceptado por la carrera que seleccionaste, debes ingresar a la página oficial de la institución y entrar a la sección de Oferta Educativa.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('res-003', 1, 'FAQ', '¿Dónde puedo consultar los requisitos para ser aceptado por la carrera que seleccioné?');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('res-003', 1, 'Se usa para responder la pregunta «¿Dónde puedo consultar los requisitos para ser aceptado por la carrera que seleccioné?».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('res-004', 'RESPUESTA', '¿Cuál es la fecha límite para entregar todos mis documentos?', 4, NULL, '¿Cuál es la fecha límite para entregar todos mis documentos?', 'RESPUESTA', 'WHATSAPP', FALSE, NULL, NULL, 'Para el periodo Agosto-Diciembre 2027, tienes como límite el 31 de julio para entregar todos tus documentos. Ten en cuenta que Registro Escolar debe revisar la validez de tus documentos.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('res-004', 1, 'FAQ', '¿Cuál es la fecha límite para entregar todos mis documentos?');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('res-004', 1, 'Se usa para responder la pregunta «¿Cuál es la fecha límite para entregar todos mis documentos?».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('res-005', 'RESPUESTA', 'CBTIS 137 · Certificado', 5, NULL, NULL, 'RESPUESTA', 'WHATSAPP', FALSE, NULL, NULL, 'Para obtener tu certificado del CBTIS 137, debes ingresar a la página oficial de certificados con tu usuario y contraseña institucionales y descargar el documento en formato PDF.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('res-005', 1, 'Preparatoria', 'CBTIS 137');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('res-005', 2, 'Documento', 'Certificado');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('res-005', 1, 'Aplica cuando preparatoria es «CBTIS 137».');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('res-005', 2, 'Aplica cuando documento es «Certificado».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('res-006', 'RESPUESTA', '¿Qué pasa si entrego mis documentos fuera de la fecha límite?', 6, NULL, '¿Qué pasa si entrego mis documentos fuera de la fecha límite?', 'RESPUESTA', 'WHATSAPP', FALSE, NULL, NULL, 'Si entregas tus documentos fuera de la fecha límite, tu solicitud podría no ser considerada para el periodo de admisión en curso. Te recomendamos contactar a Registro Escolar lo antes posible.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('res-006', 1, 'FAQ', '¿Qué pasa si entrego mis documentos fuera de la fecha límite?');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('res-006', 1, 'Se usa para responder la pregunta «¿Qué pasa si entrego mis documentos fuera de la fecha límite?».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('res-007', 'RESPUESTA', '¿Puedo cambiar de carrera después de haber solicitado mi admisión?', 7, NULL, '¿Puedo cambiar de carrera después de haber solicitado mi admisión?', 'RESPUESTA', 'WHATSAPP', FALSE, NULL, NULL, 'Sí, puedes solicitar un cambio de carrera mientras el periodo de admisión siga abierto. Debes comunicarte con un colaborador para realizar el trámite correspondiente.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('res-007', 1, 'FAQ', '¿Puedo cambiar de carrera después de haber solicitado mi admisión?');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('res-007', 1, 'Se usa para responder la pregunta «¿Puedo cambiar de carrera después de haber solicitado mi admisión?».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('res-008', 'RESPUESTA', 'CECyTE Esperanza · Constancia de Calificaciones', 8, NULL, NULL, 'RESPUESTA', 'WHATSAPP', FALSE, NULL, NULL, 'Para obtener la constancia de calificaciones de CECyTE Esperanza, debes solicitarla directamente en el plantel con el área de servicios escolares.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('res-008', 1, 'Preparatoria', 'CECyTE Esperanza');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('res-008', 2, 'Documento', 'Constancia de Calificaciones');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('res-008', 1, 'Aplica cuando preparatoria es «CECyTE Esperanza».');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('res-008', 2, 'Aplica cuando documento es «Constancia de Calificaciones».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('res-009', 'RESPUESTA', '¿Cómo sé si mi solicitud fue aceptada?', 9, NULL, '¿Cómo sé si mi solicitud fue aceptada?', 'RESPUESTA', 'WHATSAPP', FALSE, NULL, NULL, 'Recibirás una notificación por este medio y por correo electrónico en cuanto Registro Escolar concluya la validación de tu solicitud.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('res-009', 1, 'FAQ', '¿Cómo sé si mi solicitud fue aceptada?');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('res-009', 1, 'Se usa para responder la pregunta «¿Cómo sé si mi solicitud fue aceptada?».');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('res-010', 'RESPUESTA', '¿Puedo hablar con una persona en lugar del asistente automático?', 10, NULL, '¿Puedo hablar con una persona en lugar del asistente automático?', 'RESPUESTA', 'WHATSAPP', FALSE, NULL, NULL, 'Claro, puedes solicitar hablar con una persona en cualquier momento dentro del horario de atención y un colaborador continuará la conversación contigo.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('res-010', 1, 'FAQ', '¿Puedo hablar con una persona en lugar del asistente automático?');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('res-010', 1, 'Se usa para responder la pregunta «¿Puedo hablar con una persona en lugar del asistente automático?».');

COMMIT;
