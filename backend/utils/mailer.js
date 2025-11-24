import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import pool from '../config/postgres.js';

dotenv.config();

// Configurar transporter de nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false // Para red interna
  }
});

/**
 * Verificar si ya se envió un correo similar recientemente (últimos 5 minutos)
 * y registrar el envío si no existe
 * @param {string} destinatario - Correo del destinatario
 * @param {number} documentoId - ID del documento
 * @param {string} tipoCorreo - Tipo de correo ('aprobacion', 'nueva_version', 'rechazo', 'aprobacion_completa', 'recordatorio')
 * @param {string} tokenFirma - Token de firma (opcional)
 * @param {number} aprobadorId - ID del aprobador (opcional)
 * @returns {Promise<{yaEnviado: boolean, puedeEnviar: boolean}>}
 */
async function verificarYRegistrarCorreo(destinatario, documentoId, tipoCorreo, tokenFirma = null, aprobadorId = null) {
  if (!destinatario || !documentoId || !tipoCorreo) {
    return { yaEnviado: false, puedeEnviar: true };
  }

  try {
    // Normalizar correo
    const correoNormalizado = destinatario.toLowerCase().trim();

    // Para recordatorios, usar un intervalo más corto (1 minuto) para permitir recordatorios periódicos
    // Para envíos iniciales, usar un intervalo muy corto (10 segundos) para evitar duplicados por doble clic
    const intervaloMinutos = tipoCorreo === 'recordatorio' ? 1 : (tipoCorreo === 'aprobacion' ? 0.17 : 5); // 0.17 minutos = 10 segundos

    // Verificar si ya se envió un correo al mismo destinatario para el mismo documento y tipo
    // Para envíos iniciales, ignoramos el token para detectar duplicados por doble clic
    // Para recordatorios, sí consideramos el token porque cada recordatorio es legítimo
    const tokenFirmaNormalizado = tokenFirma || '';
    
    let resultado;
    if (tipoCorreo === 'aprobacion') {
      // Para envíos iniciales: verificar por destinatario, documento y tipo (ignorar token)
      // Esto previene duplicados por doble clic o envíos múltiples
      resultado = await pool.query(`
        SELECT id, enviado_en
        FROM correos_enviados
        WHERE destinatario = $1
          AND documento_id = $2
          AND tipo_correo = $3
          AND enviado_en > CURRENT_TIMESTAMP - INTERVAL '10 seconds'
        ORDER BY enviado_en DESC
        LIMIT 1
      `, [correoNormalizado, documentoId, tipoCorreo]);
    } else {
      // Para recordatorios y otros: verificar incluyendo el token
      resultado = await pool.query(`
        SELECT id, enviado_en
        FROM correos_enviados
        WHERE destinatario = $1
          AND documento_id = $2
          AND tipo_correo = $3
          AND token_firma = $4
          AND enviado_en > CURRENT_TIMESTAMP - INTERVAL '${intervaloMinutos} minutes'
        ORDER BY enviado_en DESC
        LIMIT 1
      `, [correoNormalizado, documentoId, tipoCorreo, tokenFirmaNormalizado]);
    }

    if (resultado.rows.length > 0) {
      const tiempoTranscurrido = new Date() - new Date(resultado.rows[0].enviado_en);
      const segundosTranscurridos = Math.floor(tiempoTranscurrido / 1000);
      if (tipoCorreo === 'aprobacion') {
        console.log(`⚠ Correo ya enviado a ${correoNormalizado} hace ${segundosTranscurridos} segundos (${tipoCorreo}, documento ${documentoId}) - duplicado detectado`);
      } else {
        const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);
        console.log(`⚠ Correo ya enviado a ${correoNormalizado} hace ${minutosTranscurridos} minutos (${tipoCorreo}, documento ${documentoId})`);
      }
      return { yaEnviado: true, puedeEnviar: false };
    }

    // Registrar el correo antes de enviarlo (usando INSERT ... ON CONFLICT para evitar race conditions)
    // Para envíos iniciales, usamos token vacío para que la restricción única funcione correctamente
    // y prevenga duplicados por doble clic (todos los envíos iniciales al mismo destinatario tendrán el mismo token vacío)
    try {
      // Para envíos iniciales, usar token vacío para que la restricción única funcione
      // Para recordatorios y otros, usar el token real
      const tokenFirmaParaRegistro = (tipoCorreo === 'aprobacion') ? '' : (tokenFirma || '');
      const insertResult = await pool.query(`
        INSERT INTO correos_enviados (destinatario, documento_id, aprobador_id, tipo_correo, token_firma)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (destinatario, documento_id, tipo_correo, token_firma) DO NOTHING
        RETURNING id
      `, [correoNormalizado, documentoId, aprobadorId, tipoCorreo, tokenFirmaParaRegistro]);
      
      if (insertResult.rows.length > 0) {
        console.log(`✓ Correo registrado en tabla de tracking: ${correoNormalizado} (${tipoCorreo}, documento ${documentoId})`);
      } else {
        // El correo ya estaba registrado (ON CONFLICT activado)
        console.log(`⚠ Correo ya registrado (conflicto) para ${correoNormalizado} (${tipoCorreo}, documento ${documentoId})`);
        return { yaEnviado: true, puedeEnviar: false };
      }
    } catch (error) {
      // Si hay un error al registrar, loguear y verificar
      console.error('Error al registrar correo en tabla:', error);
      console.error('Detalles del error:', {
        code: error.code,
        message: error.message,
        constraint: error.constraint
      });
      
      // Si es un error de restricción única, el correo ya existe
      if (error.code === '23505') { // Unique violation
        console.log(`⚠ Correo ya registrado (error único) para ${correoNormalizado} (${tipoCorreo}, documento ${documentoId})`);
        return { yaEnviado: true, puedeEnviar: false };
      }
      // Si es otro error, continuar con el envío pero loguear
      console.warn('Advertencia: continuando con envío a pesar del error de registro');
    }

    return { yaEnviado: false, puedeEnviar: true };
  } catch (error) {
    console.error('Error al verificar correo enviado:', error);
    // En caso de error, permitir el envío para no bloquear el sistema
    return { yaEnviado: false, puedeEnviar: true };
  }
}

