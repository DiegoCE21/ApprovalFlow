# Variables de Entorno - Frontend

Crea un archivo `.env` en la raíz del directorio `frontend/` con las siguientes variables:

```env
# ============================================
# CONFIGURACIÓN DEL FRONTEND
# ============================================
# URL del backend API
# IMPORTANTE: Debe incluir el protocolo (http:// o https://)
# Desarrollo: http://localhost:3301
# Producción: http://server.flujoaprobaciones.com:3301
# Si no incluyes el protocolo, se agregará automáticamente http://
VITE_API_URL=http://localhost:3301

# URL del frontend (para referencias internas)
# Desarrollo: http://localhost:3300
# Producción: http://server.flujoaprobaciones.com:3300
VITE_FRONTEND_URL=http://localhost:3300

# Puerto del servidor de desarrollo (opcional)
VITE_PORT=3300

# Modo de ejecución: development | production
VITE_NODE_ENV=development
```

## Instrucciones

1. Copia este contenido a un archivo llamado `.env` en el directorio `frontend/`
2. Reemplaza los valores de ejemplo con tus valores reales
3. **NUNCA** subas el archivo `.env` al repositorio (debe estar en `.gitignore`)
4. **IMPORTANTE**: En Vite, todas las variables de entorno deben comenzar con `VITE_` para ser accesibles en el código del frontend

## Modo Producción

Para construir para producción:

1. Configura `VITE_API_URL` con la URL de tu API de producción
2. Ejecuta `npm run build` para generar los archivos estáticos
3. Los archivos se generarán en el directorio `dist/`
4. Sirve los archivos con un servidor web (nginx, Apache, etc.)

## Nota sobre Variables de Entorno en Vite

- Las variables de entorno se inyectan en tiempo de compilación
- Solo las variables que comienzan con `VITE_` están disponibles en el código del frontend
- Después de cambiar variables de entorno, reinicia el servidor de desarrollo

