import crypto from 'crypto';

/**
 * Genera un hash SHA2_256 de una cadena
 * Compatible con SQL Server HASHBYTES('SHA2_256', texto)
 */
export function generateSHA256Hash(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').toUpperCase();
}

/**
 * Genera un salt aleatorio
 */
export function generateSalt(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Valida una contraseña contra un hash almacenado
 * @param {string} password - Contraseña en texto plano
 * @param {string} salt - Salt del usuario
 * @param {string} storedHash - Hash almacenado en la base de datos (hex string)
 */
export function validatePassword(password, salt, storedHash) {
  const inputHash = generateSHA256Hash(salt + password);
  return inputHash.toUpperCase() === storedHash.toUpperCase();
}
