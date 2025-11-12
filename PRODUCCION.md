# Guía de Despliegue en Producción

Esta guía explica cómo configurar y ejecutar la aplicación en modo producción.

## 📋 Requisitos Previos

- Node.js instalado
- PostgreSQL configurado y corriendo
- SQL Server configurado y corriendo
- Servidor web (nginx, Apache, IIS) para servir el frontend (opcional)
- PM2 instalado globalmente (recomendado para mantener el backend corriendo)

## 🔧 Configuración del Backend

### 1. Configurar Variables de Entorno

Edita el archivo `backend/.env` y configura las siguientes variables:

```env
# Modo de ejecución
NODE_ENV=production

# URLs de producción
FRONTEND_URL=https://tu-dominio.com
BACKEND_URL=https://api.tu-dominio.com

# Puerto del servidor
PORT=3301

# Configuración de bases de datos (ajusta según tu entorno)
POSTGRES_HOST=tu-servidor-postgres
POSTGRES_PORT=5432
POSTGRES_DATABASE=flujo_aprobaciones
POSTGRES_USER=tu_usuario
POSTGRES_PASSWORD=tu_password_seguro

SQLSERVER_HOST=tu-servidor-sql
SQLSERVER_PORT=1433
SQLSERVER_DATABASE=TuBaseDeDatos
SQLSERVER_USER=tu_usuario
SQLSERVER_PASSWORD=tu_password_seguro

# JWT Secret (debe ser una clave segura y única)
JWT_SECRET=tu_jwt_secret_muy_seguro_aqui

# Configuración de correo
SMTP_HOST=smtp.tu-servidor.com
SMTP_PORT=587
SMTP_USER=tu_correo@dominio.com
SMTP_PASSWORD=tu_password
SMTP_FROM=noreply@tu-dominio.com
```

### 2. Instalar Dependencias

```bash
cd backend
npm install --production
```

### 3. Iniciar el Backend

#### Opción A: Inicio Directo (para pruebas)

```bash
npm start
```

#### Opción B: Con PM2 (Recomendado para producción)

Instalar PM2 globalmente:
```bash
npm install -g pm2
```

Iniciar con PM2:
```bash
pm2 start server.js --name "flujo-aprobaciones-backend"
```

Comandos útiles de PM2:
```bash
# Ver estado
pm2 status

# Ver logs
pm2 logs flujo-aprobaciones-backend

# Reiniciar
pm2 restart flujo-aprobaciones-backend

# Detener
pm2 stop flujo-aprobaciones-backend

# Configurar para iniciar automáticamente al reiniciar el servidor
pm2 startup
pm2 save
```

## 🎨 Configuración del Frontend

### 1. Configurar Variables de Entorno

Edita el archivo `frontend/.env` y configura:

```env
# URL del backend API de producción
VITE_API_URL=https://api.tu-dominio.com

# URL del frontend (opcional, para referencias internas)
VITE_FRONTEND_URL=https://tu-dominio.com

# Modo de ejecución
VITE_NODE_ENV=production
```

**⚠️ IMPORTANTE**: Las variables de entorno en Vite se inyectan en tiempo de compilación. Si cambias las variables después de construir, debes reconstruir.

### 2. Construir para Producción

```bash
cd frontend
npm install
npm run build
```

Esto generará los archivos estáticos en el directorio `frontend/dist/`.

### 3. Instalar Dependencias de Producción

```bash
cd frontend
npm install --production
```

**Nota**: Asegúrate de que `express` y `dotenv` estén instalados, ya que el servidor los necesita.

### 4. Iniciar el Frontend

#### Opción A: Inicio Directo (para pruebas)

```bash
npm start
```

#### Opción B: Con PM2 (Recomendado para producción)

Iniciar con PM2:
```bash
pm2 start server.js --name "flujo-aprobaciones-frontend"
```

Comandos útiles de PM2:
```bash
# Ver estado
pm2 status

# Ver logs
pm2 logs flujo-aprobaciones-frontend

# Reiniciar
pm2 restart flujo-aprobaciones-frontend

# Detener
pm2 stop flujo-aprobaciones-frontend

# Configurar para iniciar automáticamente al reiniciar el servidor
pm2 startup
pm2 save
```

