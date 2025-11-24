import pool from '../config/postgres.js';

let schemaEnsured = false;

export async function ensureSchemaUpdates() {
  if (schemaEnsured) {
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grupo_firmantes (
        id SERIAL PRIMARY KEY,
        correo_grupo VARCHAR(255) NOT NULL,
        miembro_usuario_id INTEGER,
        miembro_nombre VARCHAR(255) NOT NULL,
        miembro_correo VARCHAR(255),
        miembro_numero_nomina VARCHAR(50),
        miembro_puesto VARCHAR(150),
        miembro_rol VARCHAR(100),
        activo BOOLEAN DEFAULT TRUE,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Actualizar columna para permitir NULL si ya existe
    await pool.query(`
      ALTER TABLE grupo_firmantes
      ALTER COLUMN miembro_correo DROP NOT NULL;
    `).catch(() => {
      // Ignorar error si la columna ya permite NULL o no existe
    });

    await pool.query(`
      CREATE OR REPLACE FUNCTION actualizar_timestamp_grupo_firmantes()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.actualizado_en = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS trigger_actualizar_grupo_firmantes ON grupo_firmantes;
    `);

    await pool.query(`
      CREATE TRIGGER trigger_actualizar_grupo_firmantes
      BEFORE UPDATE ON grupo_firmantes
      FOR EACH ROW
      EXECUTE FUNCTION actualizar_timestamp_grupo_firmantes();
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grupo_firmantes_correo
      ON grupo_firmantes (correo_grupo);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grupo_firmantes_activo
      ON grupo_firmantes (activo);
    `);

    // Eliminar la restricción UNIQUE antigua si existe (puede tener diferentes nombres)
    await pool.query(`
      ALTER TABLE grupo_firmantes
      DROP CONSTRAINT IF EXISTS grupo_firmantes_correo_grupo_miembro_correo_key;
    `).catch(() => {
      // Ignorar error si la restricción no existe o tiene otro nombre
    });

    // Intentar eliminar cualquier otra restricción única relacionada
    // PostgreSQL puede generar nombres diferentes para la restricción
    const constraintResult = await pool.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'grupo_firmantes'
        AND constraint_type = 'UNIQUE'
        AND constraint_name LIKE '%correo%';
    `).catch(() => ({ rows: [] }));

    for (const row of constraintResult.rows || []) {
      // Usar comillas dobles para el nombre de la restricción (identificador)
      const constraintName = row.constraint_name.replace(/"/g, '""'); // Escapar comillas dobles
      await pool.query(`
        ALTER TABLE grupo_firmantes
        DROP CONSTRAINT IF EXISTS "${constraintName}";
      `).catch(() => {
        // Ignorar errores al eliminar restricciones
      });
    }

    // Crear índice único parcial solo para miembros activos
    // Esto permite tener múltiples miembros inactivos con el mismo correo
    await pool.query(`
      DROP INDEX IF EXISTS idx_grupo_firmantes_unique_activo;
    `).catch(() => {
      // Ignorar error si el índice no existe
    });

    await pool.query(`
      CREATE UNIQUE INDEX idx_grupo_firmantes_unique_activo
      ON grupo_firmantes (correo_grupo, miembro_correo)
      WHERE activo = TRUE AND miembro_correo IS NOT NULL;
    `);

    await pool.query(`
      ALTER TABLE aprobadores
      ADD COLUMN IF NOT EXISTS correo_grupo VARCHAR(255);
    `);

    await pool.query(`
      ALTER TABLE aprobadores
      ADD COLUMN IF NOT EXISTS grupo_miembro_id INTEGER;
    `);

    schemaEnsured = true;
  } catch (error) {
    schemaEnsured = false;
    console.error('Error al asegurar actualizaciones de esquema:', error);
    throw error;
  }
}



