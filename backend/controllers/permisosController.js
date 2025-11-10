import { getSqlConnection, sql } from '../config/sqlserver.js';

/**
 * Obtener lista de todos los usuarios con sus permisos
 */
export async function obtenerUsuariosConPermisos(req, res) {
  try {
    const sqlPool = await getSqlConnection();
    
    const result = await sqlPool.request().query(`
      SELECT 
        id,
        nombre,
        correo,
        TipoUsuario,
        NumeroNomina,
        rolNom,
        ISNULL(puede_subir_documentos, 0) as puede_subir_documentos
      FROM dbo.Usuarios
      WHERE correo IS NOT NULL AND correo != ''
      ORDER BY nombre ASC
    `);

    return res.status(200).json({
      success: true,
      usuarios: result.recordset
    });

  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener usuarios'
    });
  }
}

/**
 * Actualizar permiso de subida para un usuario
 */
export async function actualizarPermisoSubida(req, res) {
  try {
    const { usuarioId } = req.params;
    const { puedeSubirDocumentos } = req.body;

    if (typeof puedeSubirDocumentos !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'El campo puedeSubirDocumentos debe ser un booleano'
      });
    }

    const sqlPool = await getSqlConnection();

    // Obtener información del usuario antes de actualizar
    const usuarioResult = await sqlPool.request()
      .input('usuarioId', sql.Int, usuarioId)
      .query('SELECT nombre, correo FROM dbo.Usuarios WHERE id = @usuarioId');

    if (usuarioResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const usuario = usuarioResult.recordset[0];

    // Actualizar permiso
    await sqlPool.request()
      .input('usuarioId', sql.Int, usuarioId)
      .input('permiso', sql.Bit, puedeSubirDocumentos ? 1 : 0)
      .query(`
        UPDATE dbo.Usuarios 
        SET puede_subir_documentos = @permiso
        WHERE id = @usuarioId
      `);

    console.log(`✓ Permiso actualizado para ${usuario.nombre}: ${puedeSubirDocumentos}`);

    return res.status(200).json({
      success: true,
      message: `Permiso ${puedeSubirDocumentos ? 'otorgado' : 'revocado'} a ${usuario.nombre}`
    });

  } catch (error) {
    console.error('Error al actualizar permiso:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar permiso'
    });
  }
}

/**
 * Actualizar permisos de múltiples usuarios a la vez
 */
export async function actualizarPermisosMultiples(req, res) {
  try {
    const { usuarios } = req.body; // Array de { id, puedeSubirDocumentos }

    if (!Array.isArray(usuarios) || usuarios.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de usuarios'
      });
    }

    const sqlPool = await getSqlConnection();
    let actualizados = 0;

    for (const { id, puedeSubirDocumentos } of usuarios) {
      try {
        await sqlPool.request()
          .input('usuarioId', sql.Int, id)
          .input('permiso', sql.Bit, puedeSubirDocumentos ? 1 : 0)
          .query(`
            UPDATE dbo.Usuarios 
            SET puede_subir_documentos = @permiso
            WHERE id = @usuarioId
          `);
        actualizados++;
      } catch (error) {
        console.error(`Error actualizando usuario ${id}:`, error);
      }
    }

    return res.status(200).json({
      success: true,
      message: `${actualizados} usuario(s) actualizado(s)`,
      actualizados
    });

  } catch (error) {
    console.error('Error al actualizar permisos múltiples:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar permisos'
    });
  }
}
