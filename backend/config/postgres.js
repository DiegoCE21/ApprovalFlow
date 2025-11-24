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
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // Asegurar que la conexión use UTF-8
  client_encoding: 'UTF8'
});

// Variable para rastrear si ya se mostró el mensaje de conexión
let mensajeConexionMostrado = false;

pool.on('error', (err) => {
  console.error('Error inesperado en cliente PostgreSQL:', err);
});

// Verificar conexión inicial solo una vez (sin listener 'connect' que se dispara muchas veces)
const verificarConexion = async () => {
  if (mensajeConexionMostrado) return;
  
  try {
    const client = await pool.connect();
    console.log('✓ Conectado a PostgreSQL');
    mensajeConexionMostrado = true;
    client.release();
  } catch (err) {
    console.error('Error al conectar con PostgreSQL:', err);
  }
};

// Verificar conexión al inicializar (solo se ejecuta una vez)
verificarConexion();

export default pool;
