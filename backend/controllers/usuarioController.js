import { getSqlConnection, sql } from '../config/sqlserver.js';

/**
 * Obtener lista de usuarios para selección de aprobadores
 */
export async function obtenerListaUsuarios(req, res) {
  try {
    const sqlPool = await getSqlConnection();

    const result = await sqlPool.request()
      .query(`
        SELECT 
          id, 
          nombre, 
          correo,
          TipoUsuario,
          NumeroNomina,
          rolNom
        FROM dbo.Usuarios
        WHERE correo IS NOT NULL
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
      message: 'Error al obtener la lista de usuarios',
      error: error.message
    });
  }
}
