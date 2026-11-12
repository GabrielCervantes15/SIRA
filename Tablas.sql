CREATE SCHEMA IF NOT EXISTS usuarios;

CREATE TYPE usuarios.rol    AS ENUM ('administrador', 'colaborador');
CREATE TYPE usuarios.estado AS ENUM ('borrador', 'activo', 'inactivo');
CREATE TYPE usuarios.motivo_transferencia AS ENUM ('alta', 'inactivacion', 'manual');

-- Perfil: estado, rol, campus y casilla de casos especiales
CREATE TABLE usuarios.usuario (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_directorio     TEXT NOT NULL UNIQUE,
  rol               usuarios.rol NOT NULL,
  estado            usuarios.estado NOT NULL DEFAULT 'borrador',
  campus_id         SMALLINT,
  casos_especiales  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colaborador-carrera (muchos a muchos)
CREATE TABLE usuarios.colaborador_carrera (
  usuario_id  UUID NOT NULL REFERENCES usuarios.usuario(id),
  carrera_id  SMALLINT NOT NULL,
  PRIMARY KEY (usuario_id, carrera_id)
);

-- Borrador de registro
CREATE TABLE usuarios.borrador_registro (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_directorio  TEXT NOT NULL,
  campus_id      SMALLINT,
  carreras_ids   SMALLINT[] NOT NULL DEFAULT '{}',
  creado_por     UUID NOT NULL REFERENCES usuarios.usuario(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bitácora de transferencias
CREATE TABLE usuarios.bitacora_transferencia (
  id                   BIGSERIAL PRIMARY KEY,
  aspirante_id         BIGINT NOT NULL,
  colaborador_origen   UUID REFERENCES usuarios.usuario(id),
  colaborador_destino  UUID NOT NULL REFERENCES usuarios.usuario(id),
  motivo               usuarios.motivo_transferencia NOT NULL,
  realizado_por        UUID NOT NULL REFERENCES usuarios.usuario(id),
  realizado_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_usuario_campus_estado ON usuarios.usuario (campus_id, estado);
CREATE INDEX ix_bitacora_aspirante    ON usuarios.bitacora_transferencia (aspirante_id, realizado_at DESC);