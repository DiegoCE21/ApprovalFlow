import express from 'express';
import { 
  obtenerGrupos, 
  obtenerMiembrosGrupo, 
  crearMiembroGrupo,
  actualizarMiembroGrupo,
  eliminarMiembroGrupo
} from '../controllers/grupoController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', obtenerGrupos);
router.get('/miembros', obtenerMiembrosGrupo);
router.post('/miembros', authenticateToken, crearMiembroGrupo);
router.put('/miembros/:id', authenticateToken, actualizarMiembroGrupo);
router.delete('/miembros/:id', authenticateToken, eliminarMiembroGrupo);

export default router;

