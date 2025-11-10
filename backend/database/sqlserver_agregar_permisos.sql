-- Script para SQL Server
-- Agregar campo puede_subir_documentos a tabla Usuarios

USE [FlujoAprobaciones]; -- Ajusta el nombre de tu base de datos
GO

-- Agregar columna si no existe
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.Usuarios') 
    AND name = 'puede_subir_documentos'
)
BEGIN
    ALTER TABLE dbo.Usuarios 
    ADD puede_subir_documentos BIT DEFAULT 0 NOT NULL;
    
    PRINT '✓ Columna puede_subir_documentos agregada';
END
ELSE
BEGIN
    PRINT '! Columna puede_subir_documentos ya existe';
END
GO

-- Dar permiso automáticamente a diego.castillo@fastprobags.com
UPDATE dbo.Usuarios 
SET puede_subir_documentos = 1
WHERE correo = 'diego.castillo@fastprobags.com';

PRINT '✓ Permiso otorgado a diego.castillo@fastprobags.com';
GO

-- Verificar
SELECT 
    id, 
    nombre, 
    correo, 
    puede_subir_documentos,
    TipoUsuario
FROM dbo.Usuarios 
WHERE correo = 'diego.castillo@fastprobags.com';
GO
