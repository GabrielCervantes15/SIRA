-- =========================================================================
-- HU 8 · EQ-95: semilla del catálogo de mensajes aprobado en EQ-93.
-- GENERADO por scripts/generar-semilla-catalogo-mensajes.js desde
-- datos-semilla/catalogo-mensajes.json. No editar a mano.
-- Requiere docker/postgres/migrations/05_catalogo_mensajes.sql.
-- Se puede correr más de una vez: reemplaza el catálogo completo.
-- =========================================================================

BEGIN;

DELETE FROM mensajes.catalogo_mensaje WHERE id IN ('saludo_inicial', 'contacto_iniciado_colaborador', 'recordatorio_documentacion', 'reactivacion_hu1', 'faq_documentos', 'faq_examen', 'faq_validacion', 'aviso_fuera_horario');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('saludo_inicial', 'ENVIO', 'Saludo inicial automático', 1, NULL, NULL, 'AUTOMATICO', 'WHATSAPP', FALSE, NULL, NULL, '¡Hola, {{nombre}}! Bienvenido(a). Estamos aquí para ayudarte con tu proceso de ingreso a {{carrera}}. ¿En qué podemos apoyarte?');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('saludo_inicial', 'nombre', 1);
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('saludo_inicial', 'carrera', 2);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('saludo_inicial', 1, 'Disparador', 'Primer mensaje del aspirante');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('saludo_inicial', 2, 'Horario', 'Dentro del horario de atención');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('saludo_inicial', 1, 'Se activa cuando el aspirante inicia por primera vez una conversación por WhatsApp.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('saludo_inicial', 2, 'Si el primer contacto ocurre dentro del horario de atención, SIRA envía automáticamente este saludo.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('saludo_inicial', 3, 'Después del saludo, el colaborador puede continuar la atención manualmente.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('saludo_inicial', 4, 'Si el primer contacto ocurre fuera del horario, se envía el aviso fuera de horario en lugar del saludo; no se envían ambos mensajes.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('saludo_inicial', 5, 'El horario vigente se consulta desde la configuración de HU9; no se fija en el catálogo.');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('contacto_iniciado_colaborador', 'ENVIO', 'Contacto iniciado por el colaborador', 2, NULL, NULL, 'MANUAL', 'WHATSAPP', TRUE, 'Tarea aprobada por el PO (sin clave)', 'PENDIENTE', 'Hola, {{nombre}}. Soy parte del equipo de atención de ITSON. Me gustaría apoyarte con tu proceso de ingreso a {{carrera}}. ¿Tienes alguna duda o necesitas ayuda?');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('contacto_iniciado_colaborador', 'nombre', 1);
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('contacto_iniciado_colaborador', 'carrera', 2);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('contacto_iniciado_colaborador', 1, 'Semáforo', 'Rojo');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('contacto_iniciado_colaborador', 2, 'Semáforo', 'Naranja');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('contacto_iniciado_colaborador', 3, 'Envío', 'Manual (lo decide el colaborador)');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('contacto_iniciado_colaborador', 1, 'El colaborador puede iniciar el contacto cuando el aspirante tenga semáforo rojo o amarillo/naranja, conforme a las reglas de HU1.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('contacto_iniciado_colaborador', 2, 'SIRA presenta el mensaje como texto predefinido; el colaborador lo revisa y decide si lo envía. No se envía automáticamente.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('contacto_iniciado_colaborador', 3, 'Si la ventana de WhatsApp está abierta se envía como mensaje normal; si está cerrada se requiere una plantilla aprobada por Meta.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('contacto_iniciado_colaborador', 4, 'Si se requiere plantilla y no existe una aprobada, se bloquea el envío y se informa al colaborador.');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('recordatorio_documentacion', 'ENVIO', 'Recordatorio por falta de documentación', 3, NULL, NULL, 'AUTOMATICO_Y_MANUAL', 'WHATSAPP', TRUE, 'Tarea aprobada por el PO (sin clave)', 'PENDIENTE', 'Hola, {{nombre}}. Te recordamos que aún tienes pendiente entregar tu constancia de calificaciones para continuar con tu proceso de admisión a {{carrera}}. Si tienes alguna duda sobre este requisito, estamos para apoyarte.');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('recordatorio_documentacion', 'nombre', 1);
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('recordatorio_documentacion', 'carrera', 2);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('recordatorio_documentacion', 1, 'Estatus', 'RECIBIDA (sin constancia entregada)');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('recordatorio_documentacion', 2, 'Tiempo de espera', '24 horas en RECIBIDA');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('recordatorio_documentacion', 1, 'Automático: si el aspirante sigue en RECIBIDA 24 horas continuas después de entrar a ese estado, SIRA envía un único recordatorio.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('recordatorio_documentacion', 2, 'Si entrega la constancia antes de las 24 horas, se cancela el recordatorio pendiente.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('recordatorio_documentacion', 3, 'El recordatorio automático no se repite.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('recordatorio_documentacion', 4, 'Manual: el colaborador puede enviarlo en cualquier momento; si lo hace antes de las 24 horas, se cancela el automático pendiente.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('recordatorio_documentacion', 5, 'Después del automático, el colaborador todavía puede enviar otro recordatorio manual.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('recordatorio_documentacion', 6, 'Si la constancia ya fue entregada, no se envía el recordatorio pendiente.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('recordatorio_documentacion', 7, 'Este contador es independiente de la ventana de WhatsApp y el envío no modifica el contador de inactividad del aspirante.');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('reactivacion_hu1', 'ENVIO', 'Reactivación (lote de HU1)', 4, NULL, NULL, 'LOTE_HU1', 'WHATSAPP', TRUE, 'EQ-79', 'PENDIENTE', 'Hola, {{nombre}}. Tu proceso de ingreso a {{carrera}} todavía puede continuar. ¿Necesitas ayuda para completar tus siguientes pasos?

Responde a este mensaje y con gusto te orientaremos.');
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('reactivacion_hu1', 'nombre', 1);
INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES ('reactivacion_hu1', 'carrera', 2);
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('reactivacion_hu1', 1, 'Semáforo', 'Rojo');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('reactivacion_hu1', 2, 'Semáforo', 'Naranja');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('reactivacion_hu1', 3, 'Lote', 'Reactivación de HU1');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('reactivacion_hu1', 1, 'Se usa en los lotes de reactivación de HU1.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('reactivacion_hu1', 2, 'Aplica a aspirantes de la cartera del colaborador autenticado, con semáforo distinto de verde y teléfono válido.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('reactivacion_hu1', 3, 'El aspirante debe estar fuera del tiempo de espera por contacto previo de HU9 y cumplir la inactividad mínima de EQ-77.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('reactivacion_hu1', 4, 'Los umbrales y la aplicabilidad definitiva pertenecen a EQ-77 y EQ-102; HU8 no los fija.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('reactivacion_hu1', 5, 'Con la ventana de WhatsApp cerrada solo se puede usar si Meta aprobó la plantilla (EQ-79).');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('faq_documentos', 'RESPUESTA', 'FAQ: documentos necesarios', 1, 'faq_admision', '¿Qué documentos necesito?', 'RESPUESTA', 'WHATSAPP', FALSE, NULL, NULL, 'Necesitas entregar tu constancia de calificaciones y tu certificado de preparatoria.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('faq_documentos', 1, 'FAQ', '¿Qué documentos necesito?');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('faq_documentos', 1, 'Se consulta como mensaje de respuesta predefinido.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('faq_documentos', 2, 'Si una pregunta no está cubierta por el catálogo no se inventa una respuesta; su atención se define en IA/Conocimiento.');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('faq_examen', 'RESPUESTA', 'FAQ: examen de admisión', 2, 'faq_admision', '¿Tengo que presentar examen de admisión?', 'RESPUESTA', 'WHATSAPP', FALSE, NULL, NULL, 'Actualmente no se realiza examen de admisión. El ingreso se determina con base en el promedio de preparatoria y los requisitos correspondientes.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('faq_examen', 1, 'FAQ', '¿Tengo que presentar examen de admisión?');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('faq_examen', 1, 'Se consulta como mensaje de respuesta predefinido.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('faq_examen', 2, 'Si una pregunta no está cubierta por el catálogo no se inventa una respuesta; su atención se define en IA/Conocimiento.');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('faq_validacion', 'RESPUESTA', 'FAQ: tiempo de validación', 3, 'faq_admision', '¿Cuánto tarda la validación?', 'RESPUESTA', 'WHATSAPP', FALSE, NULL, NULL, 'La validación tarda aproximadamente de 3 a 5 días hábiles por parte de Registro Escolar. Se te notificará cuando esté lista.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('faq_validacion', 1, 'FAQ', '¿Cuánto tarda la validación?');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('faq_validacion', 1, 'Se consulta como mensaje de respuesta predefinido.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('faq_validacion', 2, 'Si una pregunta no está cubierta por el catálogo no se inventa una respuesta; su atención se define en IA/Conocimiento.');

INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)
VALUES ('aviso_fuera_horario', 'RESPUESTA', 'Aviso fuera del horario de atención', 4, NULL, NULL, 'AUTOMATICO', 'WHATSAPP', FALSE, NULL, NULL, 'Gracias por comunicarte con ITSON. En este momento estamos fuera de nuestro horario de atención. Hemos recibido tu mensaje y te brindaremos orientación.');
INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES ('aviso_fuera_horario', 1, 'Horario', 'Fuera del horario de atención');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('aviso_fuera_horario', 1, 'SIRA consulta el horario vigente en la configuración de HU9.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('aviso_fuera_horario', 2, 'Si el aspirante inicia una conversación fuera del horario, se envía este aviso en lugar del saludo inicial.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('aviso_fuera_horario', 3, 'Se envía una sola vez por conversación, aunque el aspirante mande varios mensajes fuera de horario.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('aviso_fuera_horario', 4, 'La atención posterior con IA queda para una etapa futura.');
INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES ('aviso_fuera_horario', 5, 'El horario no se escribe en el texto ni se duplica en el catálogo.');

COMMIT;
