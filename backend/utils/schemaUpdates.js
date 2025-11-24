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

    // Sincronizar la secuencia de grupo_firmantes con el valor máximo actual
    // Esto corrige problemas de desincronización de secuencias
    await pool.query(`
      SELECT setval(
        pg_get_serial_sequence('grupo_firmantes', 'id'),
        COALESCE((SELECT MAX(id) FROM grupo_firmantes), 1),
        true
      );
    `).catch((error) => {
      console.warn('Advertencia al sincronizar secuencia de grupo_firmantes:', error.message);
    });

    // Crear tabla para rastrear correos enviados y evitar duplicados
    await pool.query(`
      CREATE TABLE IF NOT EXISTS correos_enviados (
        id SERIAL PRIMARY KEY,
        destinatario VARCHAR(255) NOT NULL,
        documento_id INTEGER REFERENCES documentos(id) ON DELETE CASCADE,
        aprobador_id INTEGER REFERENCES aprobadores(id) ON DELETE CASCADE,
        tipo_correo VARCHAR(50) NOT NULL, -- 'aprobacion', 'nueva_version', 'rechazo', 'aprobacion_completa', 'recordatorio'
        token_firma VARCHAR(255) DEFAULT '',
        enviado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Eliminar restricción UNIQUE antigua si existe
    await pool.query(`
      ALTER TABLE correos_enviados
      DROP CONSTRAINT IF EXISTS unique_correo_documento_tipo;
    `).catch(() => {
      // Ignorar error si la restricción no existe
    });

    // Actualizar columna token_firma para que use '' por defecto en lugar de NULL
    await pool.query(`
      UPDATE correos_enviados
      SET token_firma = ''
      WHERE token_firma IS NULL;
    `).catch(() => {
      // Ignorar si la tabla está vacía o no existe
    });

    await pool.query(`
      ALTER TABLE correos_enviados
      ALTER COLUMN token_firma SET DEFAULT '';
    `).catch(() => {
      // Ignorar error si ya tiene default
    });

    // Eliminar índice único antiguo si existe
    await pool.query(`
      DROP INDEX IF EXISTS idx_correos_enviados_unique;
    `).catch(() => {
      // Ignorar error si el índice no existe
    });

    // Crear restricción única simple (ahora que token_firma nunca es NULL)
    await pool.query(`
      ALTER TABLE correos_enviados
      DROP CONSTRAINT IF EXISTS idx_correos_enviados_unique;
    `).catch(() => {
      // Ignorar error si la restricción no existe
    });

    await pool.query(`
      ALTER TABLE correos_enviados
      ADD CONSTRAINT idx_correos_enviados_unique 
      UNIQUE (destinatario, documento_id, tipo_correo, token_firma);
    `).catch((error) => {
      // Si falla, intentar crear como índice único
      console.warn('No se pudo crear restricción única, creando índice único:', error.message);
      pool.query(`
        CREATE UNIQUE INDEX idx_correos_enviados_unique
        ON correos_enviados (destinatario, documento_id, tipo_correo, token_firma);
      `).catch(() => {});
    });

    // Crear índice para búsquedas rápidas
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_correos_enviados_destinatario
      ON correos_enviados (destinatario, enviado_en);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_correos_enviados_documento
      ON correos_enviados (documento_id, tipo_correo);
    `);

    // Limpiar correos antiguos (más de 30 días) para mantener la tabla pequeña
    await pool.query(`
      DELETE FROM correos_enviados
      WHERE enviado_en < CURRENT_TIMESTAMP - INTERVAL '30 days';
    `).catch(() => {
      // Ignorar errores si la tabla no existe aún
    });

    schemaEnsured = true;
  } catch (error) {
    schemaEnsured = false;
    console.error('Error al asegurar actualizaciones de esquema:', error);
    throw error;
  }
}