#### Opción C: Servidor Web con Proxy (nginx, Apache, IIS)

Si prefieres usar un servidor web tradicional, puedes configurar nginx o Apache para servir el frontend y hacer proxy al backend.

**Ejemplo de configuración nginx:**

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    # Servir archivos estáticos del frontend
    root /ruta/a/frontend/dist;
    index index.html;

    # Configuración para SPA (Single Page Application)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy para API
    location /api {
        proxy_pass http://localhost:3301;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 🔒 Consideraciones de Seguridad

1. **HTTPS**: Usa HTTPS en producción. Configura certificados SSL/TLS.
2. **Variables de Entorno**: Nunca subas archivos `.env` al repositorio.
3. **JWT Secret**: Usa un JWT_SECRET fuerte y único. Genera uno con:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
4. **Firewall**: Configura el firewall para permitir solo los puertos necesarios.
5. **Base de Datos**: Usa credenciales seguras y limita el acceso a las bases de datos.

## 📊 Monitoreo

### Verificar que el Backend está Corriendo

```bash
curl https://api.tu-dominio.com/
```

Deberías recibir una respuesta JSON con el estado del servidor.

### Ver Logs

Con PM2:
```bash
pm2 logs flujo-aprobaciones-backend
```

Sin PM2:
```bash
# Los logs aparecerán en la consola donde ejecutaste npm start
```

## 🔄 Actualización en Producción

### Backend

1. Detén el servidor:
   ```bash
   pm2 stop flujo-aprobaciones-backend
   # o si no usas PM2, presiona Ctrl+C
   ```

2. Actualiza el código:
   ```bash
   git pull  # o tu método de actualización
   ```

3. Instala nuevas dependencias (si hay):
   ```bash
   npm install --production
   ```

4. Reinicia el servidor:
   ```bash
   pm2 restart flujo-aprobaciones-backend
   # o npm start
   ```

### Frontend

1. Actualiza las variables de entorno si es necesario
2. Reconstruye:
   ```bash
   npm run build
   ```
3. Reinicia el servidor:
   ```bash
   pm2 restart flujo-aprobaciones-frontend
   # o si no usas PM2, presiona Ctrl+C y ejecuta npm start
   ```

## 🐛 Solución de Problemas

### El backend no inicia

- Verifica que todas las variables de entorno estén configuradas
- Verifica que las bases de datos estén accesibles
- Revisa los logs de error

### El frontend no se conecta al backend

- Verifica que `VITE_API_URL` esté configurado correctamente
- Verifica que el backend esté corriendo y accesible
- Revisa la configuración de CORS en el backend
- Verifica que el proxy del servidor web esté configurado correctamente

### Errores de CORS

- Asegúrate de que `FRONTEND_URL` en el backend coincida con la URL real del frontend
- Verifica que el servidor web esté configurado correctamente

## 📝 Checklist de Despliegue

- [ ] Variables de entorno configuradas en `backend/.env`
- [ ] Variables de entorno configuradas en `frontend/.env`
- [ ] `NODE_ENV=production` en backend
- [ ] `VITE_NODE_ENV=production` en frontend
- [ ] Dependencias instaladas en backend (`npm install --production`)
- [ ] Dependencias instaladas en frontend (`npm install --production`)
- [ ] Backend iniciado (con PM2 recomendado: `pm2 start server.js --name "flujo-aprobaciones-backend"`)
- [ ] Frontend construido (`npm run build`)
- [ ] Frontend iniciado (con PM2 recomendado: `pm2 start server.js --name "flujo-aprobaciones-frontend"`)
- [ ] PM2 configurado para iniciar automáticamente (`pm2 startup` y `pm2 save`)
- [ ] HTTPS configurado (si es necesario)
- [ ] Firewall configurado
- [ ] Monitoreo configurado
- [ ] Backups de bases de datos configurados

