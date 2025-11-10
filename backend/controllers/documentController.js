import pool from '../config/postgres.js';
import { getSqlConnection, sql } from '../config/sqlserver.js';
import { 
  enviarNotificacionAprobacion, 
  enviarNotificacionNuevaVersion,
  enviarNotificacionRechazo,
  enviarNotificacionAprobacionCompleta 
} from '../utils/mailer.js';
import { 
  insertarFirmaEnPDF, 
  insertarMultiplesFirmasEnPDF, 
  agregarPaginaAuditoria 
} from '../utils/pdfSigner.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Subir un nuevo documento PDF
 */
export async function subirDocumento(req, res) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se ha subido ningún archivo'
      });
    }

    const { tipoDocumento, descripcion, aprobadores, tiempoLimiteHoras, intervaloRecordatorioMinutos } = req.body;
    
    if (!aprobadores || aprobadores.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe especificar al menos un aprobador'
      });
    }

    const aprobadoresArray = JSON.parse(aprobadores);

    // Generar token único de acceso
    const tokenAcceso = crypto.randomBytes(32).toString('hex');
    
    // Calcular fecha límite si se especificó
    let fechaLimite = null;
    if (tiempoLimiteHoras) {
      const horas = parseInt(tiempoLimiteHoras);
      fechaLimite = new Date();
      fechaLimite.setHours(fechaLimite.getHours() + horas);
    }

    // Insertar documento en la base de datos
    const resultDocumento = await client.query(
      `INSERT INTO documentos (
        nombre_archivo, ruta_archivo, tipo_documento, descripcion, version,
        usuario_creador_id, usuario_creador_nombre, usuario_creador_correo,
        token_acceso, estado, tiempo_limite_horas, intervalo_recordatorio_minutos,
        fecha_limite_aprobacion
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        req.file.originalname,
        req.file.path,
        tipoDocumento,
        descripcion,
        1, // versión inicial
        req.user.id,
        req.user.nombre,
        req.user.correo,
        tokenAcceso,
        'pendiente',
        tiempoLimiteHoras ? parseInt(tiempoLimiteHoras) : null,
        intervaloRecordatorioMinutos ? parseInt(intervaloRecordatorioMinutos) : null,
        fechaLimite
      ]
    );

    const documento = resultDocumento.rows[0];

    // Insertar aprobadores y enviar correos
    for (let i = 0; i < aprobadoresArray.length; i++) {
      const aprobador = aprobadoresArray[i];
      const tokenFirma = crypto.randomBytes(32).toString('hex');

      await client.query(
        `INSERT INTO aprobadores (
          documento_id, usuario_id, usuario_nombre, usuario_correo,
          rol_aprobacion, orden_aprobacion, token_firma, estado,
          posicion_x, posicion_y, pagina_firma, ancho_firma, alto_firma
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          documento.id,
          aprobador.id,
          aprobador.nombre,
          aprobador.correo,
          aprobador.rol || 'aprobador',
          i + 1,
          tokenFirma,
          'pendiente',
          aprobador.posicion_x || 50,
          aprobador.posicion_y || 50,
          aprobador.pagina_firma || -1,
          aprobador.ancho_firma || 150,
          aprobador.alto_firma || 75
        ]
      );

      // Enviar correo de notificación
      await enviarNotificacionAprobacion(
        aprobador.correo,
        aprobador.nombre,
        req.file.originalname,
        tokenFirma,
        req.user.nombre
      );

      // Registrar envío de correo en auditoría
      await client.query(
        `INSERT INTO log_auditoria (
          documento_id, usuario_id, usuario_nombre, usuario_correo,
          accion, descripcion, ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          documento.id,
          aprobador.id,
          aprobador.nombre,
          aprobador.correo,
          'notificacion',
          `Correo de solicitud de aprobación enviado a ${aprobador.nombre}`,
          req.ip
        ]
      );
    }

    // Registrar subida en auditoría
    await client.query(
      `INSERT INTO log_auditoria (
        documento_id, usuario_id, usuario_nombre, usuario_correo,
        accion, descripcion, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        documento.id,
        req.user.id,
        req.user.nombre,
        req.user.correo,
        'subida',
        `Documento "${req.file.originalname}" subido al sistema`,
        req.ip,
        req.get('user-agent')
      ]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Documento subido exitosamente',
      documento: documento
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al subir documento:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al subir el documento',
      error: error.message
    });
  } finally {
    client.release();
  }
}

