import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getSqlConnection, sql } from '../config/sqlserver.js';
import { validatePassword, generateSHA256Hash } from '../utils/hash.js';
import pool from '../config/postgres.js';

/**
 * Login de usuario
 * Valida credenciales contra SQL Server y genera JWT
 */
export async function login(req, res) {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return res.status(400).json({
        success: false,
        message: 'Correo y contraseña son requeridos'
      });
    }

    // Conectar a SQL Server
    const sqlPool = await getSqlConnection();

    // Convertir correo a lowercase para consistencia
    const correoLowercase = correo.toLowerCase().trim();

    // Obtener usuario y credenciales desde SQL Server
    const result = await sqlPool.request()
      .input('correo', sql.NVarChar, correoLowercase)
      .query(`
        SELECT 
          u.id, u.nombre, u.correo, u.TipoUsuario, u.NumeroNomina, u.rolNom,
          u.debe_cambiar_password, u.fecha_ultimo_cambio_password,
          u.password_hash, s.Salt, 
          ISNULL(u.puede_subir_documentos, 0) as puede_subir_documentos
        FROM dbo.Usuarios u
        JOIN security.SaltStore s ON u.id = s.UserID
        WHERE u.correo = @correo
      `);

    if (result.recordset.length === 0) {
      console.log('❌ Usuario no encontrado:', correo);
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    const usuario = result.recordset[0];
    console.log('✓ Usuario encontrado:', usuario.correo);

    // Generar hash usando SQL Server HASHBYTES (igual que ticketing system)
    const hashedAttempt = await sqlPool.request()
      .input('password', sql.NVarChar, password)
      .input('salt', sql.NVarChar, usuario.Salt)
      .query(`
        SELECT CONVERT(NVARCHAR(64), 
               HASHBYTES('SHA2_256', @salt + @password), 2) AS hashedAttempt
      `);

    const generatedHash = hashedAttempt.recordset[0].hashedAttempt;
    
    console.log('🔐 Debug de autenticación:');
    console.log('  - Salt:', usuario.Salt);
    console.log('  - Hash almacenado:', usuario.password_hash);
    console.log('  - Hash generado (SQL Server):', generatedHash);
    console.log('  - ¿Coinciden?:', generatedHash === usuario.password_hash);

    // Validar contraseña
    if (generatedHash !== usuario.password_hash) {
      // Registrar intento fallido en auditoría
      await registrarAuditoria(null, usuario.id, usuario.nombre, usuario.correo, 'login_fallido', 
        'Intento de login con contraseña incorrecta', req.ip, req.get('user-agent'));

      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Generar JWT
    const token = jwt.sign(
      {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        TipoUsuario: usuario.TipoUsuario,
        NumeroNomina: usuario.NumeroNomina,
        rolNom: usuario.rolNom,
        puedeSubirDocumentos: usuario.puede_subir_documentos
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Configurar cookies de sesión
    // Cookie httpOnly para el token (segura)
    res.cookie('userToken', token, {
      httpOnly: false, // Accesible desde JavaScript
      secure: false,   // HTTP (no HTTPS en red interna)
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000 // 8 horas
    });

    // Cookie httpOnly con datos del usuario
    res.cookie('user', JSON.stringify({
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      TipoUsuario: usuario.TipoUsuario,
      rolNom: usuario.rolNom,
      puedeSubirDocumentos: usuario.puede_subir_documentos
    }), {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000
    });

    // Registrar login exitoso en auditoría
    await registrarAuditoria(null, usuario.id, usuario.nombre, usuario.correo, 'login_exitoso', 
      'Usuario inició sesión correctamente', req.ip, req.get('user-agent'));

    return res.status(200).json({
      success: true,
      message: 'Login exitoso',
      token,
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        TipoUsuario: usuario.TipoUsuario,
        NumeroNomina: usuario.NumeroNomina,
        rolNom: usuario.rolNom,
        debe_cambiar_password: usuario.debe_cambiar_password,
        puedeSubirDocumentos: usuario.puede_subir_documentos
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({
      success: false,
      message: 'Error en el servidor',
      error: error.message
    });
  }
}

/**
 * Logout de usuario
 */
export async function logout(req, res) {
  try {
    // Limpiar cookies
    res.clearCookie('userToken');
    res.clearCookie('user');

    // Registrar logout en auditoría
    if (req.user) {
      await registrarAuditoria(null, req.user.id, req.user.nombre, req.user.correo, 'logout', 
        'Usuario cerró sesión', req.ip, req.get('user-agent'));
    }

    return res.status(200).json({
      success: true,
      message: 'Logout exitoso'
    });

  } catch (error) {
    console.error('Error en logout:', error);
    return res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
}

/**
 * Verificar sesión actual
 */
export async function verificarSesion(req, res) {
  try {
    return res.status(200).json({
      success: true,
      user: req.user
    });
  } catch (error) {
    console.error('Error al verificar sesión:', error);
    return res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
}

/**
 * Función helper para registrar en auditoría
 */
async function registrarAuditoria(documentoId, usuarioId, usuarioNombre, usuarioCorreo, accion, descripcion, ip, userAgent) {
  try {
    await pool.query(
      `INSERT INTO log_auditoria (documento_id, usuario_id, usuario_nombre, usuario_correo, accion, descripcion, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [documentoId, usuarioId, usuarioNombre, usuarioCorreo, accion, descripcion, ip, userAgent]
    );
  } catch (error) {
    console.error('Error al registrar auditoría:', error);
  }
}
