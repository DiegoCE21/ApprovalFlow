-- Migración: Permitir valores NULL en firma_base64
-- Ahora usamos el nombre del usuario en lugar de la firma dibujada

ALTER TABLE firmas 
ALTER COLUMN firma_base64 DROP NOT NULL;

-- Verificar el cambio
SELECT 
    column_name, 
    data_type, 
    is_nullable 
FROM information_schema.columns 
WHERE table_name = 'firmas' 
AND column_name = 'firma_base64';
