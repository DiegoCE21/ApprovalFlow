import pool from '../config/postgres.js';

const GRUPO_CORREOS = new Set([
  'supervisores.extrusion@fastprobags.com',
  'calidad.extrusion@fastprobags.com',
  'supervisores.acabado@fastprobags.com',
  'almacenistas.mth@fastprobags.com',
  'embarques.sitio1@fastprobags.com',
  'supervisores.sulzer@fastprobags.com',
  'produccion.general@fastprobags.com',
  'vigilancia.sitio1@fastprobags.com'
]);

const normalizarCorreo = (correo = '') => correo.trim().toLowerCase();

export function obtenerCorreosGrupo() {
  return Array.from(GRUPO_CORREOS);
}

export async function obtenerGrupos(req, res) {
  try {
    const correos = Array.from(GRUPO_CORREOS);

    if (correos.length === 0) {
      return res.status(200).json({
        success: true,
        grupos: []
      });
    }

    const result = await pool.query(
      `
      SELECT correo_grupo, COUNT(*) AS total_miembros
      FROM grupo_firmantes
      WHERE correo_grupo = ANY($1::text[])
        AND activo = TRUE
      GROUP BY correo_grupo
      `,
      [correos]
    );

    const conteo = result.rows.reduce((acc, row) => {
      acc[row.correo_grupo] = parseInt(row.total_miembros, 10) || 0;
      return acc;
    }, {});

    const grupos = correos.map((correo) => ({
      correo,
      miembrosRegistrados: conteo[correo] || 0
    }));

    return res.status(200).json({
      success: true,
      grupos
    });
  } catch (error) {
    console.error('Error al obtener grupos de firmantes:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener los grupos de firmantes',
      error: error.message
    });
  }
}

