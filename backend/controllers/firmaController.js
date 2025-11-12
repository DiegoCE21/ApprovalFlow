import pool from '../config/postgres.js';
import { insertarFirmaEnPDF, insertarMultiplesFirmasEnPDF } from '../utils/pdfSigner.js';
import { enviarNotificacionRechazo, enviarNotificacionAprobacionCompleta, enviarNotificacionRechazoParticipante } from '../utils/mailer.js';
import fs from 'fs';
import path from 'path';

/**
 * Firmar y aprobar documento
 */
export async function firmarDocumento(req, res) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { token, grupoMiembroId: grupoMiembroIdRaw } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token es requerido'
      });
    }

    // Convertir grupoMiembroId a número si se proporciona
    const grupoMiembroId = grupoMiembroIdRaw !== null && grupoMiembroIdRaw !== undefined 
      ? Number(grupoMiembroIdRaw) 
      : null;

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
         a.correo_grupo,
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

    // Si es un grupo, se debe proporcionar grupoMiembroId
    let nombreFirma = aprobador.usuario_nombre;
    let correoFirma = aprobador.usuario_correo;
    let usuarioIdFirma = aprobador.usuario_id;

    if (aprobador.correo_grupo) {
      // Si es un grupo, el grupoMiembroId es obligatorio
      if (!grupoMiembroId) {
        return res.status(400).json({
          success: false,
          message: 'Debe seleccionar la persona que está firmando por el grupo'
        });
      }

      const miembroResult = await client.query(
        `SELECT 
           miembro_nombre,
           miembro_correo,
           miembro_usuario_id
         FROM grupo_firmantes
         WHERE id = $1 AND correo_grupo = $2 AND activo = TRUE`,
        [grupoMiembroId, aprobador.correo_grupo]
      );

      if (miembroResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Miembro del grupo no encontrado o inactivo'
        });
      }

      const miembro = miembroResult.rows[0];
      nombreFirma = miembro.miembro_nombre;
      correoFirma = miembro.miembro_correo || aprobador.usuario_correo;
      usuarioIdFirma = miembro.miembro_usuario_id || aprobador.usuario_id;

      // Actualizar el aprobador con la información del miembro
      await client.query(
        `UPDATE aprobadores 
         SET usuario_nombre = $1, 
             usuario_correo = $2,
             usuario_id = $3,
             grupo_miembro_id = $4
         WHERE id = $5`,
        [nombreFirma, correoFirma, usuarioIdFirma, grupoMiembroId, aprobador.aprobador_id]
      );
    }

    // Insertar firma en la tabla (sin firma_base64)
    await client.query(
      `INSERT INTO firmas (
        documento_id, aprobador_id, usuario_id, usuario_nombre, ip_address
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        aprobador.documento_id,
        aprobador.aprobador_id,
        usuarioIdFirma,
        nombreFirma,
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
        usuarioNombre: nombreFirma,
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
        usuarioIdFirma,
        nombreFirma,
        correoFirma,
        'firma',
        `Documento firmado por ${nombreFirma}`,
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
         d.nombre_archivo,
         d.usuario_creador_correo,
         d.usuario_creador_nombre
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
    const motivoGlobal = `Rechazado por ${aprobador.usuario_nombre}: ${motivo}`;

    // Actualizar estado del aprobador
    await client.query(
      `UPDATE aprobadores 
       SET estado = 'rechazado', fecha_aprobacion = CURRENT_TIMESTAMP, motivo_rechazo = $1
       WHERE id = $2`,
      [motivo, aprobador.aprobador_id]
    );

    // Marcar como rechazados al resto de aprobadores pendientes
    await client.query(
      `UPDATE aprobadores
       SET estado = 'rechazado', fecha_aprobacion = CURRENT_TIMESTAMP, motivo_rechazo = $1
       WHERE documento_id = $2
         AND id <> $3
         AND estado = 'pendiente'`,
      [motivoGlobal, aprobador.documento_id, aprobador.aprobador_id]
    );

    // Actualizar estado del documento
    await client.query(
      `UPDATE documentos 
       SET estado = 'rechazado', fecha_finalizacion = CURRENT_TIMESTAMP
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

    // Obtener participantes para notificar
    const participantesResult = await client.query(
      `SELECT usuario_correo, usuario_nombre
       FROM aprobadores
       WHERE documento_id = $1`,
      [aprobador.documento_id]
    );

    const destinatarios = new Map();

    participantesResult.rows.forEach(participante => {
      if (participante.usuario_correo) {
        destinatarios.set(participante.usuario_correo, participante.usuario_nombre || participante.usuario_correo);
      }
    });

    if (aprobador.usuario_creador_correo) {
      destinatarios.set(
        aprobador.usuario_creador_correo,
        aprobador.usuario_creador_nombre || aprobador.usuario_creador_correo
      );
    }

    const notificacionesParticipantes = [];
    destinatarios.forEach((nombreDestinatario, correoDestinatario) => {
      notificacionesParticipantes.push(
        enviarNotificacionRechazoParticipante(
          correoDestinatario,
          nombreDestinatario,
          aprobador.nombre_archivo,
          aprobador.usuario_nombre,
          motivo,
          aprobador.documento_id
        )
      );
    });

    await Promise.all(notificacionesParticipantes);

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
      message: 'Documento rechazado y se notificó a los participantes y al departamento de Calidad.'
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
