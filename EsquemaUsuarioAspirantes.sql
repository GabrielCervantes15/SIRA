-- =====================================================================
-- BASE-5: Modelo de datos de los esquemas Usuarios y Aspirantes
-- PostgreSQL 13 o superior
-- Sin FKs entre esquemas: las referencias cruzadas son ids simples
-- validados por la interfaz pública del módulo dueño.
-- =====================================================================


-- =====================================================================
-- MIGRACIÓN 001: esquema aspirantes
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS aspirantes;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Búsqueda por nombre sin acentos ni mayúsculas (HU2-4)
CREATE OR REPLACE FUNCTION aspirantes.norm(t TEXT) RETURNS TEXT
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
  $$ SELECT lower(public.unaccent('public.unaccent', t)) $$;

-- Tipos enumerados
CREATE TYPE aspirantes.semaforo AS ENUM ('rojo', 'naranja', 'verde');

CREATE TYPE aspirantes.estado_solicitud AS ENUM (
  'registrada', 'en_revision', 'aceptado', 'rechazado'   -- valores de ejemplo
);

CREATE TYPE aspirantes.tipo_actividad AS ENUM ('mensaje_enviado', 'constancia', 'rechazo');
CREATE TYPE aspirantes.direccion      AS ENUM ('enviado', 'recibido');

-- Catálogos
CREATE TABLE aspirantes.campus (
  id      SMALLSERIAL PRIMARY KEY,
  nombre  TEXT NOT NULL UNIQUE
);

CREATE TABLE aspirantes.carrera (
  id      SMALLSERIAL PRIMARY KEY,
  nombre  TEXT NOT NULL UNIQUE
);

CREATE TABLE aspirantes.campus_carrera (
  campus_id   SMALLINT NOT NULL REFERENCES aspirantes.campus(id),
  carrera_id  SMALLINT NOT NULL REFERENCES aspirantes.carrera(id),
  PRIMARY KEY (campus_id, carrera_id)
);

CREATE TABLE aspirantes.periodo (
  id      SMALLSERIAL PRIMARY KEY,
  nombre  TEXT NOT NULL UNIQUE,            -- ej. '2027-1'
  inicio  DATE,
  fin     DATE
);

CREATE TABLE aspirantes.preparatoria (
  id      SERIAL PRIMARY KEY,
  nombre  TEXT NOT NULL UNIQUE
);

