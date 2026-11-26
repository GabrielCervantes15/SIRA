-- ============================================================================
-- HU6-18 / HU7: periodo de baja del colaborador.
-- baja_hasta NULL con estado 'inactivo' = baja indefinida.
-- Idempotente: se puede ejecutar más de una vez.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('usuarios.usuario') IS NOT NULL THEN
    ALTER TABLE usuarios.usuario ADD COLUMN IF NOT EXISTS baja_desde DATE;
    ALTER TABLE usuarios.usuario ADD COLUMN IF NOT EXISTS baja_hasta DATE;
    COMMENT ON COLUMN usuarios.usuario.baja_desde IS 'Inicio de la baja del colaborador (HU6-18).';
    COMMENT ON COLUMN usuarios.usuario.baja_hasta IS 'Fin de la baja; NULL = indefinida (HU6-18).';
  END IF;
END
$$;
