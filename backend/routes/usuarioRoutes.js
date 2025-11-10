import express from 'express';
import { obtenerListaUsuarios } from '../controllers/usuarioController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/usuarios/lista - Obtener lista de usuarios
router.get('/lista', authenticateToken, obtenerListaUsuarios);

export default router;
