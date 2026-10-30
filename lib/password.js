// Password hashing with Node's built-in scrypt (no extra package needed)
import crypto from 'node:crypto';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(password), salt, 64).toString('hex');
}

export function checkPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const given = crypto.scryptSync(String(password), salt, 64);
  return crypto.timingSafeEqual(given, Buffer.from(hash, 'hex'));
}
