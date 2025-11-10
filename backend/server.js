import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import firmaRoutes from './routes/firmaRoutes.js';
import usuarioRoutes from './routes/usuarioRoutes.js';
import permisosRoutes from './routes/permisosRoutes.js';
import { iniciarJobRecordatorios } from './jobs/recordatorios.js';
import { iniciarJobVencimientos } from './jobs/vencimientos.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3301;

// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3300',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/documentos', documentRoutes);
app.use('/api/firmas', firmaRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/permisos', permisosRoutes);

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
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
╬═══════════════════════════════════════════════════════╗
║   Sistema de Aprobaciones y Firmas Digitales         ║
║   Servidor corriendo en puerto ${PORT}                   ║
║   URL: http://localhost:${PORT}                       ║
╚═══════════════════════════════════════════════════════╝
  `);
  
  // Iniciar jobs programados
  iniciarJobRecordatorios();
  iniciarJobVencimientos();
});

export default app;
