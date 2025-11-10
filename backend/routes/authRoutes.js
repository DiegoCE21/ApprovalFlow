import express from 'express';
import { login, logout, verificarSesion } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login - Login de usuario
router.post('/login', login);

// POST /api/auth/logout - Logout de usuario
router.post('/logout', authenticateToken, logout);

// GET /api/auth/verificar - Verificar sesión actual
router.get('/verificar', authenticateToken, verificarSesion);

export default router;
