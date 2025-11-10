-- Migración: Agregar campo puede_subir_documentos a la tabla usuarios en SQL Server

-- Nota: Este script debe ejecutarse en SQL Server
-- ALTER TABLE usuarios 
-- ADD puede_subir_documentos BIT DEFAULT 0;

-- Dar permiso automáticamente a diego.castillo@fastprobags.com
-- UPDATE usuarios 
-- SET puede_subir_documentos = 1
-- WHERE correo = 'diego.castillo@fastprobags.com';

-- Para PostgreSQL (si se usa tabla de usuarios local):
ALTER TABLE usuarios 
ADD COLUMN IF NOT EXISTS puede_subir_documentos BOOLEAN DEFAULT FALSE;

-- Dar permiso a diego.castillo@fastprobags.com en PostgreSQL
UPDATE usuarios 
SET puede_subir_documentos = TRUE
WHERE correo = 'diego.castillo@fastprobags.com';

-- Verificar
SELECT id, nombre, correo, puede_subir_documentos 
FROM usuarios 
WHERE correo = 'diego.castillo@fastprobags.com';