/**
 * Obtener documentos del usuario actual
 */
export async function obtenerMisDocumentos(req, res) {
  try {
    const result = await pool.query(
      `SELECT d.*, 
        (SELECT COUNT(*) FROM aprobadores a WHERE a.documento_id = d.id) as total_aprobadores,
        (SELECT COUNT(*) FROM aprobadores a WHERE a.documento_id = d.id AND a.estado = 'aprobado') as aprobadores_completados
       FROM documentos d
       WHERE d.usuario_creador_id = $1
       ORDER BY d.fecha_creacion DESC`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      documentos: result.rows
    });

  } catch (error) {
    console.error('Error al obtener documentos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener documentos'
    });
  }
}

/**
 * Obtener documentos pendientes de aprobación del usuario
 */
export async function obtenerDocumentosPendientes(req, res) {
  try {
    const result = await pool.query(
      `SELECT d.*, a.id as aprobador_id, a.rol_aprobacion, a.orden_aprobacion, 
        a.estado as mi_estado, a.token_firma
       FROM documentos d
       INNER JOIN aprobadores a ON d.id = a.documento_id
       WHERE a.usuario_id = $1 AND a.estado = 'pendiente'
       ORDER BY d.fecha_creacion DESC`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      documentos: result.rows
    });

  } catch (error) {
    console.error('Error al obtener documentos pendientes:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener documentos pendientes'
    });
  }
}

/**
 * Obtener detalle de un documento por token de firma
 */
export async function obtenerDocumentoPorToken(req, res) {
  try {
    const { token } = req.params;

    const result = await pool.query(
      `SELECT d.*, a.id as aprobador_id, a.usuario_id as aprobador_usuario_id,
        a.usuario_nombre as aprobador_nombre, a.estado as estado_aprobacion
       FROM documentos d
       INNER JOIN aprobadores a ON d.id = a.documento_id
       WHERE a.token_firma = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Documento no encontrado o token inválido'
      });
    }

    const documento = result.rows[0];

    // Obtener todos los aprobadores del documento
    const aprobadoresResult = await pool.query(
      `SELECT * FROM aprobadores WHERE documento_id = $1 ORDER BY orden_aprobacion`,
      [documento.id]
    );

    documento.aprobadores = aprobadoresResult.rows;

    return res.status(200).json({
      success: true,
      documento: documento
    });

  } catch (error) {
    console.error('Error al obtener documento por token:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener el documento'
    });
  }
}

/**
 * Descargar PDF de un documento
 */
export async function descargarDocumento(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM documentos WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Documento no encontrado'
      });
    }

    const documento = result.rows[0];

    // Verificar que el usuario tenga permiso para descargar
    if (documento.usuario_creador_id !== req.user.id) {
      // Verificar si es un aprobador
      const aprobadorResult = await pool.query(
        `SELECT * FROM aprobadores WHERE documento_id = $1 AND usuario_id = $2`,
        [id, req.user.id]
      );

      if (aprobadorResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permiso para descargar este documento'
        });
      }
    }

    // Registrar descarga en auditoría
    await pool.query(
      `INSERT INTO log_auditoria (
        documento_id, usuario_id, usuario_nombre, usuario_correo,
        accion, descripcion, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        req.user.id,
        req.user.nombre,
        req.user.correo,
        'descarga',
        `Documento descargado por ${req.user.nombre}`,
        req.ip
      ]
    );

    // Enviar el archivo
    res.download(documento.ruta_archivo, documento.nombre_archivo);

  } catch (error) {
    console.error('Error al descargar documento:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al descargar el documento'
    });
  }
}

/**
 * Obtener documento por ID
 */
