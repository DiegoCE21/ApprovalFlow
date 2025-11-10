import pool from './config/postgres.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrar() {
  const client = await pool.connect();
  
  try {
    console.log('Iniciando migración...');
    
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'database', 'migrar_firma_nullable.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    
    // Ejecutar la migración
    await client.query('BEGIN');
    
    await client.query(`
      ALTER TABLE firmas 
      ALTER COLUMN firma_base64 DROP NOT NULL
    `);
    
    console.log('✓ Columna firma_base64 ahora permite valores NULL');
    
    // Verificar el cambio
    const result = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'firmas' 
      AND column_name = 'firma_base64'
    `);
    
    console.log('✓ Verificación:', result.rows[0]);
    
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
