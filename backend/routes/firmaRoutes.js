import express from 'express';
import { firmarDocumento, rechazarDocumento, obtenerFirmas } from '../controllers/firmaController.js';
import { authenticateToken } from '../middleware/auth.js';
import { verificarAprobador } from '../middleware/verificarAprobador.js';

const router = express.Router();

// POST /api/firmas/firmar - Firmar y aprobar documento (requiere autenticación y ser el aprobador)
router.post('/firmar', authenticateToken, verificarAprobador, firmarDocumento);

// POST /api/firmas/rechazar - Rechazar documento (requiere autenticación y ser el aprobador)
router.post('/rechazar', authenticateToken, verificarAprobador, rechazarDocumento);

// GET /api/firmas/:documentoId - Obtener firmas de un documento
router.get('/:documentoId', obtenerFirmas);

export default router;