export async function obtenerDocumentoPorId(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM documentos WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Documento no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      documento: result.rows[0]
    });

  } catch (error) {
    console.error('Error al obtener documento:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener el documento'
    });
  }
}

/**
 * Obtener aprobadores de un documento
 */
export async function obtenerAprobadoresDocumento(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM aprobadores WHERE documento_id = $1 ORDER BY orden_aprobacion`,
      [id]
    );

    return res.status(200).json({
      success: true,
      aprobadores: result.rows
    });

  } catch (error) {
    console.error('Error al obtener aprobadores:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener aprobadores'
    });
  }
}

/**
 * Obtener historial de versiones de un documento
 */
export async function obtenerHistorialVersiones(req, res) {
  try {
    const { id } = req.params;

    // Primero obtener el documento actual
    const docActual = await pool.query(
      `SELECT * FROM documentos WHERE id = $1`,
      [id]
    );

    if (docActual.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Documento no encontrado'
      });
    }

    const documento = docActual.rows[0];
    
    // Encontrar el documento raíz
    // Si tiene documento_padre_id, ese es el raíz, sino él mismo es la raíz
    const documentoRaizId = documento.documento_padre_id || id;

    console.log(`[DEBUG] Documento ID: ${id}, Documento Padre ID: ${documento.documento_padre_id}, Raíz ID: ${documentoRaizId}`);

    // Obtener todas las versiones (incluyendo la raíz)
    // Buscar: el documento raíz mismo Y todos los que tienen ese raíz como padre
    const versiones = await pool.query(
      `SELECT d.*, 
        (SELECT COUNT(*) FROM aprobadores a WHERE a.documento_id = d.id AND a.estado = 'aprobado') as aprobados,
        (SELECT COUNT(*) FROM aprobadores a WHERE a.documento_id = d.id) as total_aprobadores
       FROM documentos d
       WHERE d.id = $1 OR d.documento_padre_id = $1
       ORDER BY d.version ASC`,
      [documentoRaizId]
    );

    console.log(`[DEBUG] Versiones encontradas: ${versiones.rows.length}`);
    versiones.rows.forEach(v => {
      console.log(`  - ID: ${v.id}, Versión: ${v.version}, Padre: ${v.documento_padre_id}, Estado: ${v.estado}`);
    });

    return res.status(200).json({
      success: true,
      versiones: versiones.rows,
      documentoRaizId: documentoRaizId
    });

  } catch (error) {
    console.error('Error al obtener historial:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener el historial de versiones'
    });
  }
}

/**
 * Subir nueva versión de un documento rechazado
 */
export async function subirNuevaVersion(req, res) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se ha subido ningún archivo'
      });
    }

    const { id } = req.params;
    const { aprobadores, mantenerPosiciones } = req.body;

    // Obtener documento anterior
    const docResult = await client.query(
      `SELECT * FROM documentos WHERE id = $1`,
      [id]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Documento no encontrado'
      });
    }

    const documentoAnterior = docResult.rows[0];

    // Verificar que el usuario es el creador
    if (documentoAnterior.usuario_creador_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para subir una nueva versión de este documento'
      });
    }

    // Verificar que el documento está rechazado
    if (documentoAnterior.estado !== 'rechazado') {
      return res.status(400).json({
        success: false,
        message: 'Solo se puede subir una nueva versión de documentos rechazados'
      });
    }

    // Encontrar el documento raíz de la cadena
    let documentoRaizId = documentoAnterior.documento_padre_id || id;

    // Generar nuevo token de acceso
    const tokenAcceso = crypto.randomBytes(32).toString('hex');

    // Crear nuevo documento que apunta al documento raíz
    const resultNuevoDoc = await client.query(
      `INSERT INTO documentos (
        nombre_archivo, ruta_archivo, tipo_documento, descripcion, version,
        documento_padre_id, usuario_creador_id, usuario_creador_nombre, 
        usuario_creador_correo, token_acceso, estado
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        req.file.originalname,
        req.file.path,
        documentoAnterior.tipo_documento,
        documentoAnterior.descripcion,
        documentoAnterior.version + 1,
        documentoRaizId,
        req.user.id,
        req.user.nombre,
        req.user.correo,
        tokenAcceso,
        'pendiente'
      ]
    );

    const nuevoDocumento = resultNuevoDoc.rows[0];

    // Obtener aprobadores del documento anterior
    const aprobadoresAnteriores = await client.query(
      `SELECT * FROM aprobadores WHERE documento_id = $1 ORDER BY orden_aprobacion`,
      [id]
    );

    let aprobadoresData;
    if (mantenerPosiciones === 'true' || mantenerPosiciones === true) {
      // Mantener las mismas posiciones del documento anterior
      aprobadoresData = aprobadoresAnteriores.rows;
    } else {
      // Usar las nuevas posiciones enviadas desde el frontend
      aprobadoresData = JSON.parse(aprobadores);
    }

    // Insertar aprobadores para el nuevo documento
    for (let i = 0; i < aprobadoresData.length; i++) {
      const aprobador = aprobadoresData[i];
      const tokenFirma = crypto.randomBytes(32).toString('hex');

      // Si mantenemos posiciones, usamos los datos del aprobador anterior
      // Si no, usamos los datos enviados desde el frontend
      const usuario_id = mantenerPosiciones ? aprobador.usuario_id : aprobador.id;
      const usuario_nombre = mantenerPosiciones ? aprobador.usuario_nombre : aprobador.nombre;
      const usuario_correo = mantenerPosiciones ? aprobador.usuario_correo : aprobador.correo;
      const rol = mantenerPosiciones ? aprobador.rol_aprobacion : (aprobador.rol || 'aprobador');

      await client.query(
        `INSERT INTO aprobadores (
          documento_id, usuario_id, usuario_nombre, usuario_correo,
          rol_aprobacion, orden_aprobacion, token_firma, estado,
          posicion_x, posicion_y, pagina_firma, ancho_firma, alto_firma
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          nuevoDocumento.id,
          usuario_id,
          usuario_nombre,
          usuario_correo,
          rol,
          i + 1,
          tokenFirma,
          'pendiente',
          aprobador.posicion_x || 50,
          aprobador.posicion_y || 50,
          aprobador.pagina_firma || -1,
          aprobador.ancho_firma || 150,
          aprobador.alto_firma || 75
        ]
      );

      // Verificar si este aprobador ya aprobó en la versión anterior
      const yaAprobo = aprobadoresAnteriores.rows.find(
        a => a.usuario_id === usuario_id && a.estado === 'aprobado'
      );

      // Solo enviar correo si no aprobó en la versión anterior
      if (!yaAprobo) {
        await enviarNotificacionNuevaVersion(
          usuario_correo,
          usuario_nombre,
          req.file.originalname,
          tokenFirma,
          nuevoDocumento.version
        );

        // Registrar envío de correo en auditoría
        await client.query(
          `INSERT INTO log_auditoria (
            documento_id, usuario_id, usuario_nombre, usuario_correo,
            accion, descripcion, ip_address
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            nuevoDocumento.id,
            usuario_id,
            usuario_nombre,
            usuario_correo,
            'notificacion',
            `Correo de nueva versión enviado a ${usuario_nombre}`,
            req.ip
          ]
        );
      }
    }

    // Registrar subida de nueva versión en auditoría
    await client.query(
      `INSERT INTO log_auditoria (
        documento_id, usuario_id, usuario_nombre, usuario_correo,
        accion, descripcion, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        nuevoDocumento.id,
        req.user.id,
        req.user.nombre,
        req.user.correo,
        'nueva_version',
        `Nueva versión (v${nuevoDocumento.version}) del documento "${req.file.originalname}" subida al sistema`,
        req.ip,
        req.get('user-agent')
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Nueva versión subida exitosamente',
      documentoId: nuevoDocumento.id,
      documentoPadreId: documentoRaizId
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al subir nueva versión:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al subir la nueva versión',
      error: error.message
    });
  } finally {
    client.release();
  }
}
