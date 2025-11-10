import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

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
 * Enviar correo de notificación de aprobación
 */
export async function enviarNotificacionAprobacion(destinatario, nombreDestinatario, nombreDocumento, tokenFirma, remitente) {
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
 * Enviar correo de notificación de nueva versión
 */
export async function enviarNotificacionNuevaVersion(destinatario, nombreDestinatario, nombreDocumento, tokenFirma, version) {
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
 */
export async function enviarNotificacionAprobacionCompleta(destinatario, nombreDestinatario, nombreDocumento, documentoId) {
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
