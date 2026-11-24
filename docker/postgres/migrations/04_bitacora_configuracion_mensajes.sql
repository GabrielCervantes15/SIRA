-- ============================================================================
-- SIRA - CRM ITSON: DDL de Bitácora de Cambios de Configuración de Mensajes
-- Tarea: EQ-108 · HU9-7 (Sprint 2)
-- Módulo: Mensajes (esquema `mensajes`)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS mensajes;

-- ----------------------------------------------------------------------------
-- 1. Tabla: mensajes.configuracion_bitacora
-- Registra de forma inmutable cada modificación administrativa de los parámetros
-- de envío de mensajes automáticos: quién, cuándo, valor anterior y valor nuevo.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mensajes.configuracion_bitacora (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id VARCHAR(50) NOT NULL,
    fecha_cambio TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valor_anterior JSONB NOT NULL,
    valor_nuevo JSONB NOT NULL
);

COMMENT ON TABLE mensajes.configuracion_bitacora IS 'Bitácora de auditoría de cambios en la configuración de mensajes automáticos (EQ-108 · HU9-7).';
COMMENT ON COLUMN mensajes.configuracion_bitacora.usuario_id IS 'ID institucional del administrador que realizó la modificación.';
COMMENT ON COLUMN mensajes.configuracion_bitacora.fecha_cambio IS 'Fecha y hora exacta (TIMESTAMPTZ) en que se aplicó el cambio.';
COMMENT ON COLUMN mensajes.configuracion_bitacora.valor_anterior IS 'Instantánea JSONB completa de la configuración antes del cambio.';
COMMENT ON COLUMN mensajes.configuracion_bitacora.valor_nuevo IS 'Instantánea JSONB completa de la configuración después del cambio.';

-- ----------------------------------------------------------------------------
-- 2. Índices de consulta de auditoría
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_configuracion_bitacora_fecha
    ON mensajes.configuracion_bitacora (fecha_cambio DESC);

CREATE INDEX IF NOT EXISTS idx_configuracion_bitacora_usuario
    ON mensajes.configuracion_bitacora (usuario_id);