-- Aspirante
CREATE TABLE aspirantes.aspirante (
  id                   BIGSERIAL PRIMARY KEY,
  nombre               TEXT NOT NULL,
  correo               TEXT,
  telefono             TEXT,
  campus_id            SMALLINT NOT NULL REFERENCES aspirantes.campus(id),
  carrera_id           SMALLINT NOT NULL REFERENCES aspirantes.carrera(id),
  preparatoria_id      INT REFERENCES aspirantes.preparatoria(id),
  periodo_id           SMALLINT NOT NULL REFERENCES aspirantes.periodo(id),
  estado_solicitud     aspirantes.estado_solicitud NOT NULL DEFAULT 'registrada',
  fecha_solicitud      DATE NOT NULL,
  semaforo             aspirantes.semaforo NOT NULL DEFAULT 'rojo',
  ultima_actividad_at  TIMESTAMPTZ,
  colaborador_id       UUID,               -- ref. lógica a usuarios.usuario(id), sin FK
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Línea de tiempo del expediente (HU3-2, HU3-4)
CREATE TABLE aspirantes.historial_actividades (
  id            BIGSERIAL PRIMARY KEY,
  aspirante_id  BIGINT NOT NULL REFERENCES aspirantes.aspirante(id),
  tipo          aspirantes.tipo_actividad NOT NULL,
  detalle       TEXT NOT NULL,             -- mensaje, constancia o motivo de rechazo
  ocurrido_at   TIMESTAMPTZ NOT NULL
);

-- Conversación, enviados y recibidos (HU3-5)
CREATE TABLE aspirantes.mensaje_conversacion (
  id            BIGSERIAL PRIMARY KEY,
  aspirante_id  BIGINT NOT NULL REFERENCES aspirantes.aspirante(id),
  direccion     aspirantes.direccion NOT NULL,
  contenido     TEXT NOT NULL,
  enviado_at    TIMESTAMPTZ NOT NULL
);

-- Índices (HU2-3, HU3-2)
CREATE INDEX ix_asp_colab_semaforo ON aspirantes.aspirante (colaborador_id, semaforo);
CREATE INDEX ix_asp_colab_carrera  ON aspirantes.aspirante (colaborador_id, carrera_id);
CREATE INDEX ix_asp_colab_prepa    ON aspirantes.aspirante (colaborador_id, preparatoria_id);
CREATE INDEX ix_asp_colab_periodo  ON aspirantes.aspirante (colaborador_id, periodo_id);
CREATE INDEX ix_asp_colab_estado   ON aspirantes.aspirante (colaborador_id, estado_solicitud);
CREATE INDEX ix_asp_nombre_trgm    ON aspirantes.aspirante USING gin (aspirantes.norm(nombre) gin_trgm_ops);
CREATE INDEX ix_hist_asp_fecha     ON aspirantes.historial_actividades (aspirante_id, ocurrido_at DESC);
CREATE INDEX ix_conv_asp_fecha     ON aspirantes.mensaje_conversacion (aspirante_id, enviado_at DESC);


-- =====================================================================
-- MIGRACIÓN 002: esquema usuarios
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS usuarios;

CREATE TYPE usuarios.rol    AS ENUM ('administrador', 'colaborador');
CREATE TYPE usuarios.estado AS ENUM ('borrador', 'activo', 'inactivo');
CREATE TYPE usuarios.motivo_transferencia AS ENUM ('alta', 'inactivacion', 'manual');

-- Sin contraseñas ni datos personales: eso lo resuelve Autenticación
CREATE TABLE usuarios.usuario (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_directorio     TEXT NOT NULL UNIQUE,   -- id en Active Directory (simulado)
  rol               usuarios.rol NOT NULL,
  estado            usuarios.estado NOT NULL DEFAULT 'borrador',
  campus_id         SMALLINT,               -- ref. lógica a aspirantes.campus
  casos_especiales  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un colaborador puede tener muchas carreras y una carrera muchos colaboradores
CREATE TABLE usuarios.colaborador_carrera (
  usuario_id  UUID NOT NULL REFERENCES usuarios.usuario(id),
  carrera_id  SMALLINT NOT NULL,            -- ref. lógica a aspirantes.carrera
  PRIMARY KEY (usuario_id, carrera_id)
);

-- Borrador del alta, del administrador (HU6-6)
CREATE TABLE usuarios.borrador_registro (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_directorio  TEXT NOT NULL,
  campus_id      SMALLINT,
  carreras_ids   SMALLINT[] NOT NULL DEFAULT '{}',
  creado_por     UUID NOT NULL REFERENCES usuarios.usuario(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bitácora de transferencias (HU6-9, HU6-10, HU6-11)
CREATE TABLE usuarios.bitacora_transferencia (
  id                   BIGSERIAL PRIMARY KEY,
  aspirante_id         BIGINT NOT NULL,     -- ref. lógica a aspirantes.aspirante
  colaborador_origen   UUID REFERENCES usuarios.usuario(id),
  colaborador_destino  UUID NOT NULL REFERENCES usuarios.usuario(id),
  motivo               usuarios.motivo_transferencia NOT NULL,
  realizado_por        UUID NOT NULL REFERENCES usuarios.usuario(id),
  realizado_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_usuario_campus_estado ON usuarios.usuario (campus_id, estado);
CREATE INDEX ix_bitacora_aspirante    ON usuarios.bitacora_transferencia (aspirante_id, realizado_at DESC);


-- =====================================================================
-- ROLLBACK (solo si lo necesitas; descomenta para repetir desde cero)
-- =====================================================================
-- DROP SCHEMA IF EXISTS usuarios CASCADE;
-- DROP SCHEMA IF EXISTS aspirantes CASCADE;
