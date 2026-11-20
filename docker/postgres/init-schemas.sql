-- ============================================================================
-- SIRA - CRM ITSON: Inicialización de Esquemas por Módulo de Negocio
-- Arquitectura: Monolito Modular con PostgreSQL
-- ============================================================================

-- Habilitar extensiones requeridas para generación de UUIDs y utilidades criptográficas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Esquema: usuarios
-- Responsabilidad: Información de colaboradores y administradores, roles, asignación de campus/carreras.
-- Nota: NO almacena contraseñas (la identidad proviene de Active Directory / Kerberos).
CREATE SCHEMA IF NOT EXISTS usuarios;
COMMENT ON SCHEMA usuarios IS 'Módulo Usuarios/Colaboradores: Perfiles, roles y asignaciones.';

-- 2. Esquema: aspirantes
-- Responsabilidad: Datos personales e institucionales del aspirante, expediente,
-- historial de eventos (mensajes enviados, constancias, rechazos), conversaciones de chat,
-- estado de la solicitud y semáforo de inactividad.
CREATE SCHEMA IF NOT EXISTS aspirantes;
COMMENT ON SCHEMA aspirantes IS 'Módulo Aspirantes y Monitoreo: Expedientes, historial unificado y conversaciones.';

-- 3. Esquema: alertas
-- Responsabilidad: Historial y configuración de alertas de inactividad y atención humana prioritaria.
CREATE SCHEMA IF NOT EXISTS alertas;
COMMENT ON SCHEMA alertas IS 'Módulo Alertas: Registro y gestión de alertas operativas de colaboradores.';

-- 4. Esquema: conocimiento
-- Responsabilidad: Base de conocimiento de preparatorias, requisitos de trámites y preguntas frecuentes (FAQ).
CREATE SCHEMA IF NOT EXISTS conocimiento;
COMMENT ON SCHEMA conocimiento IS 'Módulo Conocimiento: Repositorio de FAQs y catálogo de preparatorias para el agente IA.';

-- Configurar permisos para el usuario predeterminado de la aplicación
DO $$
DECLARE
    current_usr TEXT := current_user;
BEGIN
    EXECUTE format('GRANT ALL PRIVILEGES ON SCHEMA usuarios TO %I', current_usr);
    EXECUTE format('GRANT ALL PRIVILEGES ON SCHEMA aspirantes TO %I', current_usr);
    EXECUTE format('GRANT ALL PRIVILEGES ON SCHEMA alertas TO %I', current_usr);
    EXECUTE format('GRANT ALL PRIVILEGES ON SCHEMA conocimiento TO %I', current_usr);
    
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA usuarios GRANT ALL ON TABLES TO %I', current_usr);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA aspirantes GRANT ALL ON TABLES TO %I', current_usr);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA alertas GRANT ALL ON TABLES TO %I', current_usr);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA conocimiento GRANT ALL ON TABLES TO %I', current_usr);
END
$$;
