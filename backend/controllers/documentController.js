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
      const correoGrupo = aprobador.correo_grupo || aprobador.correoGrupo || null;
      const rawUsuarioId = aprobador.usuario_id ?? aprobador.usuarioId ?? aprobador.id;
      const usuarioId = Number(rawUsuarioId);
      if (Number.isNaN(usuarioId)) {
        throw new Error(`ID de usuario inválido para el aprobador "${aprobador.nombre}"`);
      }

      const rawGrupoMiembroId = aprobador.grupo_miembro_id ?? aprobador.grupoMiembroId ?? null;
      const grupoMiembroId = rawGrupoMiembroId !== null && rawGrupoMiembroId !== undefined
        ? Number(rawGrupoMiembroId)
        : null;
      if (grupoMiembroId !== null && Number.isNaN(grupoMiembroId)) {
        throw new Error(`ID de miembro del grupo inválido para el aprobador "${aprobador.nombre}"`);
      }

      await client.query(
        `INSERT INTO aprobadores (
          documento_id, usuario_id, usuario_nombre, usuario_correo,
          rol_aprobacion, orden_aprobacion, token_firma, estado,
          posicion_x, posicion_y, pagina_firma, ancho_firma, alto_firma,
          correo_grupo, grupo_miembro_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          documento.id,
          usuarioId,
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
          aprobador.alto_firma || 75,
          correoGrupo,
          grupoMiembroId
        ]
      );

      // Enviar correo de notificación
      await enviarNotificacionAprobacion(
        aprobador.correo,
        aprobador.nombre,
        req.file.originalname,
        tokenFirma,
        documento.usuario_creador_nombre
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
 * Obtener documentos del usuario actual (solo la versión más reciente de cada documento)
 * Si el usuario es diego.castillo@fastprobags.com, puede ver todos los documentos
 */
export async function obtenerMisDocumentos(req, res) {
  try {
    // Verificar si el usuario es diego.castillo@fastprobags.com (puede ver todos los documentos)
    const esAdmin = req.user.correo && req.user.correo.toLowerCase().trim() === 'diego.castillo@fastprobags.com';
    
    // Obtener solo la versión más reciente de cada documento
    // Agrupamos por documento_padre_id (si existe) o por id (si es documento raíz)
    const query = esAdmin
      ? `WITH documentos_con_raiz AS (
          SELECT 
            d.*,
            COALESCE(d.documento_padre_id, d.id) as documento_raiz_id,
            (SELECT COUNT(*) FROM aprobadores a WHERE a.documento_id = d.id) as total_aprobadores,
            (SELECT COUNT(*) FROM aprobadores a WHERE a.documento_id = d.id AND a.estado = 'aprobado') as aprobadores_completados
          FROM documentos d
        ),
        versiones_por_raiz AS (
          SELECT 
            *,
            ROW_NUMBER() OVER (
              PARTITION BY documento_raiz_id 
              ORDER BY version DESC, fecha_creacion DESC
            ) as rn
          FROM documentos_con_raiz
        )
        SELECT 
          id, nombre_archivo, ruta_archivo, tipo_documento, descripcion, version,
          documento_padre_id, usuario_creador_id, usuario_creador_nombre, usuario_creador_correo,
          estado, token_acceso, fecha_creacion, fecha_actualizacion, fecha_finalizacion,
          tiempo_limite_horas, intervalo_recordatorio_minutos, fecha_limite_aprobacion,
          total_aprobadores, aprobadores_completados
        FROM versiones_por_raiz
        WHERE rn = 1
        ORDER BY fecha_creacion DESC`
      : `WITH documentos_con_raiz AS (
          SELECT 
            d.*,
            COALESCE(d.documento_padre_id, d.id) as documento_raiz_id,
            (SELECT COUNT(*) FROM aprobadores a WHERE a.documento_id = d.id) as total_aprobadores,
            (SELECT COUNT(*) FROM aprobadores a WHERE a.documento_id = d.id AND a.estado = 'aprobado') as aprobadores_completados
          FROM documentos d
          WHERE d.usuario_creador_id = $1
        ),
        versiones_por_raiz AS (
          SELECT 
            *,
            ROW_NUMBER() OVER (
              PARTITION BY documento_raiz_id 
              ORDER BY version DESC, fecha_creacion DESC
            ) as rn
          FROM documentos_con_raiz
        )
        SELECT 
          id, nombre_archivo, ruta_archivo, tipo_documento, descripcion, version,
          documento_padre_id, usuario_creador_id, usuario_creador_nombre, usuario_creador_correo,
          estado, token_acceso, fecha_creacion, fecha_actualizacion, fecha_finalizacion,
          tiempo_limite_horas, intervalo_recordatorio_minutos, fecha_limite_aprobacion,
          total_aprobadores, aprobadores_completados
        FROM versiones_por_raiz
        WHERE rn = 1
        ORDER BY fecha_creacion DESC`;
    
    const result = await pool.query(query, esAdmin ? [] : [req.user.id]);

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
    // Obtener NumeroNomina del usuario si está disponible
    const numeroNomina = req.user.NumeroNomina || null;
    const correoUsuario = req.user.correo || null;
    const usuarioId = req.user.id;

    const result = await pool.query(
      `SELECT DISTINCT d.*, a.id as aprobador_id, a.rol_aprobacion, a.orden_aprobacion, 
        a.estado as mi_estado, a.token_firma
       FROM documentos d
       INNER JOIN aprobadores a ON d.id = a.documento_id
       WHERE a.estado = 'pendiente'
         AND (
           -- Caso normal: el usuario es el aprobador directo
           a.usuario_id = $1
           OR
           -- Caso grupo: el usuario se logueó con el correo del grupo
           (
             a.correo_grupo IS NOT NULL
             AND $2::VARCHAR IS NOT NULL
             AND LOWER(TRIM(a.correo_grupo)) = LOWER(TRIM($2::VARCHAR))
           )
           OR
           -- Caso grupo: el usuario es miembro activo del grupo (por si se loguea con correo individual)
           (
             a.correo_grupo IS NOT NULL
             AND EXISTS (
               SELECT 1 
               FROM grupo_firmantes gf
               WHERE gf.correo_grupo = a.correo_grupo
                 AND gf.activo = TRUE
                 AND (
                   -- Buscar por correo del miembro (si está configurado y coincide)
                   ($2::VARCHAR IS NOT NULL AND gf.miembro_correo IS NOT NULL AND LOWER(TRIM(gf.miembro_correo)) = LOWER(TRIM($2::VARCHAR)))
                   -- Buscar por número de nómina en miembro_usuario_id (puede contener NumeroNomina)
                   OR ($3::VARCHAR IS NOT NULL AND gf.miembro_usuario_id IS NOT NULL AND TRIM(gf.miembro_usuario_id::VARCHAR) = TRIM($3::VARCHAR))
                   -- Buscar por número de nómina en miembro_numero_nomina
                   OR ($3::VARCHAR IS NOT NULL AND gf.miembro_numero_nomina IS NOT NULL AND TRIM(gf.miembro_numero_nomina) = TRIM($3::VARCHAR))
                   -- Buscar por usuario_id del miembro (si está configurado como ID real de Usuarios)
                   OR ($1::INTEGER IS NOT NULL AND gf.miembro_usuario_id IS NOT NULL AND gf.miembro_usuario_id::INTEGER = $1::INTEGER)
                 )
             )
           )
         )
       ORDER BY d.fecha_creacion DESC`,
      [usuarioId, correoUsuario || null, numeroNomina || null]
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

    // Obtener información del usuario
    const numeroNomina = req.user.NumeroNomina || null;
    const correoUsuario = req.user.correo || null;
    const usuarioId = req.user.id;

    // Verificar si el usuario es diego.castillo@fastprobags.com (puede ver todos los documentos)
    const esAdmin = req.user.correo && req.user.correo.toLowerCase().trim() === 'diego.castillo@fastprobags.com';

    // Verificar que el usuario tenga permiso para descargar
    let tienePermiso = false;

    // 0. Si es admin, tiene permiso automáticamente
    if (esAdmin) {
      tienePermiso = true;
    }
    // 1. Verificar si es el creador
    else if (documento.usuario_creador_id === usuarioId) {
      tienePermiso = true;
    } else {
      // 2. Verificar si es un aprobador directo o miembro de grupo
      const aprobadorResult = await pool.query(
        `SELECT a.* FROM aprobadores a
         WHERE a.documento_id = $1 
         AND (
           -- Aprobador directo
           a.usuario_id = $2
           OR
           -- Usuario se logueó con el correo del grupo
           ($3::VARCHAR IS NOT NULL AND a.correo_grupo IS NOT NULL AND LOWER(TRIM(a.correo_grupo)) = LOWER(TRIM($3::VARCHAR)))
           OR
           -- Usuario es miembro activo del grupo aprobador
           (
             a.correo_grupo IS NOT NULL
             AND EXISTS (
               SELECT 1 
               FROM grupo_firmantes gf
               WHERE gf.correo_grupo = a.correo_grupo
                 AND gf.activo = TRUE
                 AND (
                   -- Buscar por correo del miembro
                   ($3::VARCHAR IS NOT NULL AND gf.miembro_correo IS NOT NULL AND LOWER(TRIM(gf.miembro_correo)) = LOWER(TRIM($3::VARCHAR)))
                   -- Buscar por número de nómina en miembro_usuario_id
                   OR ($4::VARCHAR IS NOT NULL AND gf.miembro_usuario_id IS NOT NULL AND TRIM(gf.miembro_usuario_id::VARCHAR) = TRIM($4::VARCHAR))
                   -- Buscar por número de nómina en miembro_numero_nomina
                   OR ($4::VARCHAR IS NOT NULL AND gf.miembro_numero_nomina IS NOT NULL AND TRIM(gf.miembro_numero_nomina) = TRIM($4::VARCHAR))
                   -- Buscar por usuario_id del miembro
                   OR ($2::INTEGER IS NOT NULL AND gf.miembro_usuario_id IS NOT NULL AND gf.miembro_usuario_id::INTEGER = $2::INTEGER)
                 )
             )
           )
         )`,
        [id, usuarioId, correoUsuario, numeroNomina]
      );

      if (aprobadorResult.rows.length > 0) {
        tienePermiso = true;
      }
    }

    if (!tienePermiso) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para descargar este documento'
      });
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
 * Descargar PDF usando token del documento
 */
export async function descargarDocumentoPorToken(req, res) {
  try {
    const { token } = req.params;

    // Obtener documento y aprobador por token
    const result = await pool.query(
      `SELECT d.*, a.id as aprobador_id
       FROM documentos d
       INNER JOIN aprobadores a ON d.id = a.documento_id
       WHERE a.token_firma = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Token inválido o documento no encontrado'
      });
    }

    const documento = result.rows[0];

    // Registrar descarga en auditoría (si hay información del usuario)
    if (req.user && req.user.id) {
      await pool.query(
        `INSERT INTO log_auditoria (
          documento_id, usuario_id, usuario_nombre, usuario_correo,
          accion, descripcion, ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          documento.id,
          req.user.id,
          req.user.nombre,
          req.user.correo,
          'descarga',
          `Documento descargado por ${req.user.nombre} (token)`,
          req.ip
        ]
      );
    }

    // Enviar el archivo
    res.download(documento.ruta_archivo, documento.nombre_archivo);

  } catch (error) {
    console.error('Error al descargar documento por token:', error);
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
      const rawUsuarioId = mantenerPosiciones
        ? aprobador.usuario_id
        : (aprobador.usuario_id ?? aprobador.usuarioId ?? aprobador.id);
      const usuarioId = Number(rawUsuarioId);

      if (Number.isNaN(usuarioId)) {
        throw new Error(`ID de usuario inválido para el aprobador "${aprobador.nombre || aprobador.usuario_nombre}"`);
      }

      const usuarioNombre = mantenerPosiciones ? aprobador.usuario_nombre : aprobador.nombre;
      const usuarioCorreo = mantenerPosiciones ? aprobador.usuario_correo : aprobador.correo;
      const rol = mantenerPosiciones ? aprobador.rol_aprobacion : (aprobador.rol || 'aprobador');
      const correoGrupo = mantenerPosiciones
        ? aprobador.correo_grupo
        : (aprobador.correo_grupo || aprobador.correoGrupo || null);

      const rawGrupoMiembroId = mantenerPosiciones
        ? aprobador.grupo_miembro_id
        : (aprobador.grupo_miembro_id ?? aprobador.grupoMiembroId ?? null);

      const grupoMiembroId = rawGrupoMiembroId !== null && rawGrupoMiembroId !== undefined
        ? Number(rawGrupoMiembroId)
        : null;

      if (grupoMiembroId !== null && Number.isNaN(grupoMiembroId)) {
        throw new Error(`ID de miembro de grupo inválido para el aprobador "${aprobador.nombre || aprobador.usuario_nombre}"`);
      }

      await client.query(
        `INSERT INTO aprobadores (
          documento_id, usuario_id, usuario_nombre, usuario_correo,
          rol_aprobacion, orden_aprobacion, token_firma, estado,
          posicion_x, posicion_y, pagina_firma, ancho_firma, alto_firma,
          correo_grupo, grupo_miembro_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          nuevoDocumento.id,
          usuarioId,
          usuarioNombre,
          usuarioCorreo,
          rol,
          i + 1,
          tokenFirma,
          'pendiente',
          aprobador.posicion_x || 50,
          aprobador.posicion_y || 50,
          aprobador.pagina_firma || -1,
          aprobador.ancho_firma || 150,
          aprobador.alto_firma || 75,
          correoGrupo,
          grupoMiembroId
        ]
      );

      // Enviar correo de notificación de nueva versión a TODOS los aprobadores
      await enviarNotificacionNuevaVersion(
        usuarioCorreo,
        usuarioNombre,
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
          usuarioId,
          usuarioNombre,
          usuarioCorreo,
          'notificacion',
          `Correo de nueva versión enviado a ${usuarioNombre}`,
          req.ip
        ]
      );
    }

    // Actualizar último recordatorio para evitar que el job de recordatorios envíe correos inmediatamente
    await client.query(
      `UPDATE documentos 
       SET ultimo_recordatorio_enviado = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [nuevoDocumento.id]
    );

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
