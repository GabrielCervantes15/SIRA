-- =========================================================================
-- HU 8 · EQ-95: catálogo de mensajes predefinidos (esquema mensajes).
-- Contenido: datos-semilla/mensajes-ia.json (catálogo de EQ-98/99, el que muestra la pantalla).
-- Solo lectura para Administrador y Colaborador: la aplicación no escribe aquí.
-- Idempotente: se puede correr más de una vez.
-- Semilla: datos-semilla/05_catalogo_mensajes_semilla.sql
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS mensajes;

CREATE TABLE IF NOT EXISTS mensajes.catalogo_mensaje (
  id                         VARCHAR(60)  PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_-]{2,59}$'),
  categoria                  VARCHAR(10)  NOT NULL CHECK (categoria IN ('ENVIO', 'RESPUESTA')),
  nombre                     VARCHAR(120) NOT NULL,
  orden                      SMALLINT     NOT NULL CHECK (orden > 0),
  grupo                      VARCHAR(60),
  pregunta                   VARCHAR(300),
  disparador                 VARCHAR(25)  NOT NULL
                             CHECK (disparador IN ('AUTOMATICO', 'MANUAL', 'AUTOMATICO_Y_MANUAL', 'LOTE_HU1', 'RESPUESTA')),
  canal                      VARCHAR(20)  NOT NULL DEFAULT 'WHATSAPP',
  requiere_plantilla_meta    BOOLEAN      NOT NULL DEFAULT FALSE,
  plantilla_meta_referencia  VARCHAR(120),
  plantilla_meta_estado      VARCHAR(12)
                             CHECK (plantilla_meta_estado IN ('PENDIENTE', 'ENVIADA', 'APROBADA', 'RECHAZADA')),
  texto                      TEXT         NOT NULL CHECK (length(btrim(texto)) > 0),
  activo                     BOOLEAN      NOT NULL DEFAULT TRUE,
  fuente                     VARCHAR(20)  NOT NULL DEFAULT 'EQ-93',
  created_at                 TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_catalogo_pregunta_solo_respuesta CHECK (pregunta IS NULL OR categoria = 'RESPUESTA'),
  CONSTRAINT ck_catalogo_plantilla_meta CHECK (
    (requiere_plantilla_meta AND plantilla_meta_estado IS NOT NULL)
    OR (NOT requiere_plantilla_meta AND plantilla_meta_estado IS NULL AND plantilla_meta_referencia IS NULL)
  ),
  CONSTRAINT uq_catalogo_orden_por_categoria UNIQUE (categoria, orden)
);

CREATE TABLE IF NOT EXISTS mensajes.catalogo_variable (
  mensaje_id  VARCHAR(60) NOT NULL REFERENCES mensajes.catalogo_mensaje(id) ON DELETE CASCADE,
  nombre      VARCHAR(30) NOT NULL CHECK (nombre IN ('aspirante', 'carrera', 'valor', 'magnitud')),
  orden       SMALLINT    NOT NULL,
  PRIMARY KEY (mensaje_id, nombre)
);

CREATE TABLE IF NOT EXISTS mensajes.catalogo_llave (
  mensaje_id  VARCHAR(60)  NOT NULL REFERENCES mensajes.catalogo_mensaje(id) ON DELETE CASCADE,
  orden       SMALLINT     NOT NULL,
  tipo        VARCHAR(60)  NOT NULL,
  valor       VARCHAR(300) NOT NULL,
  PRIMARY KEY (mensaje_id, orden)
);

CREATE TABLE IF NOT EXISTS mensajes.catalogo_regla (
  mensaje_id   VARCHAR(60) NOT NULL REFERENCES mensajes.catalogo_mensaje(id) ON DELETE CASCADE,
  orden        SMALLINT    NOT NULL,
  descripcion  TEXT        NOT NULL,
  PRIMARY KEY (mensaje_id, orden)
);

CREATE INDEX IF NOT EXISTS idx_catalogo_mensaje_categoria_orden
  ON mensajes.catalogo_mensaje (categoria, orden) WHERE activo;
