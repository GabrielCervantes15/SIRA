-- ============================================================================
-- HU6-11 / EQ-70: autorización para recibir expedientes de otros campus.
-- Se agrega a usuarios.usuario; por defecto nadie recibe casos especiales.
-- Idempotente: se puede ejecutar más de una vez.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('usuarios.usuario') IS NOT NULL THEN
    ALTER TABLE usuarios.usuario
      ADD COLUMN IF NOT EXISTS casos_especiales BOOLEAN NOT NULL DEFAULT FALSE;

    COMMENT ON COLUMN usuarios.usuario.casos_especiales IS
      'Autoriza al colaborador a recibir transferencias manuales de expedientes de otros campus (HU6-11 / EQ-70).';
  END IF;
END
$$;
