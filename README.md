# Sistema de Gestión de Aprobaciones y Firmas Digitales

Sistema interno on-premise para la gestión de aprobaciones y firmas digitales de documentos PDF, funcionando completamente en red interna con HTTP.

## 🎯 Características Principales

- ✅ **Autenticación segura** con JWT y SHA2_256
- 📄 **Gestión completa de documentos PDF**
- ✍️ **Firmas digitales gratuitas** con react-signature-canvas
- 📧 **Notificaciones por correo** interno
- 🔄 **Flujo de aprobaciones** con múltiples responsables
- 📊 **Auditoría completa** de todas las acciones
- 🚫 **Gestión de rechazos** con notificación automática
- 🔐 **Completamente on-premise** sin servicios externos

## 🛠️ Stack Tecnológico

### Backend
- **Node.js** + Express
- **SQL Server** (autenticación de usuarios)
- **PostgreSQL** (documentos y flujo)
- **JWT** (autenticación y sesiones)
- **pdf-lib** (inserción de firmas en PDF)
- **nodemailer** (envío de correos)
- **multer** (subida de archivos)

### Frontend
- **React 18** con Vite
- **Material UI** (interfaz de usuario)
- **React Router** (navegación)
- **Axios** (comunicación con API)
- **react-signature-canvas** (captura de firmas)
- **react-pdf** (visualización de PDFs)
- **react-toastify** (notificaciones)

## 📋 Requisitos Previos

- Node.js >= 18.x
- PostgreSQL >= 14.x
- SQL Server >= 2017
- npm o yarn

## 🚀 Instalación

### 1. Clonar el repositorio
```bash
cd C:\Proyectos\FlujoAprobaciones
```

### 2. Configurar Base de Datos PostgreSQL

Ejecutar el script de creación de esquema:

```bash
psql -U postgres -d flujo_aprobaciones -f backend/database/postgres_schema.sql
```

O crear manualmente:
```sql
CREATE DATABASE flujo_aprobaciones;
```

Luego ejecutar el contenido de `backend/database/postgres_schema.sql`

### 3. Configurar Base de Datos SQL Server

Ejecutar el script `backend/database/sqlserver_schema.sql` en SQL Server Management Studio o ejecutar:

```sql
sqlcmd -S localhost -d TuBaseDeDatos -i backend/database/sqlserver_schema.sql
```

**Nota:** Asegúrate de que existan las tablas `dbo.Usuarios` y `security.SaltStore` con la estructura indicada.

### 4. Configurar Backend

```bash
cd backend
npm install
```

Copiar el archivo de configuración:
```bash
copy .env.example .env
```

Editar `.env` con tus credenciales:
```env
PORT=3301
JWT_SECRET=9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c

SQLSERVER_HOST=localhost
SQLSERVER_PORT=1433
SQLSERVER_DATABASE=TuBaseDeDatos
SQLSERVER_USER=sa
SQLSERVER_PASSWORD=TuPassword

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=flujo_aprobaciones
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

EMAIL_HOST=smtp.tuempresa.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=notificaciones@tuempresa.com
EMAIL_PASSWORD=password_correo
EMAIL_FROM=Sistema de Aprobaciones <notificaciones@tuempresa.com>

FRONTEND_URL=http://localhost:3300
EMAIL_CALIDAD=calidad@tuempresa.com
```

### 5. Configurar Frontend

```bash
cd ../frontend
npm install
```

### 6. Iniciar el Sistema

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

El sistema estará disponible en:
- Frontend: http://localhost:3300
- Backend API: http://localhost:3301

## 📖 Documentación del Flujo

### 1. Autenticación

El usuario ingresa con correo y contraseña:

1. El backend valida contra SQL Server:
   - Obtiene `password_hash` y `password_salt` de `security.SaltStore`
   - Concatena: `salt + contraseña`
   - Aplica `SHA2_256`
   - Compara con el hash almacenado

2. Si es exitoso:
   - Genera JWT con datos del usuario
   - Configura cookies de sesión:
     - `userToken`: accesible desde JavaScript
     - `user`: httpOnly para seguridad

### 2. Subida de Documento

1. Usuario sube un PDF desde el dashboard
2. Selecciona aprobadores de la lista de usuarios
3. El backend:
   - Almacena el PDF en `backend/uploads/`
   - Registra el documento en PostgreSQL
   - Crea registros de aprobadores
   - Genera tokens únicos de firma para cada aprobador
   - Envía correos con enlaces de aprobación
   - Registra todo en auditoría

### 3. Aprobación y Firma

1. Aprobador recibe correo con enlace único
2. Hace clic en el enlace: `/aprobar/{token}`
3. Visualiza el PDF completo
4. Opciones:
   - **Aprobar:** Dibuja su firma digital → se inserta en el PDF
   - **Rechazar:** Indica motivo → notifica automáticamente a Calidad

### 4. Firma Digital

1. El aprobador dibuja su firma en canvas
2. Se captura como imagen PNG en base64
3. El backend:
   - Inserta la firma en el PDF usando `pdf-lib`
   - Agrega texto con nombre y fecha
   - Actualiza el estado del aprobador
   - Guarda la firma en la base de datos

