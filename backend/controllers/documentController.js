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
import { PDFDocument, rgb } from 'pdf-lib';
import crypto from 'crypto';
import { esAdminDesdeRequest } from '../utils/adminHelper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Normalizar nombre de archivo para asegurar codificación UTF-8 correcta
 * @param {string} filename - Nombre del archivo original
 * @returns {string} - Nombre normalizado en UTF-8
 */
function normalizarNombreArchivo(filename) {
  if (!filename) return filename;
  
  try {
    // Si el nombre viene como Buffer, convertirlo a string
    if (Buffer.isBuffer(filename)) {
      filename = filename.toString('utf8');
    }
    
    // Detectar si el nombre tiene caracteres mal codificados (como "Ã³" en lugar de "ó")
    // Esto ocurre cuando UTF-8 se interpreta como latin1/ISO-8859-1
    // Buscar el patrón "Ã" seguido de caracteres que indican codificación incorrecta
    const tieneCaracteresMalCodificados = /Ã[^\s]/u.test(filename);
    
    if (tieneCaracteresMalCodificados) {
      try {
        // Intentar corregir: interpretar como latin1 y convertir a UTF-8
        // Esto corrige casos como "aprobaciÃ³n" -> "aprobación"
        const corrected = Buffer.from(filename, 'latin1').toString('utf8');
        
        // Verificar que la corrección mejoró (no tiene más caracteres raros)
        if (!/Ã[^\s]/u.test(corrected)) {
          filename = corrected;
        }
      } catch (e) {
        // Si falla, intentar otra estrategia: decodificar desde UTF-8 mal interpretado
        try {
          // A veces el problema es que viene doblemente codificado
          const bytes = Buffer.from(filename, 'latin1');
          const decoded = bytes.toString('utf8');
          if (!/Ã[^\s]/u.test(decoded)) {
            filename = decoded;
          }
        } catch (e2) {
          // Si todo falla, mantener el original
        }
      }
    }
    
    // Asegurar que el resultado sea una cadena UTF-8 válida
    // Limpiar cualquier carácter de control no deseado pero mantener caracteres especiales válidos
    return Buffer.from(filename, 'utf8').toString('utf8');
  } catch (error) {
    console.error('Error al normalizar nombre de archivo:', error);
    return filename;
  }
}

/**
 * Normalizar documento completo (aplica normalización al nombre de archivo)
 * @param {object} documento - Documento de la base de datos
 * @returns {object} - Documento con nombre normalizado
 */
function normalizarDocumento(documento) {
  if (!documento) return documento;
  
  return {
    ...documento,
    nombre_archivo: normalizarNombreArchivo(documento.nombre_archivo)
  };
}

/**
 * Normalizar array de documentos
 * @param {array} documentos - Array de documentos
 * @returns {array} - Array de documentos con nombres normalizados
 */
