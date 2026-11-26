-- =============================================================================
-- Migración 09 · Resultados del envío de HU1 (EQ-87 · HU1-11)
-- Esquemas: aspirantes (Monitoreo) y disparo
--
-- 1. Fecha de última notificación y conteo de notificaciones del aspirante.
--    EQ-77 §6.3 y §11: un envío exitoso NO toca fecha_ultima_actividad (inactividad
--    académica ni semáforo); actualiza el último contacto saliente exitoso.
-- 2. Tipo de evento MENSAJE_AUTOMATICO en la línea de tiempo (HU3-1).
-- 3. Resultado de cada envío del lote, para el conteo de notificados por lote.
-- Se puede ejecutar más de una vez.
-- =============================================================================

-- 1. Aspirante -----------------------------------------------------------------
ALTER TABLE aspirantes.aspirantes
  ADD COLUMN IF NOT EXISTS fecha_ultima_notificacion TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS veces_notificado INTEGER NOT NULL DEFAULT 0;

ALTER TABLE aspirantes.aspirantes DROP CONSTRAINT IF EXISTS ck_aspirantes_veces_notificado;
ALTER TABLE aspirantes.aspirantes
  ADD CONSTRAINT ck_aspirantes_veces_notificado CHECK (veces_notificado >= 0);

COMMENT ON COLUMN aspirantes.aspirantes.fecha_ultima_notificacion IS
  'Último mensaje saliente enviado correctamente (EQ-87). Inicia la espera de 48 h de HU9; no cambia la última actividad.';
COMMENT ON COLUMN aspirantes.aspirantes.veces_notificado IS
  'Lotes de HU1 en los que el aspirante recibió al menos un mensaje (una vez por lote, sin importar el canal).';

-- 2. Historial: tipo de evento nuevo ---------------------------------------------
-- La restricción original de la migración 01 no tiene nombre propio; PostgreSQL la
-- llama historial_eventos_tipo_evento_check. Se reemplaza por una con nombre.
ALTER TABLE aspirantes.historial_eventos DROP CONSTRAINT IF EXISTS historial_eventos_tipo_evento_check;
ALTER TABLE aspirantes.historial_eventos DROP CONSTRAINT IF EXISTS ck_historial_tipo_evento;
ALTER TABLE aspirantes.historial_eventos
  ADD CONSTRAINT ck_historial_tipo_evento CHECK (tipo_evento IN (
    'MENSAJE_ENVIADO', 'CONSTANCIA_ENTREGADA', 'CAMBIO_ESTADO', 'RECHAZO_SOLICITUD', 'NOTA_SEGUIMIENTO',
    'MENSAJE_AUTOMATICO'
  ));

-- 3. Resultado de cada envío --------------------------------------------------------
ALTER TABLE disparo.envio
  ADD COLUMN IF NOT EXISTS resultado VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS resultado_codigo VARCHAR(60) NULL,
  ADD COLUMN IF NOT EXISTS resultado_motivo TEXT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS intentos INTEGER NULL,
  ADD COLUMN IF NOT EXISTS resultado_en TIMESTAMPTZ NULL;

ALTER TABLE disparo.envio DROP CONSTRAINT IF EXISTS ck_envio_resultado;
ALTER TABLE disparo.envio
  ADD CONSTRAINT ck_envio_resultado CHECK (
    resultado IS NULL
    OR (estado = 'PENDIENTE' AND resultado IN ('ENVIADO', 'FALLIDO', 'DIFERIDO') AND resultado_en IS NOT NULL)
  );

COMMENT ON COLUMN disparo.envio.resultado IS
  'Resultado publicado por el envío (EQ-85): ENVIADO y FALLIDO son finales; DIFERIDO puede cambiar.';
