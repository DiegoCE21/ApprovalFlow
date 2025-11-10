import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const authenticateToken = (req, res, next) => {
  try {
    // Obtener el token de la cookie 'userToken' o del header Authorization
    const token = req.cookies?.userToken || req.headers['authorization']?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Acceso denegado. Token no proporcionado.' 
      });
    }

    // Verificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Agregar información del usuario a la request
    req.user = decoded;
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ 
        success: false, 
        message: 'Token expirado. Por favor inicia sesión nuevamente.' 
      });
    }
    return res.status(403).json({ 
      success: false, 
      message: 'Token inválido.' 
    });
  }
};

// Middleware para verificar roles específicos
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no autenticado.' 
      });
    }

    if (!roles.includes(req.user.rolNom) && !roles.includes(req.user.TipoUsuario)) {
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permisos para realizar esta acción.' 
      });
    }

    next();
  };
};
