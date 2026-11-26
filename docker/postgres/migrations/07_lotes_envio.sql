-- =============================================================================
-- Migración 07 · Lotes de envío de HU1 (EQ-83 · HU1-7)
-- Esquema: disparo
--
-- Un lote es una petición de envío del colaborador; tiene un envío por aspirante
-- y canal. La idempotencia se garantiza con la clave única (colaborador_id,
-- clave_idempotencia) y, sin clave, con la huella de la petición.
-- aspirante_id no tiene llave foránea porque el aspirante vive en otro esquema
-- (un esquema por módulo, sin FKs entre esquemas).
-- Se puede ejecutar más de una vez.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS disparo;

CREATE TABLE IF NOT EXISTS disparo.lote (
  id                        UUID         PRIMARY KEY,
  colaborador_id            VARCHAR(50)  NOT NULL,
  clave_idempotencia        VARCHAR(100)
                            CHECK (clave_idempotencia IS NULL OR clave_idempotencia ~ '^[A-Za-z0-9_-]{8,100}$'),
  huella                    CHAR(64)     NOT NULL,
  filtros                   JSONB        NOT NULL,
  enviar_por_correo         BOOLEAN      NOT NULL DEFAULT FALSE,
  estado                    VARCHAR(20)  NOT NULL DEFAULT 'CREADO' CHECK (estado IN ('CREADO')),
  total_aspirantes          INTEGER      NOT NULL CHECK (total_aspirantes > 0),
  total_envios_pendientes   INTEGER      NOT NULL CHECK (total_envios_pendientes >= 0),
  creado_en                 TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_lote_clave_idempotencia UNIQUE (colaborador_id, clave_idempotencia)
);

CREATE INDEX IF NOT EXISTS ix_lote_huella ON disparo.lote (colaborador_id, huella, creado_en DESC);

CREATE TABLE IF NOT EXISTS disparo.envio (
  id              UUID          PRIMARY KEY,
  lote_id         UUID          NOT NULL REFERENCES disparo.lote (id) ON DELETE CASCADE,
  aspirante_id    VARCHAR(50)   NOT NULL,
  canal           VARCHAR(10)   NOT NULL CHECK (canal IN ('WHATSAPP', 'CORREO')),
  estado          VARCHAR(12)   NOT NULL CHECK (estado IN ('PENDIENTE', 'NO_ENVIABLE')),
  mensaje_id      VARCHAR(60)   NOT NULL,
  destino         VARCHAR(320),
  texto           TEXT,
  motivo          TEXT,
  codigo_motivo   VARCHAR(40),
  faltantes       TEXT[]        NOT NULL DEFAULT '{}',
  publicado_en    TIMESTAMPTZ,
  reclamado_hasta TIMESTAMPTZ,
  CONSTRAINT uq_envio_aspirante_canal UNIQUE (lote_id, aspirante_id, canal),
  CONSTRAINT ck_envio_estado CHECK (
    (estado = 'PENDIENTE' AND destino IS NOT NULL AND texto IS NOT NULL AND motivo IS NULL)
    OR (estado = 'NO_ENVIABLE' AND motivo IS NOT NULL AND publicado_en IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_envio_sin_publicar ON disparo.envio (lote_id) WHERE estado = 'PENDIENTE' AND publicado_en IS NULL;

COMMENT ON TABLE disparo.lote IS 'Lotes de envío de HU1 (EQ-83): una fila por petición del colaborador.';
COMMENT ON TABLE disparo.envio IS 'Un envío por aspirante y canal; PENDIENTE publica disparo.envio.solicitado.';
COMMENT ON COLUMN disparo.envio.publicado_en IS 'Cuándo se publicó el evento; NULL = se vuelve a publicar al repetir la petición.';
COMMENT ON COLUMN disparo.envio.reclamado_hasta IS 'Apartado por la petición que lo está publicando; evita publicar dos veces en peticiones simultáneas.';
