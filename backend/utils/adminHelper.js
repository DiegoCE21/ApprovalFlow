/**
 * Lista de correos de administradores que pueden ver todos los documentos
 * y tienen permisos especiales en el sistema
 */
const ADMIN_EMAILS = [
  'diego.castillo@fastprobags.com',
  'judith.hernandez@fastprobags.com'
].map(email => email.toLowerCase().trim());

/**
 * Verifica si un usuario es administrador del sistema
 * @param {string} correo - Correo del usuario a verificar
 * @returns {boolean} - true si es administrador, false en caso contrario
 */
export function esAdministrador(correo) {
  if (!correo) {
    return false;
  }
  const correoNormalizado = correo.toLowerCase().trim();
  return ADMIN_EMAILS.includes(correoNormalizado);
}

/**
 * Verifica si un usuario es administrador basándose en el objeto req.user
 * @param {object} user - Objeto de usuario (req.user)
 * @returns {boolean} - true si es administrador, false en caso contrario
 */
export function esAdminDesdeRequest(user) {
  if (!user || !user.correo) {
    return false;
  }
  return esAdministrador(user.correo);
}

/**
 * Obtiene la lista de correos de administradores
 * @returns {string[]} - Array de correos de administradores
 */
export function obtenerAdministradores() {
  return [...ADMIN_EMAILS];
}

