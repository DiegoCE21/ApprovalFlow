import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

async function agregarColumnas() {
  const client = await pool.connect();
  
  try {
    console.log('Conectando a PostgreSQL...');
    
    await client.query(`
      ALTER TABLE aprobadores 
      ADD COLUMN IF NOT EXISTS posicion_x FLOAT,
      ADD COLUMN IF NOT EXISTS posicion_y FLOAT,
      ADD COLUMN IF NOT EXISTS pagina_firma INTEGER DEFAULT -1,
      ADD COLUMN IF NOT EXISTS ancho_firma FLOAT DEFAULT 150,
      ADD COLUMN IF NOT EXISTS alto_firma FLOAT DEFAULT 75;
    `);
    
    console.log('✓ Columnas agregadas exitosamente');
    
    // Verificar las columnas
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'aprobadores' 
      AND column_name IN ('posicion_x', 'posicion_y', 'pagina_firma', 'ancho_firma', 'alto_firma')
      ORDER BY column_name;
    `);
    
    console.log('\nColumnas agregadas:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
  } catch (error) {
    console.error('Error al agregar columnas:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

agregarColumnas();