### 5. Completar Aprobación

Cuando todos los aprobadores firman:

1. El sistema actualiza el estado del documento a "aprobado"
2. Genera PDF final con:
   - Todas las firmas insertadas
   - Página de auditoría con registro completo
3. Notifica al creador del documento
4. Documento disponible para descarga

### 6. Manejo de Rechazos

Si un aprobador rechaza:

1. Actualiza estado a "rechazado"
2. Registra el motivo
3. Envía correo automático a Calidad con:
   - Documento rechazado
   - Nombre del responsable
   - Motivo del rechazo
   - Enlace para revisar

### 7. Nueva Versión

Cuando se sube una nueva versión:

1. Se asocia con el documento padre
2. Se incrementa el número de versión
3. Solo se notifica a aprobadores que NO aprobaron la versión anterior
4. Mantiene historial completo

## 🔐 Seguridad

- **JWT** con expiración de 8 horas
- **Contraseñas** hasheadas con SHA2_256 y salt único
- **Cookies httpOnly** para prevenir XSS
- **Tokens únicos** para cada enlace de aprobación
- **Validación** en backend de permisos de usuario
- **Auditoría completa** de todas las acciones

## 📊 Estructura de la Base de Datos

### PostgreSQL - Tablas Principales

**documentos**
- Almacena información de PDFs subidos
- Versión, estado, ruta del archivo
- Referencia al creador

**aprobadores**
- Lista de responsables por documento
- Estado de aprobación individual
- Token único de firma

**firmas**
- Imágenes de firmas en base64
- Metadata de posición y tamaño
- Timestamp y IP

**log_auditoria**
- Registro completo de acciones
- Usuario, acción, fecha
- Metadata en formato JSON

### SQL Server - Autenticación

**dbo.Usuarios**
- Información de usuarios
- Nombre, correo, rol, tipo

**security.SaltStore**
- Hashes de contraseñas
- Salt único por usuario

## 🎨 Interfaz de Usuario

### Login
- Formulario simple de correo/contraseña
- Validación en tiempo real
- Mensajes de error claros

### Dashboard
- Dos pestañas:
  - **Mis Documentos:** PDFs subidos por el usuario
  - **Pendientes:** Documentos a aprobar
- Cards con información resumida
- Estados visuales con colores

### Visualizador de Firma
- Previsualización completa del PDF
- Navegación por páginas
- Canvas para dibujar firma
- Botones de aprobar/rechazar

## 📧 Correos Electrónicos

El sistema envía correos HTML responsivos para:

1. **Solicitud de aprobación**
   - Enlace único de firma
   - Información del documento
   - Nombre del solicitante

2. **Nueva versión**
   - Solo a aprobadores pendientes
   - Número de versión actualizado

3. **Rechazo** (a Calidad)
   - Documento rechazado
   - Responsable del rechazo
   - Motivo detallado

4. **Aprobación completa** (al creador)
   - Confirmación de aprobación total
   - Enlace de descarga del PDF firmado

## 🔧 Scripts Disponibles

### Backend
```bash
npm start          # Iniciar servidor en producción
npm run dev        # Iniciar con nodemon (desarrollo)
```

### Frontend
```bash
npm run dev        # Servidor de desarrollo con Vite
npm run build      # Compilar para producción
npm run preview    # Previsualizar build de producción
```

## 📝 API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/logout` - Cerrar sesión
- `GET /api/auth/verificar` - Verificar sesión actual

### Documentos
- `POST /api/documentos/subir` - Subir nuevo PDF
- `GET /api/documentos/mis-documentos` - Mis documentos
- `GET /api/documentos/pendientes` - Pendientes de aprobar
- `GET /api/documentos/token/:token` - Obtener por token
- `GET /api/documentos/descargar/:id` - Descargar PDF

### Firmas
- `POST /api/firmas/firmar` - Firmar documento
- `POST /api/firmas/rechazar` - Rechazar documento
- `GET /api/firmas/:documentoId` - Obtener firmas

## 🐛 Solución de Problemas

### Error de conexión a SQL Server
```
Verifica que SQL Server esté corriendo
Confirma las credenciales en .env
Asegúrate de que el puerto 1433 esté abierto
```

### Error de conexión a PostgreSQL
```
Verifica que PostgreSQL esté corriendo
Confirma que la base de datos exista
Revisa usuario y contraseña en .env
```

### PDFs no se visualizan
```
Verifica que pdf.js worker esté cargando correctamente
Revisa la consola del navegador
Asegúrate de que el PDF sea válido
```

### Firmas no se insertan
```
Verifica permisos de escritura en /backend/uploads
Confirma que pdf-lib esté instalado correctamente
Revisa los logs del backend
```

## 📄 Licencia

Este proyecto es de uso interno. Todos los derechos reservados.

## 👥 Soporte

Para soporte técnico, contactar al equipo de IT o al departamento de Calidad.

---

**Sistema de Aprobaciones y Firmas Digitales v1.0.0**  
Desarrollado con ❤️ para operación on-premise
# ApprovalFlow
