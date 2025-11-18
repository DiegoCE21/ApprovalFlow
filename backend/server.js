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

// Normalizar FRONTEND_URL para asegurar que tenga protocolo
let FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3300';
if (!FRONTEND_URL.startsWith('http://') && !FRONTEND_URL.startsWith('https://')) {
  FRONTEND_URL = `http://${FRONTEND_URL}`;
}

// Normalizar BACKEND_URL para asegurar que tenga protocolo
let BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;
if (!BACKEND_URL.startsWith('http://') && !BACKEND_URL.startsWith('https://')) {
  BACKEND_URL = `http://${BACKEND_URL}`;
}

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

    // Extraer hostname sin protocolo
    const getHostname = (url) => {
      if (!url) return '';
      try {
        // Si no tiene protocolo, agregarlo temporalmente para parsear
        const urlWithProtocol = url.startsWith('http://') || url.startsWith('https://') 
          ? url 
          : `http://${url}`;
        const urlObj = new URL(urlWithProtocol);
        return urlObj.hostname;
      } catch {
        // Fallback: remover protocolo y tomar la primera parte antes de ':'
        return url.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
      }
    };

    const frontendBase = getBaseUrl(FRONTEND_URL);
    const originBase = getBaseUrl(origin);
    const frontendHostname = getHostname(FRONTEND_URL);
    const originHostname = getHostname(origin);

    // Log para debugging (solo en desarrollo o si hay error)
    if (NODE_ENV === 'development') {
      console.log(`[CORS] Origen recibido: ${origin}`);
      console.log(`[CORS] Frontend configurado: ${FRONTEND_URL}`);
      console.log(`[CORS] Comparando: ${originBase} === ${frontendBase}`);
    }

    // Permitir si el origen coincide exactamente con el frontend
    if (origin === FRONTEND_URL) {
      if (NODE_ENV === 'development') {
        console.log(`[CORS] ✓ Permitido: coincidencia exacta`);
      }
      return callback(null, true);
    }

    // Permitir si el dominio base coincide (ignorando puerto)
    if (originBase === frontendBase) {
      if (NODE_ENV === 'development') {
        console.log(`[CORS] ✓ Permitido: dominio base coincide`);
      }
      return callback(null, true);
    }

    // Permitir si el hostname coincide (ignorando protocolo y puerto)
    if (frontendHostname && originHostname && frontendHostname === originHostname) {
      if (NODE_ENV === 'development') {
        console.log(`[CORS] ✓ Permitido: hostname coincide`);
      }
      return callback(null, true);
    }

    // En desarrollo, permitir localhost con cualquier puerto
    if (NODE_ENV === 'development' && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      if (NODE_ENV === 'development') {
        console.log(`[CORS] ✓ Permitido: localhost en desarrollo`);
      }
      return callback(null, true);
    }

    // En producción, también permitir localhost si el frontend es localhost (para pruebas)
    if (frontendHostname === 'localhost' && originHostname === 'localhost') {
      if (NODE_ENV === 'development') {
        console.log(`[CORS] ✓ Permitido: ambos son localhost`);
      }
      return callback(null, true);
    }

    // Permitir variaciones de protocolo (http vs https) si el hostname coincide
    if (frontendHostname && originHostname && frontendHostname === originHostname) {
      // Ya verificado arriba, pero por si acaso
      return callback(null, true);
    }

    // Permitir si el origen contiene el hostname del frontend (para casos como subdominios)
    if (frontendHostname && origin.includes(frontendHostname)) {
      if (NODE_ENV === 'development') {
        console.log(`[CORS] ✓ Permitido: origen contiene hostname del frontend`);
      }
      return callback(null, true);
    }

    // Log del error para debugging
    console.error(`[CORS] ❌ Origen rechazado: ${origin}`);
    console.error(`[CORS] Frontend esperado: ${FRONTEND_URL} (hostname: ${frontendHostname})`);
    console.error(`[CORS] Origen recibido: ${origin} (hostname: ${originHostname})`);
    console.error(`[CORS] Verifica que FRONTEND_URL en .env coincida con la URL desde donde accedes al frontend`);

    callback(new Error(`No permitido por CORS. Origen: ${origin}, Esperado: ${FRONTEND_URL}`));
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
