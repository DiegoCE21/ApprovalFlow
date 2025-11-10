import cron from 'node-cron';
import pool from '../config/postgres.js';
import { enviarNotificacionRechazo } from '../utils/mailer.js';

/**
 * Job que marca documentos como vencidos cuando pasa el tiempo límite
 * Se ejecuta cada minuto para verificar
 */
export function iniciarJobVencimientos() {
  // Ejecutar cada minuto
  cron.schedule('* * * * *', async () => {
    try {
      await verificarVencimientos();
    } catch (error) {
      console.error('Error en job de vencimientos:', error);
    }
  });
  
  console.log('✓ Job de vencimientos iniciado (se ejecuta cada minuto)');
}

/**
 * Busca documentos que han pasado su tiempo límite y los marca como vencidos
 */
async function verificarVencimientos() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Buscar documentos pendientes que han pasado su fecha límite
    const documentosResult = await client.query(`
      SELECT 
        d.id,
        d.nombre_archivo,
        d.fecha_limite_aprobacion,
        d.usuario_creador_correo,
        d.usuario_creador_nombre
      FROM documentos d
      WHERE d.estado = 'pendiente'
        AND d.fecha_limite_aprobacion IS NOT NULL
        AND CURRENT_TIMESTAMP >= d.fecha_limite_aprobacion
    `);
    
    for (const doc of documentosResult.rows) {
      // Obtener aprobadores pendientes
      const aprobadoresResult = await client.query(`
        SELECT 
          usuario_nombre,
          usuario_correo
        FROM aprobadores
        WHERE documento_id = $1
          AND estado = 'pendiente'
      `, [doc.id]);
      
      // Marcar documento como vencido
      await client.query(`
        UPDATE documentos
        SET estado = 'vencido'
        WHERE id = $1
      `, [doc.id]);
      
      // Marcar aprobadores pendientes como vencidos
      await client.query(`
        UPDATE aprobadores
        SET estado = 'vencido'
        WHERE documento_id = $1
          AND estado = 'pendiente'
      `, [doc.id]);
      
      // Registrar en auditoría
      await client.query(`
        INSERT INTO log_auditoria (
          documento_id, usuario_id, usuario_nombre, usuario_correo,
          accion, descripcion
        ) VALUES ($1, NULL, $2, $3, $4, $5)
      `, [
        doc.id,
        'Sistema',
        'sistema@flujo.com',
        'vencimiento',
        `Documento vencido automáticamente. Fecha límite: ${doc.fecha_limite_aprobacion}`
      ]);
      
      // Crear lista de aprobadores que no firmaron
      const nombresPendientes = aprobadoresResult.rows
        .map(a => a.usuario_nombre)
        .join(', ');
      
      // Notificar al creador del documento
      try {
        const motivo = `El documento ha vencido sin completar todas las aprobaciones. ` +
                      `Aprobadores pendientes: ${nombresPendientes}. ` +
                      `Fecha límite: ${new Date(doc.fecha_limite_aprobacion).toLocaleString('es-MX')}`;
        
        await enviarNotificacionRechazo(
          doc.nombre_archivo,
          'Sistema de Vencimientos',
          motivo,
          doc.id
        );
      } catch (error) {
        console.error('Error enviando notificación de vencimiento:', error);
      }
      
      console.log(`✓ Documento vencido: ${doc.nombre_archivo} (ID: ${doc.id})`);
    }
    
    await client.query('COMMIT');
    
    if (documentosResult.rows.length > 0) {
      console.log(`✓ ${documentosResult.rows.length} documento(s) marcado(s) como vencido(s)`);
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al verificar vencimientos:', error);
  } finally {
    client.release();
  }
}
