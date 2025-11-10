import express from 'express';
import { firmarDocumento, rechazarDocumento, obtenerFirmas } from '../controllers/firmaController.js';

const router = express.Router();

// POST /api/firmas/firmar - Firmar y aprobar documento
router.post('/firmar', firmarDocumento);

// POST /api/firmas/rechazar - Rechazar documento
router.post('/rechazar', rechazarDocumento);

// GET /api/firmas/:documentoId - Obtener firmas de un documento
router.get('/:documentoId', obtenerFirmas);

export default router;
