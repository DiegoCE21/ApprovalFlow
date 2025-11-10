import pool from '../config/postgres.js';
import { insertarFirmaEnPDF, insertarMultiplesFirmasEnPDF } from '../utils/pdfSigner.js';
import { enviarNotificacionRechazo, enviarNotificacionAprobacionCompleta } from '../utils/mailer.js';
import fs from 'fs';
import path from 'path';

/**
 * Firmar y aprobar documento
 */
export async function firmarDocumento(req, res) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token es requerido'
      });
    }

    // Obtener aprobador y documento por token
    const aprobadorResult = await client.query(
      `SELECT 
         a.id as aprobador_id,
         a.documento_id,
         a.usuario_id,
         a.usuario_nombre,
         a.usuario_correo,
         a.estado,
         a.posicion_x,
         a.posicion_y,
         a.pagina_firma,
         a.ancho_firma,
         a.alto_firma,
         d.nombre_archivo,
         d.ruta_archivo,
         d.usuario_creador_correo,
         d.usuario_creador_nombre,
         d.fecha_creacion,
         d.version
       FROM aprobadores a
       INNER JOIN documentos d ON a.documento_id = d.id
       WHERE a.token_firma = $1`,
      [token]
    );

    if (aprobadorResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Token inválido o documento no encontrado'
      });
    }

    const aprobador = aprobadorResult.rows[0];

    if (aprobador.estado === 'aprobado') {
      return res.status(400).json({
        success: false,
        message: 'Ya has firmado este documento'
      });
    }

    // Insertar firma en la tabla (sin firma_base64)
    await client.query(
      `INSERT INTO firmas (
        documento_id, aprobador_id, usuario_id, usuario_nombre, ip_address
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        aprobador.documento_id,
        aprobador.aprobador_id,
        aprobador.usuario_id,
        aprobador.usuario_nombre,
        req.ip
      ]
    );

    // Actualizar estado del aprobador
    await client.query(
      `UPDATE aprobadores 
       SET estado = 'aprobado', fecha_aprobacion = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [aprobador.aprobador_id]
    );

    // Insertar nombre en el PDF usando las posiciones guardadas
    const pdfConFirma = await insertarFirmaEnPDF(
      aprobador.ruta_archivo,
      null, // Ya no enviamos firmaBase64
      {
        pagina: aprobador.pagina_firma,
        x: aprobador.posicion_x,
        y: aprobador.posicion_y,
        ancho: aprobador.ancho_firma,
        alto: aprobador.alto_firma,
        usuarioNombre: aprobador.usuario_nombre,
        fechaFirma: new Date()
      }
    );

    // Guardar PDF modificado
    fs.writeFileSync(aprobador.ruta_archivo, pdfConFirma);

    // Registrar en auditoría
    await client.query(
      `INSERT INTO log_auditoria (
        documento_id, usuario_id, usuario_nombre, usuario_correo,
        accion, descripcion, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        aprobador.documento_id,
        aprobador.usuario_id,
        aprobador.usuario_nombre,
        aprobador.usuario_correo,
        'firma',
        `Documento firmado por ${aprobador.usuario_nombre}`,
        req.ip
      ]
    );

    // Verificar si todos los aprobadores han firmado
    const todosAprobadoresResult = await client.query(
      `SELECT COUNT(*) as total, 
        (SELECT COUNT(*) FROM aprobadores WHERE documento_id = $1 AND estado = 'aprobado') as aprobados
       FROM aprobadores
       WHERE documento_id = $1`,
      [aprobador.documento_id]
    );

    const { total, aprobados } = todosAprobadoresResult.rows[0];

    if (parseInt(total) === parseInt(aprobados)) {
      // Todos han aprobado - actualizar estado del documento
      await client.query(
        `UPDATE documentos 
         SET estado = 'aprobado', fecha_finalizacion = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [aprobador.documento_id]
      );

      // Ya no agregamos página de auditoría - el PDF ya tiene todas las firmas insertadas

      // Notificar al creador del documento
      await enviarNotificacionAprobacionCompleta(
        aprobador.usuario_creador_correo,
        aprobador.usuario_creador_nombre,
        aprobador.nombre_archivo,
        aprobador.documento_id
      );
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Documento firmado exitosamente',
      todosAprobaron: parseInt(total) === parseInt(aprobados)
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al firmar documento:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al firmar el documento',
      error: error.message
    });
  } finally {
    client.release();
  }
}

/**
 * Rechazar documento
 */
export async function rechazarDocumento(req, res) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { token, motivo } = req.body;

    if (!token || !motivo) {
      return res.status(400).json({
        success: false,
        message: 'Token y motivo de rechazo son requeridos'
      });
    }

    // Obtener aprobador y documento por token
    const aprobadorResult = await client.query(
      `SELECT 
         a.id as aprobador_id,
         a.documento_id,
         a.usuario_id,
         a.usuario_nombre,
         a.usuario_correo,
         d.nombre_archivo
       FROM aprobadores a
       INNER JOIN documentos d ON a.documento_id = d.id
       WHERE a.token_firma = $1`,
      [token]
    );

    if (aprobadorResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Token inválido o documento no encontrado'
      });
    }

    const aprobador = aprobadorResult.rows[0];

    // Actualizar estado del aprobador
    await client.query(
      `UPDATE aprobadores 
       SET estado = 'rechazado', fecha_aprobacion = CURRENT_TIMESTAMP, motivo_rechazo = $1
       WHERE id = $2`,
      [motivo, aprobador.aprobador_id]
    );

    // Actualizar estado del documento
    await client.query(
      `UPDATE documentos 
       SET estado = 'rechazado'
       WHERE id = $1`,
      [aprobador.documento_id]
    );

    // Registrar en auditoría
    await client.query(
      `INSERT INTO log_auditoria (
        documento_id, usuario_id, usuario_nombre, usuario_correo,
        accion, descripcion, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        aprobador.documento_id,
        aprobador.usuario_id,
        aprobador.usuario_nombre,
        aprobador.usuario_correo,
        'rechazo',
        `Documento rechazado por ${aprobador.usuario_nombre}. Motivo: ${motivo}`,
        req.ip
      ]
    );

    // Enviar notificación a Calidad
    await enviarNotificacionRechazo(
      aprobador.nombre_archivo,
      aprobador.usuario_nombre,
      motivo,
      aprobador.documento_id
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Documento rechazado. Se ha notificado al departamento de Calidad.'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al rechazar documento:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al rechazar el documento',
      error: error.message
    });
  } finally {
    client.release();
  }
}

/**
 * Obtener firmas de un documento
 */
export async function obtenerFirmas(req, res) {
  try {
    const { documentoId } = req.params;

    const result = await pool.query(
      `SELECT * FROM firmas WHERE documento_id = $1 ORDER BY fecha_firma ASC`,
      [documentoId]
    );

    return res.status(200).json({
      success: true,
      firmas: result.rows
    });

  } catch (error) {
    console.error('Error al obtener firmas:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener las firmas'
    });
  }
}
