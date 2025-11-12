import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.VITE_PORT || process.env.PORT || 3300;
const NODE_ENV = process.env.NODE_ENV || process.env.VITE_NODE_ENV || 'production';
const distPath = path.join(__dirname, 'dist');

// Verificar que el directorio dist existe
if (!existsSync(distPath)) {
  console.error('❌ Error: El directorio "dist" no existe.');
  console.error('   Por favor, ejecuta "npm run build" primero para construir el frontend.');
  process.exit(1);
}

// Servir archivos estáticos desde el directorio dist
app.use(express.static(distPath));

// Para SPA (Single Page Application), todas las rutas deben servir index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const modo = NODE_ENV.toUpperCase();
  const portStr = PORT.toString();
  const frontendUrl = process.env.VITE_FRONTEND_URL || `http://0.0.0.0:${PORT}`;
  const urlDisplay = frontendUrl.length > 47 ? frontendUrl.substring(0, 44) + '...' : frontendUrl;
  
  console.log(`
╬═══════════════════════════════════════════════════════╗
║   Frontend - Sistema de Aprobaciones                 ║
║   Modo: ${modo.padEnd(47)}║
║   Puerto: ${portStr.padEnd(45)}║
║   URL: ${urlDisplay.padEnd(47)}║
╚═══════════════════════════════════════════════════════╝
  `);
});

