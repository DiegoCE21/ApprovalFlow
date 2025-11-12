import express from 'express';
import { obtenerListaUsuarios, obtenerListaPersonal } from '../controllers/usuarioController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/usuarios/lista - Obtener lista de usuarios
router.get('/lista', authenticateToken, obtenerListaUsuarios);

// GET /api/usuarios/personal - Obtener lista de personal para grupos
router.get('/personal', authenticateToken, obtenerListaPersonal);

export default router;
