-- Base de datos SQL Server - Gestión de Usuarios y Autenticación
-- Esta base de datos debe existir previamente con la tabla de usuarios

-- Esquema de ejemplo para la tabla de usuarios (si no existe)
-- NOTA: Adaptar según la estructura real de tu base de datos SQL Server

/*
CREATE TABLE dbo.Usuarios (
    id INT PRIMARY KEY IDENTITY(1,1),
    nombre NVARCHAR(255) NOT NULL,
    correo NVARCHAR(255) NOT NULL UNIQUE,
    TipoUsuario NVARCHAR(50),
    NumeroNomina NVARCHAR(50),
    rolNom NVARCHAR(100),
    debe_cambiar_password BIT DEFAULT 0,
    fecha_ultimo_cambio_password DATETIME,
    creadoEn DATETIME DEFAULT GETDATE()
);

-- Tabla para almacenar hashes y salts de contraseñas
CREATE SCHEMA security;
GO

CREATE TABLE security.SaltStore (
    id INT PRIMARY KEY IDENTITY(1,1),
    usuario_id INT NOT NULL UNIQUE,
    password_hash VARBINARY(32) NOT NULL, -- SHA2_256 produce 32 bytes
    password_salt NVARCHAR(64) NOT NULL UNIQUE, -- Salt único por usuario
    fecha_creacion DATETIME DEFAULT GETDATE(),
    fecha_actualizacion DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (usuario_id) REFERENCES dbo.Usuarios(id) ON DELETE CASCADE
);

-- Índice para búsqueda rápida por correo
CREATE INDEX idx_usuarios_correo ON dbo.Usuarios(correo);
CREATE INDEX idx_saltstore_usuario ON security.SaltStore(usuario_id);

-- Ejemplo de inserción de usuario con contraseña
-- Salt generado: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
-- Contraseña: 'Password123'
-- Hash = HASHBYTES('SHA2_256', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6Password123')

INSERT INTO dbo.Usuarios (nombre, correo, TipoUsuario, NumeroNomina, rolNom)
VALUES ('Juan Pérez', 'juan.perez@empresa.com', 'Empleado', 'EMP001', 'Aprobador');

INSERT INTO security.SaltStore (usuario_id, password_hash, password_salt)
VALUES (
    1, 
    HASHBYTES('SHA2_256', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6Password123'),
    'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
);

-- Query de ejemplo para validación de login (usado en el backend)
-- SELECT u.*, s.password_hash, s.password_salt
-- FROM dbo.Usuarios u
-- INNER JOIN security.SaltStore s ON u.id = s.usuario_id
-- WHERE u.correo = @correo;
*/

-- Campos esperados en la tabla Usuarios:
-- - id: INT (Identificador único)
-- - nombre: NVARCHAR(255) (Nombre completo del usuario)
-- - correo: NVARCHAR(255) (Correo electrónico único)
-- - TipoUsuario: NVARCHAR(50) (Tipo de usuario: Empleado, Admin, etc.)
-- - NumeroNomina: NVARCHAR(50) (Número de nómina del empleado)
-- - rolNom: NVARCHAR(100) (Rol del usuario en el sistema)
-- - debe_cambiar_password: BIT (Indicador si debe cambiar contraseña)
-- - fecha_ultimo_cambio_password: DATETIME
-- - creadoEn: DATETIME (Fecha de creación)

-- Campos esperados en la tabla security.SaltStore:
-- - id: INT (Identificador único)
-- - usuario_id: INT (FK a Usuarios.id)
-- - password_hash: VARBINARY(32) (Hash SHA2_256 de salt + password)
-- - password_salt: NVARCHAR(64) (Salt único por usuario)
-- - fecha_creacion: DATETIME
-- - fecha_actualizacion: DATETIME