export async function obtenerMiembrosGrupo(req, res) {
  try {
    const correoGrupoRaw = req.query.correo || req.params.correo;
    const correoGrupo = normalizarCorreo(correoGrupoRaw);

    if (!correoGrupo) {
      return res.status(400).json({
        success: false,
        message: 'El correo del grupo es requerido'
      });
    }

    if (!GRUPO_CORREOS.has(correoGrupo)) {
      return res.status(404).json({
        success: false,
        message: 'El correo proporcionado no está configurado como un grupo de firmantes',
        correoGrupo
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        correo_grupo,
        miembro_usuario_id,
        miembro_nombre,
        miembro_correo,
        miembro_numero_nomina,
        miembro_puesto,
        miembro_rol,
        activo
      FROM grupo_firmantes
      WHERE correo_grupo = $1
        AND activo = TRUE
      ORDER BY miembro_nombre ASC
      `,
      [correoGrupo]
    );

    const miembros = result.rows.map((row) => ({
      registroId: row.id,
      usuarioId: row.miembro_usuario_id ?? -row.id,
      nombre: row.miembro_nombre,
      correo: row.miembro_correo,
      numeroNomina: row.miembro_numero_nomina,
      puesto: row.miembro_puesto,
      rol: row.miembro_rol,
      correoGrupo: row.correo_grupo
    }));

    return res.status(200).json({
      success: true,
      correoGrupo,
      miembros
    });
  } catch (error) {
    console.error('Error al obtener miembros del grupo:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener los miembros del grupo',
      error: error.message
    });
  }
}

/**
 * Crear/agregar un nuevo miembro a un grupo
 */
export async function crearMiembroGrupo(req, res) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { correoGrupo, miembroNombre, miembroCorreo, miembroNumeroNomina, miembroPuesto, miembroRol, miembroUsuarioId } = req.body;

    const correoGrupoNormalizado = normalizarCorreo(correoGrupo);

    if (!correoGrupoNormalizado) {
      return res.status(400).json({
        success: false,
        message: 'El correo del grupo es requerido'
      });
    }

    if (!GRUPO_CORREOS.has(correoGrupoNormalizado)) {
      return res.status(404).json({
        success: false,
        message: 'El correo proporcionado no está configurado como un grupo de firmantes'
      });
    }

    if (!miembroNombre) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del miembro es requerido'
      });
    }

    // Verificar si ya existe un miembro activo con ese correo en ese grupo (solo si se proporciona correo)
    let existeResult = { rows: [] };
    if (miembroCorreo && miembroCorreo.trim()) {
      existeResult = await client.query(
        `SELECT id FROM grupo_firmantes 
         WHERE correo_grupo = $1 AND miembro_correo = $2 AND activo = TRUE`,
        [correoGrupoNormalizado, normalizarCorreo(miembroCorreo)]
      );
    }

    if (existeResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un miembro activo con ese correo en este grupo'
      });
    }

    const result = await client.query(
      `INSERT INTO grupo_firmantes (
        correo_grupo, miembro_usuario_id, miembro_nombre, miembro_correo,
        miembro_numero_nomina, miembro_puesto, miembro_rol, activo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
      RETURNING *`,
      [
        correoGrupoNormalizado,
        miembroUsuarioId || null,
        miembroNombre,
        (miembroCorreo && miembroCorreo.trim()) ? normalizarCorreo(miembroCorreo) : null,
        miembroNumeroNomina || null,
        miembroPuesto || null,
        miembroRol || null
      ]
    );

    await client.query('COMMIT');

    const nuevoMiembro = result.rows[0];
    return res.status(201).json({
      success: true,
      message: 'Miembro agregado exitosamente al grupo',
      miembro: {
        registroId: nuevoMiembro.id,
        usuarioId: nuevoMiembro.miembro_usuario_id ?? -nuevoMiembro.id,
        nombre: nuevoMiembro.miembro_nombre,
        correo: nuevoMiembro.miembro_correo,
        numeroNomina: nuevoMiembro.miembro_numero_nomina,
        puesto: nuevoMiembro.miembro_puesto,
        rol: nuevoMiembro.miembro_rol,
        correoGrupo: nuevoMiembro.correo_grupo
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear miembro del grupo:', error);
    
    // Manejar errores de restricción única
    if (error.code === '23505') { // PostgreSQL unique violation error code
      return res.status(400).json({
        success: false,
        message: 'Ya existe un miembro activo con ese correo en este grupo'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Error al agregar el miembro al grupo',
      error: error.message
    });
  } finally {
    client.release();
  }
}

/**
 * Actualizar un miembro de un grupo
 */
export async function actualizarMiembroGrupo(req, res) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { miembroNombre, miembroCorreo, miembroNumeroNomina, miembroPuesto, miembroRol, miembroUsuarioId } = req.body;

    // Verificar que el registro existe
    const existeResult = await client.query(
      `SELECT * FROM grupo_firmantes WHERE id = $1`,
      [id]
    );

    if (existeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Miembro no encontrado'
      });
    }

    const registroActual = existeResult.rows[0];

    // Si se cambia el correo, verificar que no exista otro activo con ese correo en el mismo grupo (solo si se proporciona correo)
    if (miembroCorreo && miembroCorreo.trim()) {
      const correoNormalizado = normalizarCorreo(miembroCorreo);
      if (correoNormalizado !== registroActual.miembro_correo) {
        const correoExiste = await client.query(
          `SELECT id FROM grupo_firmantes 
           WHERE correo_grupo = $1 AND miembro_correo = $2 AND activo = TRUE AND id != $3`,
          [registroActual.correo_grupo, correoNormalizado, id]
        );

        if (correoExiste.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Ya existe otro miembro activo con ese correo en este grupo'
          });
        }
      }
    }

    const result = await client.query(
      `UPDATE grupo_firmantes 
       SET miembro_usuario_id = COALESCE($1, miembro_usuario_id),
           miembro_nombre = COALESCE($2, miembro_nombre),
           miembro_correo = COALESCE($3, miembro_correo),
           miembro_numero_nomina = COALESCE($4, miembro_numero_nomina),
           miembro_puesto = COALESCE($5, miembro_puesto),
           miembro_rol = COALESCE($6, miembro_rol),
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        miembroUsuarioId !== undefined ? miembroUsuarioId : null,
        miembroNombre || null,
        (miembroCorreo && miembroCorreo.trim()) ? normalizarCorreo(miembroCorreo) : null,
        miembroNumeroNomina || null,
        miembroPuesto || null,
        miembroRol || null,
        id
      ]
    );

    await client.query('COMMIT');

    const miembroActualizado = result.rows[0];
    return res.status(200).json({
      success: true,
      message: 'Miembro actualizado exitosamente',
      miembro: {
        registroId: miembroActualizado.id,
        usuarioId: miembroActualizado.miembro_usuario_id ?? -miembroActualizado.id,
        nombre: miembroActualizado.miembro_nombre,
        correo: miembroActualizado.miembro_correo,
        numeroNomina: miembroActualizado.miembro_numero_nomina,
        puesto: miembroActualizado.miembro_puesto,
        rol: miembroActualizado.miembro_rol,
        correoGrupo: miembroActualizado.correo_grupo
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar miembro del grupo:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar el miembro',
      error: error.message
    });
  } finally {
    client.release();
  }
}

/**
 * Eliminar/desactivar un miembro de un grupo
 */
export async function eliminarMiembroGrupo(req, res) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // Verificar que el registro existe
    const existeResult = await client.query(
      `SELECT * FROM grupo_firmantes WHERE id = $1`,
      [id]
    );

    if (existeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Miembro no encontrado'
      });
    }

    // Desactivar en lugar de eliminar (soft delete)
    await client.query(
      `UPDATE grupo_firmantes 
       SET activo = FALSE, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Miembro eliminado exitosamente del grupo'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar miembro del grupo:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar el miembro',
      error: error.message
    });
  } finally {
    client.release();
  }
}

