-- ============================================================================
-- SIRA - CRM ITSON: DDL del Esquema Aspirantes
-- Tarea: EQ-41 · HU3-2 (Sprint 1)
-- Responsable: Sebastián Bórquez Huerta
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS aspirantes;

-- ----------------------------------------------------------------------------
-- 1. Tabla: aspirantes.aspirantes
-- Datos generales del expediente del aspirante para HU 2 y HU 3.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aspirantes.aspirantes (
    id VARCHAR(50) PRIMARY KEY,
    folio_solicitud VARCHAR(50) UNIQUE NOT NULL,
    nombre_completo VARCHAR(200) NOT NULL,
    correo VARCHAR(150) NOT NULL,
    telefono VARCHAR(30) NOT NULL,
    campus VARCHAR(50) NOT NULL,
    carrera_solicitada VARCHAR(120) NOT NULL,
    preparatoria_procedencia VARCHAR(150) NOT NULL,
    periodo VARCHAR(20) NOT NULL,
    fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado_solicitud VARCHAR(30) NOT NULL DEFAULT 'RECIBIDA' 
        CHECK (estado_solicitud IN ('RECIBIDA', 'EN_REVISION', 'ACEPTADA', 'RECHAZADA')),
    semaforo VARCHAR(10) NOT NULL DEFAULT 'VERDE' 
        CHECK (semaforo IN ('VERDE', 'AMARILLO', 'ROJO')),
    colaborador_id VARCHAR(50) NULL,
    fecha_ultima_actividad TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE aspirantes.aspirantes IS 'Entidad principal de aspirantes registrados en el CRM para seguimiento y admisión.';
COMMENT ON COLUMN aspirantes.aspirantes.colaborador_id IS 'ID del colaborador asignado. Reasignable en HU 6 sin perder trazabilidad.';
COMMENT ON COLUMN aspirantes.aspirantes.semaforo IS 'Semáforo de inactividad operativa: VERDE (activo), AMARILLO (en riesgo), ROJO (estancado/inactivo).';
COMMENT ON COLUMN aspirantes.aspirantes.estado_solicitud IS 'Estado institucional de la solicitud reportado por Registro Escolar.';

-- ----------------------------------------------------------------------------
-- 2. Tabla: aspirantes.historial_eventos
-- Trazabilidad cronológica del expediente: mensajes enviados, constancias entregadas,
-- motivos de rechazo y cambios de estado (Requisito HU 3 y HU3-2).
-- Nota de arquitectura (HU6-4): Ligado directamente al aspirante para viajar al reasignar.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aspirantes.historial_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aspirante_id VARCHAR(50) NOT NULL REFERENCES aspirantes.aspirantes(id) ON DELETE CASCADE,
    tipo_evento VARCHAR(40) NOT NULL 
        CHECK (tipo_evento IN ('MENSAJE_ENVIADO', 'CONSTANCIA_ENTREGADA', 'CAMBIO_ESTADO', 'RECHAZO_SOLICITUD', 'NOTA_SEGUIMIENTO')),
    titulo VARCHAR(150) NOT NULL,
    detalle TEXT NULL,
    motivo_rechazo TEXT NULL,
    metadatos JSONB NULL DEFAULT '{}'::jsonb,
    autor_tipo VARCHAR(20) NOT NULL DEFAULT 'SISTEMA' 
        CHECK (autor_tipo IN ('SISTEMA', 'IA', 'COLABORADOR', 'REGISTRO_ESCOLAR')),
    autor_id VARCHAR(50) NULL,
    fecha_evento TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE aspirantes.historial_eventos IS 'Línea de tiempo y trazabilidad de eventos del aspirante (HU3-2).';
COMMENT ON COLUMN aspirantes.historial_eventos.motivo_rechazo IS 'Motivo específico de rechazo escolar cuando tipo_evento es RECHAZO_SOLICITUD.';

-- ----------------------------------------------------------------------------
-- 3. Tabla: aspirantes.conversaciones_mensajes
-- Registro de mensajes de chat enviados y recibidos vía WhatsApp / WebSockets (HU3-2 y HU 4).
-- Nota de arquitectura (HU6-4): Ligado al aspirante para persistir en reasignaciones.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aspirantes.conversaciones_mensajes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aspirante_id VARCHAR(50) NOT NULL REFERENCES aspirantes.aspirantes(id) ON DELETE CASCADE,
    direccion VARCHAR(10) NOT NULL 
        CHECK (direccion IN ('ENTRANTE', 'SALIENTE')),
    remitente_tipo VARCHAR(20) NOT NULL 
        CHECK (remitente_tipo IN ('ASPIRANTE', 'BOT_IA', 'COLABORADOR', 'SISTEMA')),
    remitente_id VARCHAR(50) NULL,
    contenido TEXT NOT NULL,
    tipo_contenido VARCHAR(20) NOT NULL DEFAULT 'TEXTO' 
        CHECK (tipo_contenido IN ('TEXTO', 'IMAGEN', 'DOCUMENTO', 'AUDIO')),
    estado_entrega VARCHAR(20) NOT NULL DEFAULT 'ENVIADO' 
        CHECK (estado_entrega IN ('PENDIENTE', 'ENVIADO', 'ENTREGADO', 'LEIDO', 'FALLIDO')),
    whatsapp_message_id VARCHAR(100) NULL,
    fecha_envio TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE aspirantes.conversaciones_mensajes IS 'Historial de mensajes de chat bidireccionales con el aspirante (HU3-2).';

-- ============================================================================
-- 4. ÍNDICES DE BASE DE DATOS OBLIGATORIOS ([HU3-2] y HU 2)
-- Optimización específica por aspirante y fecha para línea de tiempo y chat.
-- ============================================================================

-- Índice compuesto para consulta de Historial en orden descendente (más reciente primero, HU3-4)
CREATE INDEX IF NOT EXISTS idx_historial_aspirante_fecha 
    ON aspirantes.historial_eventos (aspirante_id, fecha_evento DESC);

-- Índice compuesto para renderizado cronológico de la Conversación de Chat (HU3-5 y HU 4)
CREATE INDEX IF NOT EXISTS idx_conversacion_aspirante_fecha 
    ON aspirantes.conversaciones_mensajes (aspirante_id, fecha_envio ASC);

-- Índice compuesto para paginación incremental inversa de mensajes de Chat
CREATE INDEX IF NOT EXISTS idx_conversacion_aspirante_fecha_desc 
    ON aspirantes.conversaciones_mensajes (aspirante_id, fecha_envio DESC);

-- Índices de apoyo para filtrado y monitoreo de cartera (HU 2 / HU 6)
CREATE INDEX IF NOT EXISTS idx_aspirantes_colaborador 
    ON aspirantes.aspirantes (colaborador_id);

CREATE INDEX IF NOT EXISTS idx_aspirantes_semaforo 
    ON aspirantes.aspirantes (semaforo);

CREATE INDEX IF NOT EXISTS idx_aspirantes_estado 
    ON aspirantes.aspirantes (estado_solicitud);

CREATE INDEX IF NOT EXISTS idx_aspirantes_campus_carrera 
    ON aspirantes.aspirantes (campus, carrera_solicitada);
