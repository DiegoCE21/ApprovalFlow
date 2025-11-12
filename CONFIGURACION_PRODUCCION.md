# Configuración para Producción - server.flujoaprobaciones.com

Esta guía muestra la configuración específica para desplegar en `server.flujoaprobaciones.com`.

## 📝 Archivo backend/.env

```env
# ============================================
# CONFIGURACIÓN DEL SERVIDOR
# ============================================
PORT=3301
FRONTEND_URL=http://server.flujoaprobaciones.com:3300
BACKEND_URL=http://server.flujoaprobaciones.com:3301
NODE_ENV=production

# ============================================
# BASE DE DATOS POSTGRESQL
# ============================================
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=flujo_aprobaciones
POSTGRES_USER=tu_usuario
POSTGRES_PASSWORD=tu_password

# ============================================
# BASE DE DATOS SQL SERVER
# ============================================
SQLSERVER_HOST=localhost
SQLSERVER_PORT=1433
SQLSERVER_DATABASE=TuBaseDeDatos
SQLSERVER_USER=tu_usuario
SQLSERVER_PASSWORD=tu_password

# ============================================
# SEGURIDAD
# ============================================
# Generar con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=tu_jwt_secret_muy_seguro_aqui

# ============================================
# CONFIGURACIÓN DE CORREO
# ============================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASSWORD=tu_password_app
SMTP_FROM=noreply@flujoaprobaciones.com
```

## 📝 Archivo frontend/.env

```env
# ============================================
# CONFIGURACIÓN DEL FRONTEND
# ============================================
VITE_API_URL=http://server.flujoaprobaciones.com:3301
VITE_FRONTEND_URL=http://server.flujoaprobaciones.com:3300
VITE_PORT=3300
VITE_NODE_ENV=production
```

## 🚀 Pasos de Despliegue

### 1. Configurar Backend

1. Edita `backend/.env` con los valores de arriba
2. Asegúrate de que `JWT_SECRET` esté configurado
3. Instala dependencias:
   ```bash
   cd backend
   npm install --production
   ```

4. Inicia con PM2:
   ```bash
   pm2 start server.js --name "flujo-aprobaciones-backend"
   pm2 startup
   pm2 save
   ```

### 2. Configurar Frontend

1. Edita `frontend/.env` con los valores de arriba
2. Construye el frontend:
   ```bash
   cd frontend
   npm install
   npm run build
   ```

3. Inicia con PM2:
   ```bash
   pm2 start server.js --name "flujo-aprobaciones-frontend"
   pm2 startup
   pm2 save
   ```

### 3. Verificar

1. Backend: `http://server.flujoaprobaciones.com:3301`
2. Frontend: `http://server.flujoaprobaciones.com:3300`

## 🔧 Configuración de Firewall

Asegúrate de que los puertos estén abiertos:
- Puerto 3300 (Frontend)
- Puerto 3301 (Backend)

## 📋 Checklist

- [ ] `backend/.env` configurado con `NODE_ENV=production`
- [ ] `FRONTEND_URL` y `BACKEND_URL` apuntan a `server.flujoaprobaciones.com`
- [ ] `frontend/.env` configurado con `VITE_API_URL` apuntando a `server.flujoaprobaciones.com:3301`
- [ ] `JWT_SECRET` configurado y seguro
- [ ] Backend iniciado con PM2
- [ ] Frontend construido (`npm run build`)
- [ ] Frontend iniciado con PM2
- [ ] Puertos 3300 y 3301 abiertos en el firewall
- [ ] DNS configurado para `server.flujoaprobaciones.com` (si aplica)

## 🔄 Actualización

Para actualizar la aplicación:

1. **Backend:**
   ```bash
   cd backend
   git pull  # o tu método de actualización
   npm install --production
   pm2 restart flujo-aprobaciones-backend
   ```

2. **Frontend:**
   ```bash
   cd frontend
   git pull  # o tu método de actualización
   npm install
   npm run build
   pm2 restart flujo-aprobaciones-frontend
   ```

## 🐛 Solución de Problemas

### No se puede acceder desde otros equipos

- Verifica que el firewall permita los puertos 3300 y 3301
- Verifica que el servidor esté escuchando en `0.0.0.0` (ya configurado)
- Verifica la configuración de red del servidor

### Error de CORS

- Verifica que `FRONTEND_URL` en `backend/.env` coincida exactamente con la URL del frontend
- Debe ser: `http://server.flujoaprobaciones.com:3300`

### El frontend no se conecta al backend

- Verifica que `VITE_API_URL` en `frontend/.env` sea correcto
- Debe ser: `http://server.flujoaprobaciones.com:3301`
- Reconstruye el frontend después de cambiar: `npm run build`

