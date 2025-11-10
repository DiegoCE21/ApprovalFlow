-- Script para limpiar todos los datos de prueba
-- ADVERTENCIA: Esto eliminará TODOS los datos de las tablas

-- Desactivar restricciones de claves foráneas temporalmente
SET session_replication_role = 'replica';

-- Limpiar todas las tablas en orden
TRUNCATE TABLE log_auditoria CASCADE;
TRUNCATE TABLE firmas CASCADE;
TRUNCATE TABLE aprobadores CASCADE;
TRUNCATE TABLE documentos CASCADE;

-- Reactivar restricciones
SET session_replication_role = 'origin';

-- Resetear secuencias para que los IDs comiencen desde 1
ALTER SEQUENCE log_auditoria_id_seq RESTART WITH 1;
ALTER SEQUENCE firmas_id_seq RESTART WITH 1;
ALTER SEQUENCE aprobadores_id_seq RESTART WITH 1;
ALTER SEQUENCE documentos_id_seq RESTART WITH 1;

-- Verificar que las tablas estén vacías
SELECT 'documentos' as tabla, COUNT(*) as registros FROM documentos
UNION ALL
SELECT 'aprobadores', COUNT(*) FROM aprobadores
UNION ALL
SELECT 'firmas', COUNT(*) FROM firmas
UNION ALL
SELECT 'log_auditoria', COUNT(*) FROM log_auditoria;
