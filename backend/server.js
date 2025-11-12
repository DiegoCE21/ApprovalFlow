import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import firmaRoutes from './routes/firmaRoutes.js';
import usuarioRoutes from './routes/usuarioRoutes.js';
import permisosRoutes from './routes/permisosRoutes.js';
import grupoRoutes from './routes/grupoRoutes.js';
import { iniciarJobRecordatorios } from './jobs/recordatorios.js';
import { iniciarJobVencimientos } from './jobs/vencimientos.js';
import { ensureSchemaUpdates } from './utils/schemaUpdates.js';

dotenv.config();

// Validar variables de entorno críticas
if (!process.env.JWT_SECRET) {
  console.error('❌ Error: JWT_SECRET no está configurado en el archivo .env');
  console.error('   Por favor, agrega JWT_SECRET a tu archivo backend/.env');
  console.error('   Puedes generar uno con: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3301;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3300';
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Función para validar origen CORS
const corsOptions = {
  origin: (origin, callback) => {
    // Permitir requests sin origen (Postman, mobile apps, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Extraer el dominio base (sin puerto)
    const getBaseUrl = (url) => {
      try {
        const urlObj = new URL(url);
        return `${urlObj.protocol}//${urlObj.hostname}`;
      } catch {
        return url;
      }
    };

    const frontendBase = getBaseUrl(FRONTEND_URL);
    const originBase = getBaseUrl(origin);

    // Permitir si el origen coincide con el frontend (con o sin puerto)
    if (origin === FRONTEND_URL || originBase === frontendBase) {
      return callback(null, true);
    }

    // En desarrollo, permitir localhost con cualquier puerto
    if (NODE_ENV === 'development' && origin.includes('localhost')) {
      return callback(null, true);
    }

    callback(new Error('No permitido por CORS'));
  },
  credentials: true
};

// Middlewares
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/documentos', documentRoutes);
app.use('/api/firmas', firmaRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/permisos', permisosRoutes);
app.use('/api/grupos', grupoRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    message: 'API de Sistema de Aprobaciones y Firmas Digitales',
    version: '1.0.0',
    status: 'running'
  });
});

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
    error: NODE_ENV === 'development' ? err.message : undefined
  });
});

async function startServer() {
  try {
    await ensureSchemaUpdates();

    app.listen(PORT, '0.0.0.0', () => {
      const modo = NODE_ENV.toUpperCase();
      const backendUrl = BACKEND_URL.length > 43 ? BACKEND_URL.substring(0, 40) + '...' : BACKEND_URL;
      const frontendUrl = FRONTEND_URL.length > 43 ? FRONTEND_URL.substring(0, 40) + '...' : FRONTEND_URL;
      
      console.log(`
╬═══════════════════════════════════════════════════════╗
║   Sistema de Aprobaciones y Firmas Digitales         ║
║   Modo: ${modo.padEnd(47)}║
║   Puerto: ${PORT.toString().padEnd(45)}║
║   URL: ${backendUrl.padEnd(47)}║
║   Frontend: ${frontendUrl.padEnd(44)}║
╚═══════════════════════════════════════════════════════╝
      `);

      iniciarJobRecordatorios();
      iniciarJobVencimientos();
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error);
    process.exit(1);
  }
}

startServer();

export default app;
