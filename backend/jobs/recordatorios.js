import cron from 'node-cron';
import pool from '../config/postgres.js';
import { enviarNotificacionAprobacion } from '../utils/mailer.js';

/**
 * Job que envía recordatorios a aprobadores pendientes
 * Se ejecuta cada minuto para verificar qué documentos necesitan recordatorios
 */
export function iniciarJobRecordatorios() {
  // Ejecutar cada minuto
  cron.schedule('* * * * *', async () => {
    try {
      await enviarRecordatorios();
    } catch (error) {
      console.error('Error en job de recordatorios:', error);
    }
  });
  
  console.log('✓ Job de recordatorios iniciado (se ejecuta cada minuto)');
}

/**
 * Busca documentos que necesitan enviar recordatorios y los envía
 */
async function enviarRecordatorios() {
  const client = await pool.connect();
  
  try {
    // Buscar documentos pendientes con intervalo de recordatorio configurado
    const documentosResult = await client.query(`
      SELECT 
        d.id,
        d.nombre_archivo,
        d.intervalo_recordatorio_minutos,
        d.ultimo_recordatorio_enviado,
        d.usuario_creador_nombre
      FROM documentos d
      WHERE d.estado = 'pendiente'
        AND d.intervalo_recordatorio_minutos IS NOT NULL
        AND d.intervalo_recordatorio_minutos > 0
        AND (
          d.ultimo_recordatorio_enviado IS NULL
          OR CURRENT_TIMESTAMP >= d.ultimo_recordatorio_enviado + (d.intervalo_recordatorio_minutos || ' minutes')::INTERVAL
        )
    `);
    
    for (const doc of documentosResult.rows) {
      // Verificar que el documento aún existe (puede haber sido eliminado)
      const docExistsResult = await client.query(
        `SELECT id, estado FROM documentos WHERE id = $1`,
        [doc.id]
      );
      
      if (docExistsResult.rows.length === 0) {
        // El documento fue eliminado, saltar
        continue;
      }
      
      const documentoActual = docExistsResult.rows[0];
      
      // Verificar que el documento sigue en estado pendiente (puede haber cambiado)
      if (documentoActual.estado !== 'pendiente') {
        continue;
      }
      
      // Obtener aprobadores pendientes
      const aprobadoresResult = await client.query(`
        SELECT 
          id,
          usuario_nombre,
          usuario_correo,
          token_firma
        FROM aprobadores
        WHERE documento_id = $1
          AND estado = 'pendiente'
      `, [doc.id]);
      
      if (aprobadoresResult.rows.length === 0) {
        // Todos aprobaron, no enviar recordatorios
        continue;
      }
      
      // Enviar recordatorio a cada aprobador pendiente (agrupar por correo para evitar duplicados)
      const correosEnviadosRecordatorio = new Set();
      
      for (const aprobador of aprobadoresResult.rows) {
        const correoNormalizado = (aprobador.usuario_correo || '').toLowerCase().trim();
        
        // Solo enviar si no se ha enviado ya a este correo
        if (correoNormalizado && !correosEnviadosRecordatorio.has(correoNormalizado)) {
          correosEnviadosRecordatorio.add(correoNormalizado);
          
          try {
            // Usar tipo 'recordatorio' para diferenciar de notificaciones iniciales
            // El sistema de deduplicación verificará si ya se envió en el último minuto
            await enviarNotificacionAprobacion(
              aprobador.usuario_correo,
              aprobador.usuario_nombre,
              doc.nombre_archivo,
              aprobador.token_firma,
              doc.usuario_creador_nombre,
              doc.id,
              aprobador.id,
              'recordatorio'
            );
            
            // Registrar en auditoría
            await client.query(`
              INSERT INTO log_auditoria (
                documento_id, usuario_id, usuario_nombre, usuario_correo,
                accion, descripcion
              ) VALUES ($1, NULL, $2, $3, $4, $5)
            `, [
              doc.id,
              aprobador.usuario_nombre,
              aprobador.usuario_correo,
              'recordatorio',
              `Recordatorio automático enviado a ${aprobador.usuario_nombre}`
            ]);
            
          } catch (error) {
            console.error(`Error enviando recordatorio a ${aprobador.usuario_correo}:`, error);
          }
        } else if (correoNormalizado) {
          console.log(`⏭ Recordatorio omitido (duplicado) a ${correoNormalizado} para documento ${doc.id}`);
        }
      }
      
      // Actualizar timestamp del último recordatorio (solo si el documento aún existe)
      const updateResult = await client.query(`
        UPDATE documentos
        SET ultimo_recordatorio_enviado = CURRENT_TIMESTAMP
        WHERE id = $1 AND estado = 'pendiente'
        RETURNING id
      `, [doc.id]);
      
      if (updateResult.rows.length > 0) {
        console.log(`✓ Recordatorios enviados para documento: ${doc.nombre_archivo}`);
      }
    }
    
  } catch (error) {
    console.error('Error al enviar recordatorios:', error);
  } finally {
    client.release();
  }
}
