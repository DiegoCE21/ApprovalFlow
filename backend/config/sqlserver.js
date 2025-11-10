import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const sqlConfig = {
  server: process.env.SQLSERVER_HOST,
  port: parseInt(process.env.SQLSERVER_PORT),
  database: process.env.SQLSERVER_DATABASE,
  user: process.env.SQLSERVER_USER,
  password: process.env.SQLSERVER_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool = null;

export async function getSqlConnection() {
  try {
    if (!pool) {
      pool = await sql.connect(sqlConfig);
      console.log('✓ Conectado a SQL Server');
    }
    return pool;
  } catch (err) {
    console.error('Error al conectar con SQL Server:', err);
    throw err;
  }
}

export { sql };