/**
 * Enviar correo de notificación de aprobación
 * @param {string} destinatario - Correo del destinatario
 * @param {string} nombreDestinatario - Nombre del destinatario
 * @param {string} nombreDocumento - Nombre del documento
 * @param {string} tokenFirma - Token de firma
 * @param {string} remitente - Nombre del remitente
 * @param {number} documentoId - ID del documento (opcional, para deduplicación)
 * @param {number} aprobadorId - ID del aprobador (opcional, para deduplicación)
 * @param {string} tipoCorreo - Tipo de correo ('aprobacion' o 'recordatorio', por defecto 'aprobacion')
 */
export async function enviarNotificacionAprobacion(destinatario, nombreDestinatario, nombreDocumento, tokenFirma, remitente, documentoId = null, aprobadorId = null, tipoCorreo = 'aprobacion') {
  // Si se proporciona documentoId, verificar duplicados
  if (documentoId) {
    const verificacion = await verificarYRegistrarCorreo(destinatario, documentoId, tipoCorreo, tokenFirma, aprobadorId);
    if (verificacion.yaEnviado) {
      console.log(`⏭ Correo de ${tipoCorreo} omitido (duplicado) a ${destinatario} para documento ${documentoId}`);
      return { success: true, skipped: true, reason: 'duplicate' };
    }
  }

  const enlaceAprobacion = `${process.env.FRONTEND_URL}/aprobar/${tokenFirma}`;
  
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: destinatario,
    subject: `Solicitud de aprobación: ${nombreDocumento}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Solicitud de Aprobación de Documento</h2>
        <p>Hola <strong>${nombreDestinatario}</strong>,</p>
        <p><strong>${remitente}</strong> ha solicitado tu aprobación para el siguiente documento:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Documento:</strong> ${nombreDocumento}</p>
        </div>
        <p>Para revisar y aprobar el documento, haz clic en el siguiente enlace:</p>
        <a href="${enlaceAprobacion}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0;">
          Revisar y Aprobar Documento
        </a>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          Si no puedes hacer clic en el botón, copia y pega el siguiente enlace en tu navegador:<br>
          <a href="${enlaceAprobacion}">${enlaceAprobacion}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px;">
          Este es un correo automático generado por el Sistema de Aprobaciones. Por favor no respondas a este mensaje.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✓ Correo enviado a ${destinatario}`);
    return { success: true };
  } catch (error) {
    console.error('Error al enviar correo:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Enviar correo de notificación de rechazo a Calidad
 */
export async function enviarNotificacionRechazo(nombreDocumento, nombreAprobador, motivoRechazo, documentoId) {
  const enlaceDocumento = `${process.env.FRONTEND_URL}/documentos/${documentoId}`;
  
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_CALIDAD,
    subject: `Documento Rechazado: ${nombreDocumento}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Documento Rechazado</h2>
        <p>Se ha rechazado un documento en el sistema de aprobaciones:</p>
        <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid #dc2626; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Documento:</strong> ${nombreDocumento}</p>
          <p style="margin: 5px 0;"><strong>Rechazado por:</strong> ${nombreAprobador}</p>
          <p style="margin: 5px 0;"><strong>Motivo:</strong></p>
          <p style="margin: 10px 0; padding: 10px; background-color: white; border-radius: 4px;">${motivoRechazo}</p>
        </div>
        <p>Para revisar el documento y tomar acciones, accede al siguiente enlace:</p>
        <a href="${enlaceDocumento}" style="display: inline-block; background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0;">
          Ver Documento
        </a>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px;">
          Este es un correo automático generado por el Sistema de Aprobaciones.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✓ Notificación de rechazo enviada a Calidad`);
    return { success: true };
  } catch (error) {
    console.error('Error al enviar notificación de rechazo:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Enviar correo de notificación de rechazo a participantes
 * @param {string} destinatario - Correo del destinatario
 * @param {string} nombreDestinatario - Nombre del destinatario
 * @param {string} nombreDocumento - Nombre del documento
 * @param {string} nombreAprobador - Nombre del aprobador que rechazó
 * @param {string} motivoRechazo - Motivo del rechazo
 * @param {number} documentoId - ID del documento
 */
export async function enviarNotificacionRechazoParticipante(destinatario, nombreDestinatario, nombreDocumento, nombreAprobador, motivoRechazo, documentoId) {
  if (!destinatario) {
    return { success: false, error: 'Destinatario no proporcionado' };
  }

  if (!documentoId) {
    console.error('Error: documentoId es requerido para enviarNotificacionRechazoParticipante');
    return { success: false, error: 'documentoId requerido' };
  }

  // Verificar duplicados
  const verificacion = await verificarYRegistrarCorreo(destinatario, documentoId, 'rechazo', null, null);
  if (verificacion.yaEnviado) {
    console.log(`⏭ Correo de rechazo omitido (duplicado) a ${destinatario} para documento ${documentoId}`);
    return { success: true, skipped: true, reason: 'duplicate' };
  }

  const enlaceDocumento = `${process.env.FRONTEND_URL}/documentos/${documentoId}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: destinatario,
    subject: `Documento rechazado: ${nombreDocumento}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Documento Rechazado</h2>
        <p>Hola <strong>${nombreDestinatario}</strong>,</p>
        <p>El documento <strong>${nombreDocumento}</strong> ha sido rechazado por <strong>${nombreAprobador}</strong>.</p>
        <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid #dc2626; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Motivo proporcionado:</strong></p>
          <p style="margin: 10px 0; padding: 10px; background-color: white; border-radius: 4px;">${motivoRechazo}</p>
        </div>
        <p>Puedes revisar los detalles del documento en el siguiente enlace:</p>
        <a href="${enlaceDocumento}" style="display: inline-block; background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0;">
          Ver Documento
        </a>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px;">
          Este es un correo automático generado por el Sistema de Aprobaciones.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✓ Notificación de rechazo enviada a ${destinatario}`);
    return { success: true };
  } catch (error) {
    console.error(`Error al enviar notificación de rechazo a ${destinatario}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Enviar correo de notificación de nueva versión
 * @param {string} destinatario - Correo del destinatario
 * @param {string} nombreDestinatario - Nombre del destinatario
 * @param {string} nombreDocumento - Nombre del documento
 * @param {string} tokenFirma - Token de firma
 * @param {number} version - Versión del documento
 * @param {number} documentoId - ID del documento (opcional, para deduplicación)
 * @param {number} aprobadorId - ID del aprobador (opcional, para deduplicación)
 */
export async function enviarNotificacionNuevaVersion(destinatario, nombreDestinatario, nombreDocumento, tokenFirma, version, documentoId = null, aprobadorId = null) {
  // Si se proporciona documentoId, verificar duplicados
  if (documentoId) {
    const verificacion = await verificarYRegistrarCorreo(destinatario, documentoId, 'nueva_version', tokenFirma, aprobadorId);
    if (verificacion.yaEnviado) {
      console.log(`⏭ Correo de nueva versión omitido (duplicado) a ${destinatario} para documento ${documentoId}`);
      return { success: true, skipped: true, reason: 'duplicate' };
    }
  }

  const enlaceAprobacion = `${process.env.FRONTEND_URL}/aprobar/${tokenFirma}`;
  
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: destinatario,
    subject: `Nueva versión del documento: ${nombreDocumento}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Nueva Versión de Documento</h2>
        <p>Hola <strong>${nombreDestinatario}</strong>,</p>
        <p>Se ha subido una nueva versión del documento que requiere tu aprobación:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Documento:</strong> ${nombreDocumento}</p>
          <p style="margin: 5px 0;"><strong>Versión:</strong> ${version}</p>
        </div>
        <p>Para revisar y aprobar la nueva versión, haz clic en el siguiente enlace:</p>
        <a href="${enlaceAprobacion}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0;">
          Revisar Nueva Versión
        </a>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          Si no puedes hacer clic en el botón, copia y pega el siguiente enlace en tu navegador:<br>
          <a href="${enlaceAprobacion}">${enlaceAprobacion}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px;">
          Este es un correo automático generado por el Sistema de Aprobaciones.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✓ Correo de nueva versión enviado a ${destinatario}`);
    return { success: true };
  } catch (error) {
    console.error('Error al enviar correo de nueva versión:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Enviar correo de documento completamente aprobado
 * @param {string} destinatario - Correo del destinatario
 * @param {string} nombreDestinatario - Nombre del destinatario
 * @param {string} nombreDocumento - Nombre del documento
 * @param {number} documentoId - ID del documento
 */
export async function enviarNotificacionAprobacionCompleta(destinatario, nombreDestinatario, nombreDocumento, documentoId) {
  if (!documentoId) {
    console.error('Error: documentoId es requerido para enviarNotificacionAprobacionCompleta');
    return { success: false, error: 'documentoId requerido' };
  }

  // Verificar duplicados
  const verificacion = await verificarYRegistrarCorreo(destinatario, documentoId, 'aprobacion_completa', null, null);
  if (verificacion.yaEnviado) {
    console.log(`⏭ Correo de aprobación completa omitido (duplicado) a ${destinatario} para documento ${documentoId}`);
    return { success: true, skipped: true, reason: 'duplicate' };
  }

  const enlaceDocumento = `${process.env.FRONTEND_URL}/documentos/${documentoId}`;
  
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: destinatario,
    subject: `Documento aprobado: ${nombreDocumento}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Documento Aprobado Completamente</h2>
        <p>Hola <strong>${nombreDestinatario}</strong>,</p>
        <p>El documento que subiste ha sido aprobado por todos los responsables:</p>
        <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; border-left: 4px solid #16a34a; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Documento:</strong> ${nombreDocumento}</p>
          <p style="margin: 5px 0; color: #16a34a;"><strong>Estado:</strong> ✓ Aprobado</p>
        </div>
        <p>El PDF final con todas las firmas digitales está disponible en:</p>
        <a href="${enlaceDocumento}" style="display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0;">
          Descargar Documento Firmado
        </a>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px;">
          Este es un correo automático generado por el Sistema de Aprobaciones.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✓ Notificación de aprobación completa enviada a ${destinatario}`);
    return { success: true };
  } catch (error) {
    console.error('Error al enviar notificación de aprobación completa:', error);
    return { success: false, error: error.message };
  }
}
