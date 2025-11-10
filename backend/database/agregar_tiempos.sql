-- Migración: Agregar campos para tiempo límite y recordatorios

-- Agregar columnas a la tabla documentos
ALTER TABLE documentos 
ADD COLUMN tiempo_limite_horas INTEGER DEFAULT NULL,
ADD COLUMN intervalo_recordatorio_minutos INTEGER DEFAULT NULL,
ADD COLUMN fecha_limite_aprobacion TIMESTAMP DEFAULT NULL,
ADD COLUMN ultimo_recordatorio_enviado TIMESTAMP DEFAULT NULL;

-- Agregar comentarios para documentar
COMMENT ON COLUMN documentos.tiempo_limite_horas IS 'Tiempo límite en horas para aprobar el documento';
COMMENT ON COLUMN documentos.intervalo_recordatorio_minutos IS 'Cada cuántos minutos enviar recordatorios a aprobadores pendientes';
COMMENT ON COLUMN documentos.fecha_limite_aprobacion IS 'Fecha y hora límite calculada para la aprobación';
COMMENT ON COLUMN documentos.ultimo_recordatorio_enviado IS 'Última vez que se enviaron recordatorios';

-- Verificar los cambios
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'documentos' 
AND column_name IN ('tiempo_limite_horas', 'intervalo_recordatorio_minutos', 'fecha_limite_aprobacion', 'ultimo_recordatorio_enviado')
ORDER BY ordinal_position;
