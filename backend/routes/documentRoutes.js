import express from 'express';
import { 
  subirDocumento, 
  obtenerMisDocumentos, 
  obtenerDocumentosPendientes,
  obtenerDocumentoPorToken,
  descargarDocumento,
  descargarDocumentoPorToken,
  obtenerDocumentoPorId,
  obtenerAprobadoresDocumento,
  subirNuevaVersion,
  obtenerHistorialVersiones,
  actualizarPosicionesFirmas,
  editarDocumento,
  eliminarDocumento,
  reenviarDocumento
} from '../controllers/documentController.js';
import { authenticateToken } from '../middleware/auth.js';
import { verificarPermisoSubida } from '../middleware/verificarPermisoSubida.js';
import { verificarAprobador } from '../middleware/verificarAprobador.js';
import upload from '../config/multer.js';

const router = express.Router();

// POST /api/documentos/subir - Subir nuevo documento (requiere permiso)
router.post('/subir', authenticateToken, verificarPermisoSubida, upload.single('documento'), subirDocumento);

// POST /api/documentos/:id/nueva-version - Subir nueva versión de documento rechazado (requiere permiso)
router.post('/:id/nueva-version', authenticateToken, verificarPermisoSubida, upload.single('documento'), subirNuevaVersion);

// GET /api/documentos/mis-documentos - Obtener documentos creados por el usuario
router.get('/mis-documentos', authenticateToken, obtenerMisDocumentos);

// GET /api/documentos/pendientes - Obtener documentos pendientes de aprobar
router.get('/pendientes', authenticateToken, obtenerDocumentosPendientes);

// GET /api/documentos/token/:token - Obtener documento por token de firma (requiere autenticación y ser el aprobador)
router.get('/token/:token', authenticateToken, verificarAprobador, obtenerDocumentoPorToken);

// GET /api/documentos/descargar-token/:token - Descargar PDF usando token (requiere autenticación y ser el aprobador)
router.get('/descargar-token/:token', authenticateToken, verificarAprobador, descargarDocumentoPorToken);

// GET /api/documentos/descargar/:id - Descargar PDF (requiere autenticación)
router.get('/descargar/:id', authenticateToken, descargarDocumento);

// GET /api/documentos/:id - Obtener documento por ID
router.get('/:id', authenticateToken, obtenerDocumentoPorId);

// GET /api/documentos/:id/aprobadores - Obtener aprobadores de un documento
router.get('/:id/aprobadores', authenticateToken, obtenerAprobadoresDocumento);

// GET /api/documentos/:id/historial - Obtener historial de versiones
router.get('/:id/historial', authenticateToken, obtenerHistorialVersiones);

// PUT /api/documentos/:id/posiciones-firmas - Actualizar posiciones de firmas y reaplicarlas (solo admin)
router.put('/:id/posiciones-firmas', authenticateToken, actualizarPosicionesFirmas);

// PUT /api/documentos/:id - Editar documento (solo creador o admin)
router.put('/:id', authenticateToken, editarDocumento);

// DELETE /api/documentos/:id - Eliminar documento (solo creador o admin)
router.delete('/:id', authenticateToken, eliminarDocumento);

// POST /api/documentos/:id/reenviar - Reenviar documento vencido (solo creador o admin)
router.post('/:id/reenviar', authenticateToken, reenviarDocumento);

// DEBUG: Ver todos los documentos
router.get('/debug/todos', authenticateToken, async (req, res) => {
  const pool = (await import('../config/postgres.js')).default;
  const result = await pool.query('SELECT id, nombre_archivo, version, documento_padre_id, estado FROM documentos ORDER BY id');
  res.json(result.rows);
});

// DEBUG: Limpiar base de datos (solo para desarrollo)
router.post('/debug/limpiar', authenticateToken, async (req, res) => {
  const pool = (await import('../config/postgres.js')).default;
  const fs = (await import('fs')).default;
  const path = (await import('path')).default;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Obtener rutas de archivos antes de borrar
    const archivos = await client.query('SELECT ruta_archivo FROM documentos');
    
    // Desactivar restricciones temporalmente
    await client.query("SET session_replication_role = 'replica'");
    
    // Limpiar todas las tablas
    await client.query('TRUNCATE TABLE log_auditoria CASCADE');
    await client.query('TRUNCATE TABLE firmas CASCADE');
    await client.query('TRUNCATE TABLE aprobadores CASCADE');
    await client.query('TRUNCATE TABLE documentos CASCADE');
    
    // Reactivar restricciones
    await client.query("SET session_replication_role = 'origin'");
    
    // Resetear secuencias
    await client.query('ALTER SEQUENCE log_auditoria_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE firmas_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE aprobadores_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE documentos_id_seq RESTART WITH 1');
    
    await client.query('COMMIT');
    
    // Eliminar archivos PDF físicos
    let archivosEliminados = 0;
    for (const archivo of archivos.rows) {
      try {
        if (fs.existsSync(archivo.ruta_archivo)) {
          fs.unlinkSync(archivo.ruta_archivo);
          archivosEliminados++;
        }
      } catch (error) {
        console.error(`Error al eliminar archivo ${archivo.ruta_archivo}:`, error);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Base de datos limpiada exitosamente',
      archivosEliminados
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al limpiar base de datos:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

export default router;
