-- ============================================================================
-- SIRA - CRM ITSON: DDL de Configuración del Envío de Mensajes Automáticos
-- Tarea: EQ-104 · HU9-3 (Sprint 2)
-- Módulo: Mensajes (esquema `mensajes`)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS mensajes;

-- ----------------------------------------------------------------------------
-- 1. Tabla: mensajes.configuracion_parametros
-- Parámetros globales de zona horaria y tiempos de espera aprobados por el PO.
-- Registro único (id = 1) administrado exclusivamente por el rol Administrador.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mensajes.configuracion_parametros (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    zona_horaria VARCHAR(60) NOT NULL DEFAULT 'America/Hermosillo'
        CHECK (zona_horaria = 'America/Hermosillo'),
    espera_respuesta_valor INTEGER NOT NULL DEFAULT 24
        CHECK (espera_respuesta_valor >= 1),
    espera_respuesta_unidad VARCHAR(10) NOT NULL DEFAULT 'horas'
        CHECK (espera_respuesta_unidad IN ('horas', 'dias')),
    espera_contacto_previo_valor INTEGER NOT NULL DEFAULT 48
        CHECK (espera_contacto_previo_valor >= 1),
    espera_contacto_previo_unidad VARCHAR(10) NOT NULL DEFAULT 'horas'
        CHECK (espera_contacto_previo_unidad IN ('horas', 'dias')),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_por VARCHAR(50) NULL,
    CONSTRAINT chk_espera_respuesta_rango_horas CHECK (
        (CASE
            WHEN espera_respuesta_unidad = 'dias' THEN espera_respuesta_valor * 24
            ELSE espera_respuesta_valor
        END) BETWEEN 1 AND 720
    ),
    CONSTRAINT chk_espera_contacto_previo_rango_horas CHECK (
        (CASE
            WHEN espera_contacto_previo_unidad = 'dias' THEN espera_contacto_previo_valor * 24
            ELSE espera_contacto_previo_valor
        END) BETWEEN 1 AND 720
    )
);

COMMENT ON TABLE mensajes.configuracion_parametros IS 'Parámetros globales de configuración del envío de mensajes automáticos (HU 9).';
COMMENT ON COLUMN mensajes.configuracion_parametros.zona_horaria IS 'Zona horaria institucional fija: America/Hermosillo (UTC-07:00).';
COMMENT ON COLUMN mensajes.configuracion_parametros.espera_respuesta_valor IS 'Valor entero positivo del tiempo máximo de espera de respuesta (1 hora a 30 días).';
COMMENT ON COLUMN mensajes.configuracion_parametros.espera_contacto_previo_valor IS 'Valor entero positivo del tiempo de exclusión por contacto previo para lotes HU1 (1 hora a 30 días).';

-- ----------------------------------------------------------------------------
-- 2. Tabla: mensajes.configuracion_jornada
-- Configuración independiente por cada uno de los 7 días de la semana.
-- El horario permitido de envío abarca toda la jornada habilitada de ese día.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mensajes.configuracion_jornada (
    dia_semana VARCHAR(15) PRIMARY KEY
        CHECK (dia_semana IN ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo')),
    orden_dia SMALLINT NOT NULL UNIQUE
        CHECK (orden_dia BETWEEN 1 AND 7),
    habilitado BOOLEAN NOT NULL DEFAULT TRUE,
    hora_inicio VARCHAR(5) NULL,
    hora_fin VARCHAR(5) NULL,
    CONSTRAINT chk_jornada_horario_valido CHECK (
        (
            habilitado = TRUE
            AND hora_inicio IS NOT NULL
            AND hora_fin IS NOT NULL
            AND hora_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            AND hora_fin ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            AND hora_inicio < hora_fin
        )
        OR
        (
            habilitado = FALSE
            AND hora_inicio IS NULL
            AND hora_fin IS NULL
        )
    )
);

COMMENT ON TABLE mensajes.configuracion_jornada IS 'Jornada laboral y horario permitido de envío configurable de forma independiente por día de la semana (HU 9).';

-- ----------------------------------------------------------------------------
-- 3. Valores Iniciales Aprobados por el PO (EQ-102 / EQ-104)
-- ----------------------------------------------------------------------------
INSERT INTO mensajes.configuracion_parametros (
    id,
    zona_horaria,
    espera_respuesta_valor,
    espera_respuesta_unidad,
    espera_contacto_previo_valor,
    espera_contacto_previo_unidad,
    actualizado_por
) VALUES (
    1,
    'America/Hermosillo',
    24,
    'horas',
    48,
    'horas',
    'SISTEMA'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO mensajes.configuracion_jornada (dia_semana, orden_dia, habilitado, hora_inicio, hora_fin) VALUES
    ('lunes',     1, TRUE,  '08:00', '18:00'),
    ('martes',    2, TRUE,  '08:00', '18:00'),
    ('miercoles', 3, TRUE,  '08:00', '18:00'),
    ('jueves',    4, TRUE,  '08:00', '18:00'),
    ('viernes',   5, TRUE,  '08:00', '18:00'),
    ('sabado',    6, FALSE, NULL,    NULL),
    ('domingo',   7, FALSE, NULL,    NULL)
ON CONFLICT (dia_semana) DO NOTHING;
