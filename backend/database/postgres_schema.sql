-- Base de datos: flujo_aprobaciones
-- Sistema de gestión de aprobaciones y firmas digitales

-- Tabla de documentos
CREATE TABLE IF NOT EXISTS documentos (
    id SERIAL PRIMARY KEY,
    nombre_archivo VARCHAR(255) NOT NULL,
    ruta_archivo VARCHAR(500) NOT NULL,
    tipo_documento VARCHAR(100),
    descripcion TEXT,
    version INTEGER DEFAULT 1,
    documento_padre_id INTEGER REFERENCES documentos(id),
    usuario_creador_id INTEGER NOT NULL,
    usuario_creador_nombre VARCHAR(255),
    usuario_creador_correo VARCHAR(255),
    estado VARCHAR(50) DEFAULT 'pendiente', -- pendiente, aprobado, rechazado, en_revision
    token_acceso VARCHAR(255) UNIQUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_finalizacion TIMESTAMP
);

-- Tabla de aprobadores
CREATE TABLE IF NOT EXISTS aprobadores (
    id SERIAL PRIMARY KEY,
    documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL,
    usuario_nombre VARCHAR(255) NOT NULL,
    usuario_correo VARCHAR(255) NOT NULL,
    rol_aprobacion VARCHAR(100), -- jefe_departamento, gerente, director, calidad
    orden_aprobacion INTEGER DEFAULT 1,
    estado VARCHAR(50) DEFAULT 'pendiente', -- pendiente, aprobado, rechazado
    fecha_aprobacion TIMESTAMP,
    motivo_rechazo TEXT,
    token_firma VARCHAR(255) UNIQUE,
    -- Posición donde debe ir la firma en el PDF
    posicion_x FLOAT,
    posicion_y FLOAT,
    pagina_firma INTEGER DEFAULT -1, -- -1 = última página
    ancho_firma FLOAT DEFAULT 150,
    alto_firma FLOAT DEFAULT 75,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(documento_id, usuario_id)
);

-- Tabla de firmas digitales
CREATE TABLE IF NOT EXISTS firmas (
    id SERIAL PRIMARY KEY,
    documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    aprobador_id INTEGER NOT NULL REFERENCES aprobadores(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL,
    usuario_nombre VARCHAR(255) NOT NULL,
    firma_base64 TEXT NOT NULL, -- Imagen de la firma en base64
    posicion_x FLOAT,
    posicion_y FLOAT,
    pagina INTEGER DEFAULT 1,
    ancho FLOAT DEFAULT 200,
    alto FLOAT DEFAULT 100,
    fecha_firma TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(50),
    UNIQUE(documento_id, aprobador_id)
);

-- Tabla de log de auditoría
CREATE TABLE IF NOT EXISTS log_auditoria (
    id SERIAL PRIMARY KEY,
    documento_id INTEGER REFERENCES documentos(id) ON DELETE SET NULL,
    usuario_id INTEGER,
    usuario_nombre VARCHAR(255),
    usuario_correo VARCHAR(255),
    accion VARCHAR(100) NOT NULL, -- subida, aprobacion, rechazo, firma, notificacion, descarga
    descripcion TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    metadata JSONB,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimización
CREATE INDEX idx_documentos_estado ON documentos(estado);
CREATE INDEX idx_documentos_usuario_creador ON documentos(usuario_creador_id);
CREATE INDEX idx_documentos_token ON documentos(token_acceso);
CREATE INDEX idx_aprobadores_documento ON aprobadores(documento_id);
CREATE INDEX idx_aprobadores_usuario ON aprobadores(usuario_id);
CREATE INDEX idx_aprobadores_estado ON aprobadores(estado);
CREATE INDEX idx_aprobadores_token ON aprobadores(token_firma);
CREATE INDEX idx_firmas_documento ON firmas(documento_id);
CREATE INDEX idx_firmas_usuario ON firmas(usuario_id);
CREATE INDEX idx_log_documento ON log_auditoria(documento_id);
CREATE INDEX idx_log_fecha ON log_auditoria(fecha);

-- Trigger para actualizar fecha_actualizacion en documentos
CREATE OR REPLACE FUNCTION actualizar_fecha_actualizacion()
RETURNS TRIGGER AS $$
BEGIN
    NEW.fecha_actualizacion = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_actualizar_fecha_documentos
BEFORE UPDATE ON documentos
FOR EACH ROW
EXECUTE FUNCTION actualizar_fecha_actualizacion();

-- Comentarios para documentación
COMMENT ON TABLE documentos IS 'Almacena los documentos PDF subidos al sistema';
COMMENT ON TABLE aprobadores IS 'Define los usuarios responsables de aprobar cada documento';
COMMENT ON TABLE firmas IS 'Contiene las firmas digitales capturadas de los aprobadores';
COMMENT ON TABLE log_auditoria IS 'Registro completo de todas las acciones realizadas en el sistema';
