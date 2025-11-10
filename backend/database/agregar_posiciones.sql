-- Agregar campos de posición a la tabla aprobadores
ALTER TABLE aprobadores 
ADD COLUMN IF NOT EXISTS posicion_x FLOAT,
ADD COLUMN IF NOT EXISTS posicion_y FLOAT,
ADD COLUMN IF NOT EXISTS pagina_firma INTEGER DEFAULT -1,
ADD COLUMN IF NOT EXISTS ancho_firma FLOAT DEFAULT 150,
ADD COLUMN IF NOT EXISTS alto_firma FLOAT DEFAULT 75;

-- Comentarios
COMMENT ON COLUMN aprobadores.posicion_x IS 'Coordenada X donde debe ir la firma en el PDF';
COMMENT ON COLUMN aprobadores.posicion_y IS 'Coordenada Y donde debe ir la firma en el PDF';
COMMENT ON COLUMN aprobadores.pagina_firma IS 'Número de página donde debe ir la firma (-1 = última página)';
COMMENT ON COLUMN aprobadores.ancho_firma IS 'Ancho de la firma en el PDF';
COMMENT ON COLUMN aprobadores.alto_firma IS 'Alto de la firma en el PDF';
