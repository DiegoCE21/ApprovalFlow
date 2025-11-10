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

/**
 * Middleware que verifica si el usuario es Diego Castillo (administrador de permisos)
 */
export function verificarEsAdminPermisos(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'No autenticado'
    });
  }

  // Solo diego.castillo@fastprobags.com puede gestionar permisos
  if (req.user.correo !== 'diego.castillo@fastprobags.com') {
    return res.status(403).json({
      success: false,
      message: 'Solo el administrador puede gestionar permisos'
    });
  }

  next();
}
