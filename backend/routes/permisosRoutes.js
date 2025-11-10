import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { verificarEsAdminPermisos } from '../middleware/verificarPermisoSubida.js';
import {
  obtenerUsuariosConPermisos,
  actualizarPermisoSubida,
  actualizarPermisosMultiples
} from '../controllers/permisosController.js';

const router = express.Router();

/**
 * @route   GET /api/permisos/usuarios
 * @desc    Obtener todos los usuarios con sus permisos
 * @access  Solo Diego Castillo
 */
router.get('/usuarios', authenticateToken, verificarEsAdminPermisos, obtenerUsuariosConPermisos);

/**
 * @route   PUT /api/permisos/usuarios/:usuarioId
 * @desc    Actualizar permiso de un usuario
 * @access  Solo Diego Castillo
 */
router.put('/usuarios/:usuarioId', authenticateToken, verificarEsAdminPermisos, actualizarPermisoSubida);

/**
 * @route   PUT /api/permisos/usuarios/batch
 * @desc    Actualizar permisos de múltiples usuarios
 * @access  Solo Diego Castillo
 */
router.put('/usuarios/batch', authenticateToken, verificarEsAdminPermisos, actualizarPermisosMultiples);

export default router;
