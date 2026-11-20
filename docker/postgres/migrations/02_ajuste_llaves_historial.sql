-- ============================================================================
-- SIRA - CRM ITSON: Migración de Verificación y Ajuste de Llaves Foráneas
-- Tarea: [HU6-4] Verificar que expediente, historial y conversación estén ligados al aspirante
-- ============================================================================
-- Propósito:
-- Garantizar a nivel de esquema en PostgreSQL que todas las entidades hijas del
-- expediente (mensajes, constancias, rechazos, historial_eventos y conversaciones_mensajes /
-- conversacion_chat) dependan exclusivamente de `aspirante_id` (FK -> aspirantes.aspirantes.id)
-- con ON DELETE CASCADE y ON UPDATE CASCADE, eliminando cualquier dependencia o
-- llave foránea hacia `colaborador_id`.
--
-- De este modo, al reasignar un aspirante de un colaborador a otro en HU 6:
--   UPDATE aspirantes.aspirantes SET colaborador_id = $1 WHERE id = $2;
-- todo su expediente, historial y conversación viajan automáticamente con el aspirante.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS aspirantes;

-- ----------------------------------------------------------------------------
-- 1. Asegurar estructura de tablas hijas desagregadas/heredadas si existen o se requieren
--    (mensajes, constancias, rechazos y conversacion_chat) ligadas solo a aspirante_id
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aspirantes.mensajes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aspirante_id VARCHAR(50) NOT NULL
        REFERENCES aspirantes.aspirantes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    origen VARCHAR(20) NOT NULL DEFAULT 'SISTEMA'
        CHECK (origen IN ('SISTEMA', 'IA', 'COLABORADOR')),
    contenido TEXT NOT NULL,
    fecha_envio TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aspirantes.constancias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aspirante_id VARCHAR(50) NOT NULL
        REFERENCES aspirantes.aspirantes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    nombre_documento VARCHAR(150) NOT NULL DEFAULT 'Constancia de calificaciones',
    promedio NUMERIC(5,2) NULL,
    estado_validacion VARCHAR(30) NOT NULL DEFAULT 'ENTREGADA'
        CHECK (estado_validacion IN ('ENTREGADA', 'VALIDADA', 'RECHAZADA')),
    fecha_entrega TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aspirantes.rechazos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aspirante_id VARCHAR(50) NOT NULL
        REFERENCES aspirantes.aspirantes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    objeto_rechazo VARCHAR(30) NOT NULL DEFAULT 'CONSTANCIA'
        CHECK (objeto_rechazo IN ('CONSTANCIA', 'SOLICITUD')),
    motivo_rechazo TEXT NOT NULL,
    fecha_rechazo TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aspirantes.conversacion_chat (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aspirante_id VARCHAR(50) NOT NULL
        REFERENCES aspirantes.aspirantes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    direccion VARCHAR(10) NOT NULL
        CHECK (direccion IN ('ENTRANTE', 'SALIENTE')),
    remitente_tipo VARCHAR(20) NOT NULL
        CHECK (remitente_tipo IN ('ASPIRANTE', 'BOT_IA', 'COLABORADOR', 'SISTEMA')),
    contenido TEXT NOT NULL,
    whatsapp_message_id VARCHAR(100) NULL,
    fecha_envio TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 2. Auditoría y corrección automática de llaves foráneas en todas las tablas hijas
--    Elimina cualquier columna/FK `colaborador_id` en tablas hijas y asegura la FK
--    hacia `aspirantes.aspirantes(id)` con ON DELETE CASCADE ON UPDATE CASCADE.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    tabla_hija TEXT;
    fk_record RECORD;
    tiene_fk_aspirante BOOLEAN;
    tablas_hijas CONSTANT TEXT[] := ARRAY[
        'historial_eventos',
        'conversaciones_mensajes',
        'mensajes',
        'constancias',
        'rechazos',
        'conversacion_chat'
    ];
BEGIN
    FOREACH tabla_hija IN ARRAY tablas_hijas LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'aspirantes'
              AND table_name = tabla_hija
        ) THEN
            -- A) Si por error existe una columna colaborador_id en la tabla hija, eliminarla junto con sus FKs/índices
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'aspirantes'
                  AND table_name = tabla_hija
                  AND column_name = 'colaborador_id'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE aspirantes.%I DROP COLUMN colaborador_id CASCADE',
                    tabla_hija
                );
            END IF;

            -- B) Revisar las llaves foráneas actuales sobre aspirante_id y reconstruirlas si no tienen ON DELETE CASCADE
            tiene_fk_aspirante := FALSE;

            FOR fk_record IN
                SELECT
                    tc.constraint_name,
                    rc.delete_rule,
                    rc.update_rule
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                JOIN information_schema.referential_constraints AS rc
                  ON tc.constraint_name = rc.constraint_name
                 AND tc.table_schema = rc.constraint_schema
                WHERE tc.table_schema = 'aspirantes'
                  AND tc.table_name = tabla_hija
                  AND tc.constraint_type = 'FOREIGN KEY'
                  AND kcu.column_name = 'aspirante_id'
            LOOP
                IF fk_record.delete_rule = 'CASCADE' THEN
                    tiene_fk_aspirante := TRUE;
                ELSE
                    EXECUTE format(
                        'ALTER TABLE aspirantes.%I DROP CONSTRAINT %I',
                        tabla_hija,
                        fk_record.constraint_name
                    );
                END IF;
            END LOOP;

            -- C) Crear la llave foránea hacia aspirantes.aspirantes(id) si no existía o fue reemplazada
            IF NOT tiene_fk_aspirante THEN
                EXECUTE format(
                    'ALTER TABLE aspirantes.%I
                     ADD CONSTRAINT fk_%I_aspirante
                     FOREIGN KEY (aspirante_id)
                     REFERENCES aspirantes.aspirantes(id)
                     ON DELETE CASCADE
                     ON UPDATE CASCADE',
                    tabla_hija,
                    tabla_hija
                );
            END IF;
        END IF;
    END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 3. Índices compuestos por (aspirante_id, fecha) para garantizar consultas óptimas
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mensajes_aspirante_fecha
    ON aspirantes.mensajes (aspirante_id, fecha_envio DESC);

CREATE INDEX IF NOT EXISTS idx_constancias_aspirante_fecha
    ON aspirantes.constancias (aspirante_id, fecha_entrega DESC);

CREATE INDEX IF NOT EXISTS idx_rechazos_aspirante_fecha
    ON aspirantes.rechazos (aspirante_id, fecha_rechazo DESC);

CREATE INDEX IF NOT EXISTS idx_conversacion_chat_aspirante_fecha
    ON aspirantes.conversacion_chat (aspirante_id, fecha_envio ASC);

COMMIT;

