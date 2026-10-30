// Login sessions (server only). A random token is stored in an httpOnly cookie
// and in the sessions table; every request looks it up.
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db.js';
import { checkPassword, hashPassword } from './password.js';
import { HttpError } from './route.js';

export const COOKIE = 'lf_session';
const DAYS = 30;

export function login(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim());
  if (!user || !checkPassword(password, user.password_hash)) throw new HttpError(401, 'Wrong email or password');
  if (user.blocked) throw new HttpError(403, 'This account is blocked. Contact the admin.');
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + DAYS * 864e5);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expires.toISOString());
  return { token, expires, user: publicUser(user) };
}

// Public sign-up (turn off with ALLOW_SIGNUP=false). New accounts are always customers.
export const signupAllowed = () => process.env.ALLOW_SIGNUP !== 'false';

export function signup({ name, email, password } = {}) {
  if (!signupAllowed()) throw new HttpError(403, 'Sign-up is turned off. Ask the admin for an account.');
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'Enter a valid email');
  if (String(password || '').length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(e)) throw new HttpError(400, 'An account with this email already exists. Log in instead.');
  db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'user')")
    .run(e, String(name || '').trim() || null, hashPassword(password));
  return login(e, password);
}

export function logout(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

/** The logged-in user, or null */
export async function getUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const u = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ? AND u.blocked = 0`
    )
    .get(token, new Date().toISOString());
  return u ? publicUser(u) : null;
}

// For API routes: throw 401/403 so handle() returns a JSON error
export async function requireUser() {
  const user = await getUser();
  if (!user) throw new HttpError(401, 'Please log in again');
  return user;
}
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'admin') throw new HttpError(403, 'Admins only');
  return user;
}

// For pages: redirect instead of throwing
export async function pageUser(role, next = role === 'admin' ? '/admin' : null) {
  const user = await getUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  if (role && user.role !== role) redirect(user.role === 'admin' ? '/admin' : '/');
  return user;
}