function normalizarDocumentos(documentos) {
  if (!documentos || !Array.isArray(documentos)) return documentos;
  return documentos.map(doc => normalizarDocumento(doc));
}

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

    // Normalizar nombre del archivo para asegurar codificación UTF-8 correcta
    const nombreArchivoNormalizado = normalizarNombreArchivo(req.file.originalname);

    // Guardar una copia del PDF original para poder reaplicar firmas después
    // El PDF original se guarda con el mismo nombre pero con "-original" antes de .pdf
    const rutaArchivoOriginal = req.file.path.replace(/\.pdf$/i, '-original.pdf');
    if (!fs.existsSync(rutaArchivoOriginal)) {
      fs.copyFileSync(req.file.path, rutaArchivoOriginal);
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
        nombreArchivoNormalizado,
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
    // Usar un Map para agrupar por correo y evitar duplicados
    const correosEnviados = new Map();
    
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

      const aprobadorResult = await client.query(
        `INSERT INTO aprobadores (
          documento_id, usuario_id, usuario_nombre, usuario_correo,
          rol_aprobacion, orden_aprobacion, token_firma, estado,
          posicion_x, posicion_y, pagina_firma, ancho_firma, alto_firma,
          correo_grupo, grupo_miembro_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id`,
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

      const aprobadorId = aprobadorResult.rows[0].id;
      const correoNormalizado = (aprobador.correo || '').toLowerCase().trim();

      // Solo enviar correo si no se ha enviado ya a este destinatario
      if (correoNormalizado && !correosEnviados.has(correoNormalizado)) {
        correosEnviados.set(correoNormalizado, true);
        
        // Enviar correo de notificación con IDs para deduplicación
        await enviarNotificacionAprobacion(
          aprobador.correo,
          aprobador.nombre,
          nombreArchivoNormalizado,
          tokenFirma,
          documento.usuario_creador_nombre,
          documento.id,
          aprobadorId
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
      } else if (correoNormalizado) {
        console.log(`⏭ Correo omitido (duplicado por destinatario) a ${correoNormalizado} para documento ${documento.id}`);
      }
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
        `Documento "${nombreArchivoNormalizado}" subido al sistema`,
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
    // Verificar si el usuario es administrador (puede ver todos los documentos)
    const esAdmin = esAdminDesdeRequest(req.user);
    
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

    // Normalizar nombres de archivo antes de devolver
    const documentosNormalizados = normalizarDocumentos(result.rows);

    return res.status(200).json({
      success: true,
      documentos: documentosNormalizados
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

    // Normalizar nombres de archivo antes de devolver
    const documentosNormalizados = normalizarDocumentos(result.rows);

    return res.status(200).json({
      success: true,
      documentos: documentosNormalizados
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

    // Normalizar nombre de archivo antes de devolver
    const documentoNormalizado = normalizarDocumento(documento);

    return res.status(200).json({
      success: true,
      documento: documentoNormalizado
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

    // Verificar si el usuario es administrador (puede ver todos los documentos)
    const esAdmin = esAdminDesdeRequest(req.user);

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

    // Normalizar nombre de archivo antes de devolver
    const documentoNormalizado = normalizarDocumento(result.rows[0]);

    return res.status(200).json({
      success: true,
      documento: documentoNormalizado
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

    // Normalizar nombres de archivo antes de devolver
    const versionesNormalizadas = normalizarDocumentos(versiones.rows);

    return res.status(200).json({
      success: true,
      versiones: versionesNormalizadas,
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

    // Normalizar nombre del archivo para asegurar codificación UTF-8 correcta
    const nombreArchivoNormalizado = normalizarNombreArchivo(req.file.originalname);

    // Guardar una copia del PDF original para poder reaplicar firmas después
    const rutaArchivoOriginal = req.file.path.replace(/\.pdf$/i, '-original.pdf');
    if (!fs.existsSync(rutaArchivoOriginal)) {
      fs.copyFileSync(req.file.path, rutaArchivoOriginal);
    }

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
        nombreArchivoNormalizado,
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
    // Usar un Map para agrupar por correo y evitar duplicados
    const correosEnviadosNuevaVersion = new Map();
    
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

      const aprobadorResult = await client.query(
        `INSERT INTO aprobadores (
          documento_id, usuario_id, usuario_nombre, usuario_correo,
          rol_aprobacion, orden_aprobacion, token_firma, estado,
          posicion_x, posicion_y, pagina_firma, ancho_firma, alto_firma,
          correo_grupo, grupo_miembro_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id`,
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

      const aprobadorId = aprobadorResult.rows[0].id;
      const correoNormalizado = (usuarioCorreo || '').toLowerCase().trim();

      // Solo enviar correo si no se ha enviado ya a este destinatario
      if (correoNormalizado && !correosEnviadosNuevaVersion.has(correoNormalizado)) {
        correosEnviadosNuevaVersion.set(correoNormalizado, true);
        
        // Enviar correo de notificación de nueva versión con IDs para deduplicación
        await enviarNotificacionNuevaVersion(
          usuarioCorreo,
          usuarioNombre,
          nombreArchivoNormalizado,
          tokenFirma,
          nuevoDocumento.version,
          nuevoDocumento.id,
          aprobadorId
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
      } else if (correoNormalizado) {
        console.log(`⏭ Correo de nueva versión omitido (duplicado por destinatario) a ${correoNormalizado} para documento ${nuevoDocumento.id}`);
      }
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
        `Nueva versión (v${nuevoDocumento.version}) del documento "${nombreArchivoNormalizado}" subida al sistema`,
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

/**
 * Actualizar posiciones de firmas y reaplicar todas las firmas en el PDF
 * Solo disponible para diego.castillo@fastprobags.com
 */
export async function actualizarPosicionesFirmas(req, res) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Verificar que el usuario es diego.castillo@fastprobags.com
    const esAdmin = req.user.correo && req.user.correo.toLowerCase().trim() === 'diego.castillo@fastprobags.com';
    if (!esAdmin) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para actualizar posiciones de firmas'
      });
    }

    const { id } = req.params;
    const { aprobadores } = req.body;

    if (!aprobadores || !Array.isArray(aprobadores)) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de aprobadores con sus nuevas posiciones'
      });
    }

    // Obtener el documento
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

    const documento = docResult.rows[0];

    // Obtener el PDF original (sin firmas)
    // Si existe el archivo -original.pdf, usarlo; si no, usar el archivo actual
    const rutaArchivoOriginal = documento.ruta_archivo.replace(/\.pdf$/i, '-original.pdf');
    let pdfOriginalPath = documento.ruta_archivo;
    
    if (fs.existsSync(rutaArchivoOriginal)) {
      pdfOriginalPath = rutaArchivoOriginal;
    } else {
      // Si no existe el original, crear una copia del actual antes de reaplicar
      console.log('⚠️ No se encontró PDF original, usando el PDF actual como base');
    }

    // Obtener todas las firmas existentes (aprobadores que ya firmaron)
    const firmasResult = await client.query(
      `SELECT 
        f.id as firma_id,
        f.aprobador_id,
        f.usuario_id,
        f.usuario_nombre,
        a.posicion_x as posicion_x_actual,
        a.posicion_y as posicion_y_actual,
        a.pagina_firma as pagina_firma_actual,
        a.ancho_firma as ancho_firma_actual,
        a.alto_firma as alto_firma_actual
      FROM firmas f
      INNER JOIN aprobadores a ON f.aprobador_id = a.id
      WHERE f.documento_id = $1`,
      [id]
    );

    const firmasExistentes = firmasResult.rows;

    // Actualizar posiciones de los aprobadores
    for (const aprobadorData of aprobadores) {
      const { aprobador_id, posicion_x, posicion_y, pagina_firma, ancho_firma, alto_firma } = aprobadorData;

      if (!aprobador_id) {
        continue;
      }

      await client.query(
        `UPDATE aprobadores 
         SET posicion_x = $1, 
             posicion_y = $2, 
             pagina_firma = $3,
             ancho_firma = $4,
             alto_firma = $5
         WHERE id = $6 AND documento_id = $7`,
        [
          posicion_x,
          posicion_y,
          pagina_firma !== undefined ? pagina_firma : -1,
          ancho_firma || 150,
          alto_firma || 75,
          aprobador_id,
          id
        ]
      );
    }

    // Si hay firmas existentes, reaplicarlas en las nuevas posiciones
    if (firmasExistentes.length > 0) {
      // Cargar el PDF original
      const pdfBytes = fs.readFileSync(pdfOriginalPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // Obtener las nuevas posiciones actualizadas de los aprobadores
      const aprobadoresActualizados = await client.query(
        `SELECT 
          a.id as aprobador_id,
          a.posicion_x,
          a.posicion_y,
          a.pagina_firma,
          a.ancho_firma,
          a.alto_firma,
          f.usuario_nombre
        FROM aprobadores a
        INNER JOIN firmas f ON a.id = f.aprobador_id
        WHERE a.documento_id = $1 AND f.documento_id = $1`,
        [id]
      );

      // Cargar la fuente una vez
      const font = await pdfDoc.embedFont('Helvetica-Bold');

      // Aplicar cada firma en su nueva posición directamente en el PDFDocument
      for (const aprobador of aprobadoresActualizados.rows) {
        const paginaIndex = aprobador.pagina_firma === -1 
          ? pdfDoc.getPageCount() - 1 
          : aprobador.pagina_firma - 1;
        
        const page = pdfDoc.getPage(paginaIndex);
        const x = aprobador.posicion_x || 50;
        const y = aprobador.posicion_y || 50;
        const ancho = aprobador.ancho_firma || 150;
        const alto = aprobador.alto_firma || 75;
        const usuarioNombre = aprobador.usuario_nombre.toUpperCase();

        // Usar la misma lógica de insertarFirmaEnPDF pero aplicada directamente
        const anchoDisponible = ancho * 0.95;
        const altoDisponible = alto * 0.9;
        let fontSize = Math.min(alto * 0.35, 24);
        const minFontSize = 6;
        let espacioEntreLineas = fontSize * 1.2;

        // Dividir el nombre en líneas usando la misma lógica robusta que insertarFirmaEnPDF
        const dividirEnLineas = (texto, anchoMaximo, tamanoFuente) => {
          const palabras = texto.split(' ');
          const lineas = [];
          let lineaActual = '';
          
          for (const palabra of palabras) {
            // Verificar si la palabra sola cabe
            let anchoPalabra = font.widthOfTextAtSize(palabra, tamanoFuente);
            
            // Si la palabra sola no cabe, dividirla en caracteres
            if (anchoPalabra > anchoMaximo) {
              if (lineaActual) {
                lineas.push(lineaActual);
                lineaActual = '';
              }
              
              // Dividir la palabra en caracteres
              let palabraRestante = palabra;
              while (palabraRestante.length > 0) {
                let caracteresEnLinea = '';
                for (let i = 0; i < palabraRestante.length; i++) {
                  const prueba = caracteresEnLinea + palabraRestante[i];
                  const anchoPrueba = font.widthOfTextAtSize(prueba, tamanoFuente);
                  if (anchoPrueba <= anchoMaximo) {
                    caracteresEnLinea = prueba;
                  } else {
                    break;
                  }
                }
                
                if (caracteresEnLinea.length > 0) {
                  lineas.push(caracteresEnLinea);
                  palabraRestante = palabraRestante.substring(caracteresEnLinea.length);
                } else {
                  lineas.push(palabraRestante[0] || '');
                  palabraRestante = palabraRestante.substring(1);
                }
              }
              continue;
            }
            
            // Intentar agregar la palabra a la línea actual
            const textoPrueba = lineaActual ? `${lineaActual} ${palabra}` : palabra;
            const anchoTexto = font.widthOfTextAtSize(textoPrueba, tamanoFuente);
            
            if (anchoTexto <= anchoMaximo) {
              lineaActual = textoPrueba;
            } else {
              if (lineaActual) {
                lineas.push(lineaActual);
              }
              lineaActual = palabra;
            }
          }
          
          if (lineaActual) {
            lineas.push(lineaActual);
          }
          
          return lineas.length > 0 ? lineas : [texto];
        };

        let lineas = dividirEnLineas(usuarioNombre, anchoDisponible, fontSize);

        // Ajustar tamaño de fuente si es necesario (iterar hasta encontrar tamaño adecuado)
        let intentos = 0;
        while (intentos < 100 && fontSize >= minFontSize) {
          lineas = dividirEnLineas(usuarioNombre, anchoDisponible, fontSize);
          
          // Verificar que todas las líneas quepan en el ancho
          let todasCabenEnAncho = true;
          for (const linea of lineas) {
            const anchoLinea = font.widthOfTextAtSize(linea, fontSize);
            if (anchoLinea > anchoDisponible * 1.01) {
              todasCabenEnAncho = false;
              break;
            }
          }
          
          const alturaTotal = (lineas.length * fontSize) + ((lineas.length - 1) * (espacioEntreLineas - fontSize));
          
          if (todasCabenEnAncho && alturaTotal <= altoDisponible) {
            break;
          }
          
          fontSize -= 0.3;
          espacioEntreLineas = fontSize * 1.2;
          intentos++;
        }
        
        // Recalcular líneas con el tamaño final
        lineas = dividirEnLineas(usuarioNombre, anchoDisponible, fontSize);

        // Calcular posición centrada
        // IMPORTANTE: 'y' es la coordenada de la parte INFERIOR del rectángulo (desde abajo)
        // La parte superior del rectángulo está en: y + alto (desde abajo)
        const alturaTotal = (lineas.length * fontSize) + ((lineas.length - 1) * (espacioEntreLineas - fontSize));
        const espacioVerticalRestante = alto - alturaTotal;
        const margenSuperior = Math.max(0, espacioVerticalRestante / 2);
        const textYInicial = (y + alto) - margenSuperior - fontSize;

        // Límites verticales
        const textYMinimo = y; // Límite inferior
        const textYMaximo = (y + alto) - fontSize; // Límite superior

        // Dibujar cada línea
        lineas.forEach((linea, index) => {
          if (!linea || linea.trim() === '') return;
          
          const textWidth = font.widthOfTextAtSize(linea, fontSize);
          // Centrar horizontalmente
          const textX = x + (ancho - textWidth) / 2;
          const textXFinal = Math.max(x, Math.min(x + ancho - textWidth, textX));
          
          // Calcular Y para esta línea
          let textY = textYInicial - (index * espacioEntreLineas);
          textY = Math.max(textYMinimo, Math.min(textYMaximo, textY));
          
          page.drawText(linea, {
            x: textXFinal,
            y: textY,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0.6)
          });
        });
      }

      // Guardar el PDF final con todas las firmas reaplicadas
      const pdfBytesFinal = await pdfDoc.save();
      fs.writeFileSync(documento.ruta_archivo, pdfBytesFinal);
    }

    // Registrar en auditoría
    await client.query(
      `INSERT INTO log_auditoria (
        documento_id, usuario_id, usuario_nombre, usuario_correo,
        accion, descripcion, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        req.user.id,
        req.user.nombre,
        req.user.correo,
        'actualizar_posiciones',
        `Posiciones de firmas actualizadas y reaplicadas por ${req.user.nombre}`,
        req.ip
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Posiciones de firmas actualizadas y reaplicadas exitosamente',
      firmasReaplicadas: firmasExistentes.length
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar posiciones de firmas:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar posiciones de firmas',
      error: error.message
    });
  } finally {
    client.release();
  }
}

/**
 * Editar un documento (solo metadatos, no el archivo PDF)
 * Solo el creador o diego.castillo@fastprobags.com pueden editar
 */
export async function editarDocumento(req, res) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { nombre_archivo, tipo_documento, descripcion, tiempo_limite_horas, intervalo_recordatorio_minutos } = req.body;
    const usuarioId = req.user.id;
    const esAdmin = req.user.correo && req.user.correo.toLowerCase().trim() === 'diego.castillo@fastprobags.com';
    
    // Obtener el documento
    const docResult = await client.query(
      `SELECT id, usuario_creador_id, estado, nombre_archivo FROM documentos WHERE id = $1`,
      [id]
    );
    
    if (docResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Documento no encontrado'
      });
    }
    
    const documento = docResult.rows[0];
    
    // Verificar permisos: solo el creador o el admin pueden editar
    if (!esAdmin && documento.usuario_creador_id !== usuarioId) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para editar este documento'
      });
    }
    
    // Preparar campos a actualizar
    const camposActualizar = [];
    const valores = [];
    let contador = 1;
    
    if (nombre_archivo !== undefined) {
      const nombreArchivoNormalizado = normalizarNombreArchivo(nombre_archivo);
      camposActualizar.push(`nombre_archivo = $${contador++}`);
      valores.push(nombreArchivoNormalizado);
    }
    
    if (tipo_documento !== undefined) {
      camposActualizar.push(`tipo_documento = $${contador++}`);
      valores.push(tipo_documento);
    }
    
    if (descripcion !== undefined) {
      camposActualizar.push(`descripcion = $${contador++}`);
      valores.push(descripcion);
    }
    
    if (tiempo_limite_horas !== undefined) {
      camposActualizar.push(`tiempo_limite_horas = $${contador++}`);
      valores.push(tiempo_limite_horas ? parseInt(tiempo_limite_horas) : null);
      
      // Recalcular fecha límite si se actualiza tiempo_limite_horas
      if (tiempo_limite_horas) {
        const fechaLimite = new Date();
        fechaLimite.setHours(fechaLimite.getHours() + parseInt(tiempo_limite_horas));
        camposActualizar.push(`fecha_limite_aprobacion = $${contador++}`);
        valores.push(fechaLimite);
      } else {
        camposActualizar.push(`fecha_limite_aprobacion = $${contador++}`);
        valores.push(null);
      }
    }
    
    if (intervalo_recordatorio_minutos !== undefined) {
      camposActualizar.push(`intervalo_recordatorio_minutos = $${contador++}`);
      valores.push(intervalo_recordatorio_minutos ? parseInt(intervalo_recordatorio_minutos) : null);
    }
    
    if (camposActualizar.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No se proporcionaron campos para actualizar'
      });
    }
    
    // Agregar el ID al final para el WHERE
    valores.push(id);
    
    // Actualizar el documento
    const updateQuery = `
      UPDATE documentos 
      SET ${camposActualizar.join(', ')}
      WHERE id = $${contador}
      RETURNING *
    `;
    
    const updateResult = await client.query(updateQuery, valores);
    const documentoActualizado = updateResult.rows[0];
    
    // Registrar en auditoría
    await client.query(
      `INSERT INTO log_auditoria (
        documento_id, usuario_id, usuario_nombre, usuario_correo,
        accion, descripcion, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        usuarioId,
        req.user.nombre,
        req.user.correo,
        'edicion',
        `Documento editado: ${documento.nombre_archivo}`,
        req.ip || req.connection.remoteAddress,
        req.get('user-agent')
      ]
    );
    
    await client.query('COMMIT');
    
    return res.status(200).json({
      success: true,
      message: 'Documento actualizado exitosamente',
      documento: normalizarDocumento(documentoActualizado)
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al editar documento:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al editar documento',
      error: error.message
    });
  } finally {
    client.release();
  }
}

/**
 * Eliminar un documento
 * Solo el creador o diego.castillo@fastprobags.com pueden eliminar
 */
export async function eliminarDocumento(req, res) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const usuarioId = req.user.id;
    const esAdmin = req.user.correo && req.user.correo.toLowerCase().trim() === 'diego.castillo@fastprobags.com';
    
    // Obtener el documento con todas sus versiones
    const docResult = await client.query(
      `SELECT id, usuario_creador_id, nombre_archivo, ruta_archivo, documento_padre_id 
       FROM documentos WHERE id = $1 OR documento_padre_id = $1`,
      [id]
    );
    
    if (docResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Documento no encontrado'
      });
    }
    
    // Verificar permisos: solo el creador o el admin pueden eliminar
    // Verificar que el usuario sea el creador del documento principal
    const documentoPrincipal = docResult.rows.find(d => d.id === parseInt(id));
    if (!documentoPrincipal) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Documento principal no encontrado'
      });
    }
    
    if (!esAdmin && documentoPrincipal.usuario_creador_id !== usuarioId) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para eliminar este documento'
      });
    }
    
    // Obtener todas las rutas de archivos a eliminar (incluyendo originales)
    const rutasArchivos = [];
    docResult.rows.forEach(doc => {
      if (doc.ruta_archivo) {
        rutasArchivos.push(doc.ruta_archivo);
        // También intentar eliminar el archivo original si existe
        const rutaOriginal = doc.ruta_archivo.replace(/\.pdf$/i, '-original.pdf');
        if (fs.existsSync(rutaOriginal)) {
          rutasArchivos.push(rutaOriginal);
        }
      }
    });
    
    // Obtener todos los IDs de documentos relacionados (incluyendo versiones)
    const idsDocumentos = docResult.rows.map(d => d.id);
    
    // Registrar en auditoría antes de eliminar
    for (const docId of idsDocumentos) {
      await client.query(
        `INSERT INTO log_auditoria (
          documento_id, usuario_id, usuario_nombre, usuario_correo,
          accion, descripcion, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          docId,
          usuarioId,
          req.user.nombre,
          req.user.correo,
          'eliminacion',
          `Documento eliminado: ${documentoPrincipal.nombre_archivo}`,
          req.ip || req.connection.remoteAddress,
          req.get('user-agent')
        ]
      );
    }
    
    // Eliminar documentos (CASCADE eliminará aprobadores, firmas, etc.)
    await client.query(
      `DELETE FROM documentos WHERE id = ANY($1::int[])`,
      [idsDocumentos]
    );
    
    await client.query('COMMIT');
    
    // Eliminar archivos físicos después del commit
    let archivosEliminados = 0;
    for (const ruta of rutasArchivos) {
      try {
        if (fs.existsSync(ruta)) {
          fs.unlinkSync(ruta);
          archivosEliminados++;
        }
      } catch (error) {
        console.error(`Error al eliminar archivo ${ruta}:`, error);
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Documento eliminado exitosamente',
      archivosEliminados
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar documento:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar documento',
      error: error.message
    });
  } finally {
    client.release();
  }
}

/**
 * Reenviar un documento vencido
 * Solo el creador o diego.castillo@fastprobags.com pueden reenviar
 */
export async function reenviarDocumento(req, res) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const usuarioId = req.user.id;
    const esAdmin = req.user.correo && req.user.correo.toLowerCase().trim() === 'diego.castillo@fastprobags.com';
    
    // Obtener el documento
    const docResult = await client.query(
      `SELECT id, usuario_creador_id, estado, nombre_archivo, tiempo_limite_horas, fecha_limite_aprobacion,
              usuario_creador_nombre, usuario_creador_correo
       FROM documentos WHERE id = $1`,
      [id]
    );
    
    if (docResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Documento no encontrado'
      });
    }
    
    const documento = docResult.rows[0];
    
    // Verificar permisos: solo el creador o el admin pueden reenviar
    if (!esAdmin && documento.usuario_creador_id !== usuarioId) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para reenviar este documento'
      });
    }
    
    // Verificar que el documento esté vencido
    if (documento.estado !== 'vencido') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Este documento no está vencido'
      });
    }
    
    // Recalcular fecha límite si existe tiempo_limite_horas
    let nuevaFechaLimite = null;
    if (documento.tiempo_limite_horas) {
      nuevaFechaLimite = new Date();
      nuevaFechaLimite.setHours(nuevaFechaLimite.getHours() + documento.tiempo_limite_horas);
    }
    
    // Actualizar el documento: cambiar estado a pendiente y recalcular fecha límite
    await client.query(
      `UPDATE documentos 
       SET estado = 'pendiente',
           fecha_limite_aprobacion = $1,
           ultimo_recordatorio_enviado = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [nuevaFechaLimite, id]
    );
    
    // Obtener aprobadores vencidos y actualizarlos a pendiente
    await client.query(
      `UPDATE aprobadores 
       SET estado = 'pendiente'
       WHERE documento_id = $1 AND estado = 'vencido'`,
      [id]
    );
    
    // Obtener aprobadores pendientes para enviar notificaciones
    const aprobadoresResult = await client.query(
      `SELECT id, usuario_nombre, usuario_correo, token_firma, rol_aprobacion
       FROM aprobadores
       WHERE documento_id = $1 AND estado = 'pendiente'`,
      [id]
    );
    
    // Enviar notificaciones a los aprobadores (agrupar por correo para evitar duplicados)
    const { enviarNotificacionAprobacion } = await import('../utils/mailer.js');
    const correosEnviadosReenvio = new Set();
    
    for (const aprobador of aprobadoresResult.rows) {
      const correoNormalizado = (aprobador.usuario_correo || '').toLowerCase().trim();
      
      // Solo enviar si no se ha enviado ya a este correo
      if (correoNormalizado && !correosEnviadosReenvio.has(correoNormalizado)) {
        correosEnviadosReenvio.add(correoNormalizado);
        
        try {
          await enviarNotificacionAprobacion(
            aprobador.usuario_correo,
            aprobador.usuario_nombre,
            documento.nombre_archivo,
            aprobador.token_firma,
            documento.usuario_creador_nombre || documento.usuario_creador_correo,
            id,
            aprobador.id
          );
        } catch (error) {
          console.error(`Error al enviar notificación a ${aprobador.usuario_correo}:`, error);
        }
      } else if (correoNormalizado) {
        console.log(`⏭ Correo de reenvío omitido (duplicado) a ${correoNormalizado} para documento ${id}`);
      }
    }
    
    // Registrar en auditoría
    await client.query(
      `INSERT INTO log_auditoria (
        documento_id, usuario_id, usuario_nombre, usuario_correo,
        accion, descripcion, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        usuarioId,
        req.user.nombre,
        req.user.correo,
        'reenvio',
        `Documento reenviado después de vencer: ${documento.nombre_archivo}`,
        req.ip || req.connection.remoteAddress,
        req.get('user-agent')
      ]
    );
    
    await client.query('COMMIT');
    
    return res.status(200).json({
      success: true,
      message: 'Documento reenviado exitosamente. Se han notificado a los aprobadores.',
      notificacionesEnviadas: aprobadoresResult.rows.length
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al reenviar documento:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al reenviar documento',
      error: error.message
    });
  } finally {
    client.release();
  }
}
