-- =============================================================================
-- Migración 08 · Parámetros de la plantilla por envío (EQ-85 · HU1-9)
-- Esquema: disparo
--
-- Valores de las variables {{1}}, {{2}}… de la plantilla de Meta, en el orden del
-- texto (nombre y carrera en la de reactivación). Los usa el envío por Cloud API.
-- Se puede ejecutar más de una vez.
-- =============================================================================

ALTER TABLE disparo.envio
  ADD COLUMN IF NOT EXISTS parametros TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN disparo.envio.parametros IS
  'Valores de las variables de la plantilla de Meta, en orden ({{1}}, {{2}}…).';
