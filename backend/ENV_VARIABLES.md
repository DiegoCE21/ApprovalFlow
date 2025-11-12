# Variables de Entorno - Backend

Crea un archivo `.env` en la raíz del directorio `backend/` con las siguientes variables:

```env
# ============================================
# CONFIGURACIÓN DEL SERVIDOR
# ============================================
# Puerto en el que correrá el servidor backend
PORT=3301

# URL del frontend (para CORS y redirecciones)
# Desarrollo: http://localhost:3300
# Producción: https://tu-dominio.com
FRONTEND_URL=http://localhost:3300

# URL del backend (para referencias internas)
# Desarrollo: http://localhost:3301
# Producción: https://api.tu-dominio.com
BACKEND_URL=http://localhost:3301

# Modo de ejecución: development | production
NODE_ENV=development

# ============================================
# BASE DE DATOS POSTGRESQL
# ============================================
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=flujo_aprobaciones
POSTGRES_USER=postgres
POSTGRES_PASSWORD=tu_password

# ============================================
# BASE DE DATOS SQL SERVER
# ============================================
SQLSERVER_HOST=localhost
SQLSERVER_PORT=1433
SQLSERVER_DATABASE=TuBaseDeDatos
SQLSERVER_USER=sa
SQLSERVER_PASSWORD=tu_password

# ============================================
# SEGURIDAD
# ============================================
# Secret key para JWT (generar una clave segura)
# Puedes generar una con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=tu_jwt_secret_muy_seguro_aqui

# ============================================
# CONFIGURACIÓN DE CORREO
# ============================================
# Configuración del servidor SMTP para envío de correos
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASSWORD=tu_password_app
SMTP_FROM=noreply@tu-dominio.com

# ============================================
# CONFIGURACIÓN DE ARCHIVOS
# ============================================
# Ruta donde se almacenarán los documentos subidos
UPLOADS_DIR=./uploads
```

## Instrucciones

1. Copia este contenido a un archivo llamado `.env` en el directorio `backend/`
2. Reemplaza los valores de ejemplo con tus valores reales
3. **NUNCA** subas el archivo `.env` al repositorio (debe estar en `.gitignore`)

## Generar JWT_SECRET

Para generar un JWT_SECRET seguro, ejecuta:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Modo Producción

Para ejecutar en modo producción:

1. Establece `NODE_ENV=production`
2. Configura `FRONTEND_URL` y `BACKEND_URL` con tus URLs de producción
3. Asegúrate de tener configuradas todas las variables de entorno correctamente
4. Usa un servidor de procesos como PM2 para mantener el servidor corriendo

