import pool from './config/postgres.js';

async function migrar() {
  const client = await pool.connect();
  
  try {
    console.log('Iniciando migración de campos de tiempo...');
    
    await client.query('BEGIN');
    
    // Agregar las columnas
    await client.query(`
      ALTER TABLE documentos 
      ADD COLUMN IF NOT EXISTS tiempo_limite_horas INTEGER DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS intervalo_recordatorio_minutos INTEGER DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS fecha_limite_aprobacion TIMESTAMP DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS ultimo_recordatorio_enviado TIMESTAMP DEFAULT NULL
    `);
    
    console.log('✓ Columnas agregadas exitosamente');
    
    // Verificar los cambios
    const result = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'documentos' 
      AND column_name IN ('tiempo_limite_horas', 'intervalo_recordatorio_minutos', 
                          'fecha_limite_aprobacion', 'ultimo_recordatorio_enviado')
      ORDER BY ordinal_position
    `);
    
    console.log('✓ Verificación:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });
    
    await client.query('COMMIT');
    console.log('✓ Migración completada exitosamente');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('✗ Error en la migración:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrar().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
