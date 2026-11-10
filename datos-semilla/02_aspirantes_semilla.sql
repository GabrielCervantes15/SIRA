-- ============================================================================
-- SIRA - CRM ITSON: Datos Semilla de Prueba
-- Tarea: EQ-41 · HU3-2 (Sprint 1)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Aspirantes (Diversidad de Semáforos, Estados de Admisión y Campus)
-- ----------------------------------------------------------------------------
INSERT INTO aspirantes.aspirantes (
    id, folio_solicitud, nombre_completo, correo, telefono, campus, carrera_solicitada,
    preparatoria_procedencia, periodo, fecha_solicitud, estado_solicitud, semaforo,
    colaborador_id, fecha_ultima_actividad
) VALUES
-- asp-001: Caso inactivo crítico (Semáforo Rojo, En Revisión, Obregón Náinari)
(
    'asp-001', 'FOL-2026-00101', 'Carlos Mendoza Armenta', 'carlos.mendoza@gmail.com', '+526441234567',
    'Campus Obregón Náinari', 'Ingeniería en Software', 'CBTIS 37', '2027-1',
    '2026-10-15T09:00:00Z', 'EN_REVISION', 'ROJO', 'colab-001', '2026-10-25T14:30:00Z'
),
-- asp-002: Caso exitoso aceptado (Semáforo Verde, Aceptada, Obregón Náinari)
(
    'asp-002', 'FOL-2026-00102', 'María Fernanda López Vega', 'mafer.lopez@outlook.com', '+526442345678',
    'Campus Obregón Náinari', 'Licenciatura en Administración', 'COBACH Obregón 1', '2027-1',
    '2026-10-18T11:15:00Z', 'ACEPTADA', 'VERDE', 'colab-001', '2026-11-08T16:45:00Z'
),
-- asp-003: Caso con rechazo escolar por subsanar (Semáforo Amarillo, Rechazada, Obregón Centro)
(
    'asp-003', 'FOL-2026-00103', 'Jorge Luis Valenzuela Ruiz', 'jorge.valenzuela@hotmail.com', '+526443456789',
    'Campus Obregón Centro', 'Ingeniería Industrial', 'CECyTE Esperanza', '2027-1',
    '2026-10-20T10:00:00Z', 'RECHAZADA', 'AMARILLO', 'colab-002', '2026-11-06T11:20:00Z'
),
-- asp-004: Caso recién recibido en atención de bienvenida (Semáforo Verde, Recibida, Obregón Centro)
(
    'asp-004', 'FOL-2026-00104', 'Ana Sofía Castro Morales', 'ana.castro@gmail.com', '+526444567890',
    'Campus Obregón Centro', 'Licenciatura en Psicología', 'CBTIS 188', '2027-1',
    '2026-11-01T15:30:00Z', 'RECIBIDA', 'VERDE', 'colab-002', '2026-11-09T18:00:00Z'
),
-- asp-005: Caso Campus Navojoa inactivo (Semáforo Rojo, En Revisión, Navojoa)
(
    'asp-005', 'FOL-2026-00105', 'Luis Eduardo Soto Encinas', 'luis.soto@gmail.com', '+526421112233',
    'Campus Navojoa', 'Ingeniería en Software', 'CONALEP Navojoa', '2027-1',
    '2026-10-22T08:30:00Z', 'EN_REVISION', 'ROJO', 'colab-003', '2026-10-28T10:00:00Z'
),
-- asp-006: Caso Campus Guaymas activo (Semáforo Verde, Aceptada, Guaymas)
(
    'asp-006', 'FOL-2026-00106', 'Valeria Gómez Parra', 'valeria.gomez@yahoo.com', '+526229876543',
    'Campus Guaymas', 'Licenciatura en Administración', 'COBACH Guaymas', '2027-1',
    '2026-11-02T13:00:00Z', 'ACEPTADA', 'VERDE', NULL, '2026-11-07T09:15:00Z'
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Historial de Eventos del Expediente (HU 3: Mensajes, Constancias, Rechazos)
-- Orden descendente por fecha_evento garantizado por el índice idx_historial_aspirante_fecha
-- ----------------------------------------------------------------------------
INSERT INTO aspirantes.historial_eventos (
    id, aspirante_id, tipo_evento, titulo, detalle, motivo_rechazo, metadatos, autor_tipo, autor_id, fecha_evento
) VALUES
-- Historial asp-001 (Detenido tras primer contacto)
(
    'a1000000-0000-0000-0000-000000000001', 'asp-001', 'CAMBIO_ESTADO',
    'Solicitud en Revisión', 'Registro Escolar recibió la postulación y comenzó la validación preliminar.',
    NULL, '{"estadoNuevo": "EN_REVISION", "estadoAnterior": "RECIBIDA"}'::jsonb,
    'REGISTRO_ESCOLAR', NULL, '2026-10-16T10:00:00Z'
),
(
    'a1000000-0000-0000-0000-000000000002', 'asp-001', 'MENSAJE_ENVIADO',
    'Envío de Bienvenida Automatizado', 'Mensaje de WhatsApp informativo con pasos para subir constancia oficial con promedio.',
    NULL, '{"canal": "WHATSAPP", "plantilla": "bienvenida_admision_2027"}'::jsonb,
    'IA', NULL, '2026-10-16T10:05:00Z'
),
(
    'a1000000-0000-0000-0000-000000000003', 'asp-001', 'MENSAJE_ENVIADO',
    'Recordatorio de Documentación Pendiente', 'Se notificó al aspirante por WhatsApp que faltan 5 días para cierre de fase documental.',
    NULL, '{"canal": "WHATSAPP", "plantilla": "recordatorio_documentos_urgente"}'::jsonb,
    'SISTEMA', NULL, '2026-10-25T14:30:00Z'
),

-- Historial asp-002 (Proceso Completo y Exitoso)
(
    'a2000000-0000-0000-0000-000000000001', 'asp-002', 'MENSAJE_ENVIADO',
    'Mensaje de Bienvenida', 'Contacto inicial vía WhatsApp confirmando recepción de solicitud FOL-2026-00102.',
    NULL, '{"canal": "WHATSAPP"}'::jsonb,
    'IA', NULL, '2026-10-18T11:20:00Z'
),
(
    'a2000000-0000-0000-0000-000000000002', 'asp-002', 'CONSTANCIA_ENTREGADA',
    'Constancia de Bachillerato Registrada', 'La aspirante subió su constancia con promedio de 92.4 emitida por COBACH Obregón 1.',
    NULL, '{"promedio": 92.4, "formato": "PDF", "valido": true}'::jsonb,
    'REGISTRO_ESCOLAR', NULL, '2026-10-24T12:00:00Z'
),
(
    'a2000000-0000-0000-0000-000000000003', 'asp-002', 'CAMBIO_ESTADO',
    'Solicitud Aceptada', 'Validación aprobada por la Dirección de Registro Escolar ITSON.',
    NULL, '{"estadoNuevo": "ACEPTADA", "estadoAnterior": "EN_REVISION"}'::jsonb,
    'REGISTRO_ESCOLAR', NULL, '2026-11-05T18:30:00Z'
),
(
    'a2000000-0000-0000-0000-000000000004', 'asp-002', 'MENSAJE_ENVIADO',
    'Notificación de Aceptación', 'Envío de carta de bienvenida e instrucciones para descarga de ficha de inscripción.',
    NULL, '{"canal": "WHATSAPP", "plantilla": "carta_aceptacion_itson"}'::jsonb,
    'COLABORADOR', 'colab-001', '2026-11-08T16:45:00Z'
),

-- Historial asp-003 (Rechazo con motivo y asesoría de remediación)
(
    'a3000000-0000-0000-0000-000000000001', 'asp-003', 'CONSTANCIA_ENTREGADA',
    'Constancia de Estudios Adjuntada', 'Archivo digital subido al portal por el aspirante.',
    NULL, '{"archivo": "constancia_cecyte.jpg"}'::jsonb,
    'SISTEMA', NULL, '2026-10-28T09:00:00Z'
),
(
    'a3000000-0000-0000-0000-000000000002', 'asp-003', 'RECHAZO_SOLICITUD',
    'Documento Rechazado por Registro Escolar', 'El documento presentado no cuenta con sello legible ni promedio acumulado.',
    'Constancia de estudios ilegible o sin promedio acumulado validado',
    '{"area": "Registro Escolar", "codigoRechazo": "DOC_ILEGIBLE"}'::jsonb,
    'REGISTRO_ESCOLAR', NULL, '2026-11-04T08:45:00Z'
),
(
    'a3000000-0000-0000-0000-000000000003', 'asp-003', 'MENSAJE_ENVIADO',
    'Aviso de Rechazo y Corrección', 'WhatsApp automático informando el motivo y facilitando enlace para resubir la constancia sellada.',
    NULL, '{"canal": "WHATSAPP", "plantilla": "aviso_correccion_documental"}'::jsonb,
    'IA', NULL, '2026-11-04T08:48:00Z'
),
(
    'a3000000-0000-0000-0000-000000000004', 'asp-003', 'NOTA_SEGUIMIENTO',
    'Contacto Telefónico Realizado', 'El aspirante indica que el día de mañana acudirá a la dirección de CECyTE por el duplicado sellado.',
    NULL, '{"resultadoLlamada": "COMPROMISO_ENTREGA"}'::jsonb,
    'COLABORADOR', 'colab-002', '2026-11-06T11:20:00Z'
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Conversaciones de Chat WhatsApp (HU 3 y HU 4)
-- Mensajes ENTRANTES y SALIENTES con marcas de tiempo cronológicas
-- ----------------------------------------------------------------------------
INSERT INTO aspirantes.conversaciones_mensajes (
    id, aspirante_id, direccion, remitente_tipo, remitente_id, contenido,
    tipo_contenido, estado_entrega, whatsapp_message_id, fecha_envio
) VALUES
-- Chat asp-001 (Aspirante que no ha respondido al mensaje de bienvenida)
(
    'c1000000-0000-0000-0000-000000000001', 'asp-001', 'SALIENTE', 'BOT_IA', 'bot-itson',
    '¡Hola Carlos! Bienvenido al proceso de admisión ITSON 2027 para Ingeniería en Software. Para continuar, recuerda subir tu constancia de estudios en el portal de aspirantes. ¿Tienes alguna duda?',
    'TEXTO', 'LEIDO', 'wamid.HBgNNTI2NDQxMjM0NTY3FQIAERgSMzFFNz', '2026-10-16T10:05:00Z'
),
(
    'c1000000-0000-0000-0000-000000000002', 'asp-001', 'SALIENTE', 'SISTEMA', 'sistema-itson',
    'Hola Carlos, te recordamos que tienes documentos pendientes para tu solicitud. Si requieres apoyo de un asesor, responde a este mensaje.',
    'TEXTO', 'ENTREGADO', 'wamid.HBgNNTI2NDQxMjM0NTY3FQIAERgSMzFFOD', '2026-10-25T14:30:00Z'
),

-- Chat asp-002 (Conversación fluida y resolución de dudas con Bot y Colaborador)
(
    'c2000000-0000-0000-0000-000000000001', 'asp-002', 'SALIENTE', 'BOT_IA', 'bot-itson',
    '¡Hola María Fernanda! Recibimos tu solicitud para Licenciatura en Administración en Campus Obregón. Quedamos a tu disposición para cualquier duda en tu trámite.',
    'TEXTO', 'LEIDO', 'wamid.HBgNNTI2NDQyMzQ1Njc4FQIAERgSMTQwMQ', '2026-10-18T11:20:00Z'
),
(
    'c2000000-0000-0000-0000-000000000002', 'asp-002', 'ENTRANTE', 'ASPIRANTE', '+526442345678',
    'Hola, muchas gracias. Ya subí mi constancia en PDF, ¿cuánto tiempo tarda en revisarse?',
    'TEXTO', 'RECIBIDO', 'wamid.HBgNNTI2NDQyMzQ1Njc4FQIAERgSMTQwMg', '2026-10-24T12:05:00Z'
),
(
    'c2000000-0000-0000-0000-000000000003', 'asp-002', 'SALIENTE', 'BOT_IA', 'bot-itson',
    'El tiempo habitual de validación por Registro Escolar es de 3 a 5 días hábiles. En cuanto esté lista recibirás una notificación por aquí.',
    'TEXTO', 'LEIDO', 'wamid.HBgNNTI2NDQyMzQ1Njc4FQIAERgSMTQwMw', '2026-10-24T12:05:30Z'
),
(
    'c2000000-0000-0000-0000-000000000004', 'asp-002', 'SALIENTE', 'COLABORADOR', 'colab-001',
    '¡Felicidades María Fernanda! Tu solicitud ha sido formalmente ACEPTADA. Ya puedes descargar tu ficha de inscripción desde el portal. Cualquier duda me pongo a tus órdenes.',
    'TEXTO', 'LEIDO', 'wamid.HBgNNTI2NDQyMzQ1Njc4FQIAERgSMTQwNA', '2026-11-08T16:45:00Z'
),
(
    'c2000000-0000-0000-0000-000000000005', 'asp-002', 'ENTRANTE', 'ASPIRANTE', '+526442345678',
    '¡Excelente noticia, muchas gracias profesor Roberto!',
    'TEXTO', 'RECIBIDO', 'wamid.HBgNNTI2NDQyMzQ1Njc4FQIAERgSMTQwNQ', '2026-11-08T16:50:00Z'
),

-- Chat asp-003 (Subsanación de rechazo escolar por foto borrosa)
(
    'c3000000-0000-0000-0000-000000000001', 'asp-003', 'SALIENTE', 'BOT_IA', 'bot-itson',
    'Aviso ITSON: Jorge Luis, tu constancia de estudios fue rechazada debido a que la fotografía enviada no es legible o no cuenta con sello visible. Puedes subirla nuevamente en el portal de admisiones.',
    'TEXTO', 'LEIDO', 'wamid.HBgNNTI2NDQzNDU2Nzg5FQIAERgSMjEwMQ', '2026-11-04T08:48:00Z'
),
(
    'c3000000-0000-0000-0000-000000000002', 'asp-003', 'ENTRANTE', 'ASPIRANTE', '+526443456789',
    'Hola, disculpe, ¿puedo llevar la constancia en físico directamente al campus para que la revisen?',
    'TEXTO', 'RECIBIDO', 'wamid.HBgNNTI2NDQzNDU2Nzg5FQIAERgSMjEwMg', '2026-11-05T09:30:00Z'
),
(
    'c3000000-0000-0000-0000-000000000003', 'asp-003', 'SALIENTE', 'COLABORADOR', 'colab-002',
    'Hola Jorge Luis, te atiende Laura Morales de Admisiones Centro. Sí puedes presentarla en ventanilla de Registro Escolar en horario de 8:00 a 15:00 hrs, o bien escanearla en PDF con buena iluminación y subirla en línea.',
    'TEXTO', 'LEIDO', 'wamid.HBgNNTI2NDQzNDU2Nzg5FQIAERgSMjEwMw', '2026-11-05T09:40:00Z'
),
(
    'c3000000-0000-0000-0000-000000000004', 'asp-003', 'ENTRANTE', 'ASPIRANTE', '+526443456789',
    'Enterado licenciada, mañana mismo la tramito nuevamente sellada y la subo en PDF. Gracias.',
    'TEXTO', 'RECIBIDO', 'wamid.HBgNNTI2NDQzNDU2Nzg5FQIAERgSMjEwNA', '2026-11-05T09:42:00Z'
)
ON CONFLICT (id) DO NOTHING;
