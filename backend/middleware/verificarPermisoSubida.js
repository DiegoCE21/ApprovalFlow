/**
 * Middleware que verifica si el usuario tiene permiso para subir documentos
 */
export function verificarPermisoSubida(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'No autenticado'
    });
  }

  // Verificar si tiene permiso para subir documentos
  if (!req.user.puedeSubirDocumentos) {
    return res.status(403).json({
      success: false,
      message: 'No tienes permiso para subir documentos. Contacta al administrador.',
      requierePermiso: true
    });
  }

  next();
}

import { esAdministrador } from '../utils/adminHelper.js';

/**
 * Middleware que verifica si el usuario es administrador de permisos
 * Por ahora solo diego.castillo@fastprobags.com puede gestionar permisos
 * (puede extenderse a otros administradores si es necesario)
 */
export function verificarEsAdminPermisos(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'No autenticado'
    });
  }

  // Solo diego.castillo@fastprobags.com puede gestionar permisos
  // (puede cambiarse para incluir otros administradores si es necesario)
  if (req.user.correo?.toLowerCase().trim() !== 'diego.castillo@fastprobags.com') {
    return res.status(403).json({
      success: false,
      message: 'Solo el administrador puede gestionar permisos'
    });
  }

  next();
}
