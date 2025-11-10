# 🚀 Guía Rápida de Instalación

## Paso 1: Configurar PostgreSQL

```bash
# Crear base de datos
psql -U postgres
CREATE DATABASE flujo_aprobaciones;
\q

# Ejecutar schema
psql -U postgres -d flujo_aprobaciones -f backend/database/postgres_schema.sql
```

## Paso 2: Configurar SQL Server

Ejecutar en SQL Server Management Studio o mediante `sqlcmd`:

```sql
-- El archivo backend/database/sqlserver_schema.sql contiene:
-- 1. Tabla dbo.Usuarios
-- 2. Esquema security.SaltStore
-- 3. Ejemplo de inserción de usuario de prueba

-- Ejecutar el script completo desde SSMS
```

**Usuario de prueba creado:**
- Correo: `juan.perez@empresa.com`
- Contraseña: `Password123`

## Paso 3: Instalar Dependencias Backend

```bash
cd C:\Proyectos\FlujoAprobaciones\backend
npm install
```

## Paso 4: Configurar Variables de Entorno

```bash
# En Windows PowerShell
copy .env.example .env

# Editar .env con tus credenciales
notepad .env
```

**Configuraciones mínimas requeridas:**
```env
# Bases de datos
SQLSERVER_HOST=tu_servidor_sql
SQLSERVER_DATABASE=tu_base_datos
SQLSERVER_USER=tu_usuario
SQLSERVER_PASSWORD=tu_password

POSTGRES_HOST=localhost
POSTGRES_DATABASE=flujo_aprobaciones
POSTGRES_USER=postgres
POSTGRES_PASSWORD=tu_password_postgres

# Correo (si no tienes servidor SMTP, configura uno de prueba)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu_correo@gmail.com
EMAIL_PASSWORD=tu_app_password
```

## Paso 5: Instalar Dependencias Frontend

```bash
cd C:\Proyectos\FlujoAprobaciones\frontend
npm install
```

## Paso 6: Iniciar el Sistema

### Terminal 1 - Backend
```bash
cd C:\Proyectos\FlujoAprobaciones\backend
npm start
```

Deberías ver:
```
╬═══════════════════════════════════════════════════════╗
║   Sistema de Aprobaciones y Firmas Digitales         ║
║   Servidor corriendo en puerto 3301                   ║
║   URL: http://localhost:3301                          ║
╚═══════════════════════════════════════════════════════╝
✓ Conectado a SQL Server
✓ Conectado a PostgreSQL
```

### Terminal 2 - Frontend
```bash
cd C:\Proyectos\FlujoAprobaciones\frontend
npm run dev
```

Deberías ver:
```
  VITE v5.0.8  ready in 500 ms

  ➜  Local:   http://localhost:3300/
  ➜  Network: use --host to expose
```

## Paso 7: Acceder al Sistema

1. Abrir navegador en: **http://localhost:3300**
2. Iniciar sesión con credenciales de prueba:
   - Correo: `juan.perez@empresa.com`
   - Contraseña: `Password123`

## ✅ Verificación de Instalación

### Backend
```bash
# Verificar que el servidor responde
curl http://localhost:3301/

# Deberías recibir:
# {"message":"API de Sistema de Aprobaciones y Firmas Digitales","version":"1.0.0","status":"running"}
```

### Base de Datos PostgreSQL
```bash
# Verificar tablas creadas
psql -U postgres -d flujo_aprobaciones -c "\dt"

# Deberías ver:
# documentos, aprobadores, firmas, log_auditoria
```

### Base de Datos SQL Server
```sql
-- Verificar tablas de usuarios
SELECT * FROM dbo.Usuarios;
SELECT * FROM security.SaltStore;
```

## 🔧 Solución de Problemas Comunes

### Error: "Cannot connect to PostgreSQL"
```bash
# Verificar que PostgreSQL esté corriendo
# Windows:
services.msc
# Buscar "PostgreSQL" y verificar que esté "Running"

# Verificar puerto
netstat -an | findstr :5432
```

### Error: "Cannot connect to SQL Server"
```bash
# Verificar SQL Server
services.msc
# Buscar "SQL Server" y verificar que esté "Running"

# Verificar puerto
netstat -an | findstr :1433
```

### Error: "Module not found"
```bash
# Reinstalar dependencias
cd backend
rm -rf node_modules package-lock.json
npm install

cd ../frontend
rm -rf node_modules package-lock.json
npm install
```

### Error: "CORS error"
Verificar que en `backend/.env` esté configurado:
```env
FRONTEND_URL=http://localhost:3300
```

Y en `backend/server.js` el origen de CORS coincida.

## 📦 Estructura de Directorios Esperada

```
C:\Proyectos\FlujoAprobaciones\
├── backend\
│   ├── config\
│   ├── controllers\
│   ├── database\
│   ├── middleware\
│   ├── routes\
│   ├── uploads\          (se crea automáticamente)
│   ├── utils\
│   ├── .env
│   ├── package.json
│   └── server.js
│
├── frontend\
│   ├── src\
│   │   ├── config\
│   │   └── pages\
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── README.md
└── INSTALACION.md
```

## 🎯 Próximos Pasos

1. **Crear usuarios adicionales en SQL Server**
2. **Configurar servidor SMTP interno**
3. **Subir un PDF de prueba**
4. **Asignar aprobadores**
5. **Probar flujo completo de firma**

## 📞 Ayuda

Si encuentras problemas, revisa:
1. Los logs del backend en la consola
2. La consola del navegador (F12)
3. El archivo `README.md` para documentación completa
