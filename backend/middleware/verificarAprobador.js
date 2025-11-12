import pool from '../config/postgres.js';

/**
 * Middleware para verificar que el usuario autenticado es el aprobador asignado al token
 * o es miembro del grupo asignado
 */
export const verificarAprobador = async (req, res, next) => {
  try {
    // Obtener el token del parámetro (para GET) o del body (para POST)
    const token = req.params?.token || req.body?.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token es requerido'
      });
    }

    // Obtener información del usuario autenticado
    const usuarioId = req.user?.id;
    const correoUsuario = req.user?.correo || null;
    const numeroNomina = req.user?.NumeroNomina || null;

    if (!usuarioId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    // Buscar el aprobador por token
    const aprobadorResult = await pool.query(
      `SELECT 
         a.id as aprobador_id,
         a.usuario_id,
         a.usuario_correo,
         a.correo_grupo,
         a.estado,
         d.id as documento_id
       FROM aprobadores a
       INNER JOIN documentos d ON a.documento_id = d.id
       WHERE a.token_firma = $1`,
      [token]
    );

    if (aprobadorResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Token inválido o documento no encontrado'
      });
    }

    const aprobador = aprobadorResult.rows[0];

    // Verificar si el usuario es el aprobador asignado
    let esAprobador = false;

    // 1. Verificar si es aprobador directo
    if (aprobador.usuario_id === usuarioId) {
      esAprobador = true;
    }
    // 2. Verificar si es un grupo y el usuario se logueó con el correo del grupo
    else if (aprobador.correo_grupo && correoUsuario && 
             correoUsuario.toLowerCase().trim() === aprobador.correo_grupo.toLowerCase().trim()) {
      esAprobador = true;
    }
    // 3. Verificar si el usuario es miembro activo del grupo
    else if (aprobador.correo_grupo) {
      const miembroResult = await pool.query(
        `SELECT id FROM grupo_firmantes
         WHERE correo_grupo = $1
           AND activo = TRUE
           AND (
             -- Buscar por correo del miembro
             ($2::VARCHAR IS NOT NULL AND miembro_correo IS NOT NULL AND LOWER(TRIM(miembro_correo)) = LOWER(TRIM($2::VARCHAR)))
             -- Buscar por número de nómina en miembro_usuario_id
             OR ($3::VARCHAR IS NOT NULL AND miembro_usuario_id IS NOT NULL AND TRIM(miembro_usuario_id::VARCHAR) = TRIM($3::VARCHAR))
             -- Buscar por número de nómina en miembro_numero_nomina
             OR ($3::VARCHAR IS NOT NULL AND miembro_numero_nomina IS NOT NULL AND TRIM(miembro_numero_nomina) = TRIM($3::VARCHAR))
             -- Buscar por usuario_id del miembro
             OR ($4::INTEGER IS NOT NULL AND miembro_usuario_id IS NOT NULL AND miembro_usuario_id::INTEGER = $4::INTEGER)
           )`,
        [aprobador.correo_grupo, correoUsuario, numeroNomina, usuarioId]
      );

      if (miembroResult.rows.length > 0) {
        esAprobador = true;
      }
    }

    if (!esAprobador) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para acceder a este documento. Solo el aprobador asignado puede verlo y aprobarlo.'
      });
    }

    // Agregar información del aprobador a la request para uso posterior
    req.aprobador = aprobador;
    next();

  } catch (error) {
    console.error('Error al verificar aprobador:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al verificar permisos'
    });
  }
};

