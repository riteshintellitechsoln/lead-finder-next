// Login sessions (server only). A random token is stored in an httpOnly cookie
// and in the sessions table; every request looks it up.
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { small, smallOne } from './db.js';
import { checkPassword, hashPassword } from './password.js';
import { HttpError } from './route.js';

export const COOKIE = 'lf_session';
const DAYS = 30;
// Logged out after this many minutes without any activity (SESSION_IDLE_MINUTES, 0 = never).
// The browser keeps the session alive while the person uses the page (components/IdleLogout.js).
export const IDLE_MINUTES = Math.max(0, Number(process.env.SESSION_IDLE_MINUTES ?? 5) || 0);
const IDLE_MS = IDLE_MINUTES * 60_000;
const TOUCH_MS = Math.min(30_000, IDLE_MS / 4 || 30_000); // last_seen is written at most this often per session
export const IDLE_MESSAGE = `You were logged out after ${IDLE_MINUTES} minutes without activity. Log in again.`;

// sessions.last_seen (added after the first version; ensureAppTables adds it too)
let lastSeenReady = null;
const ensureLastSeen = () => (lastSeenReady ??= small('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen VARCHAR')
  .catch((e) => { lastSeenReady = null; throw e; }));
const USER_COLS = 'id, email, name, password_hash, role, blocked';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function login(email, password, remember = true) {
  const user = await smallOne(`SELECT ${USER_COLS} FROM users WHERE email = ?`, [String(email || '').trim().toLowerCase()]);
  if (!user || !checkPassword(password, user.password_hash)) throw new HttpError(401, 'Wrong email or password');
  return createSession(user, remember);
}

// remember=false: the cookie ends when the browser closes (the row still expires after DAYS)
async function createSession(user, remember) {
  if (user.blocked) throw new HttpError(403, 'This account is blocked. Contact the admin.');
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + DAYS * 864e5);
  await small('DELETE FROM sessions WHERE expires_at < ?', [new Date().toISOString()]);
  await ensureLastSeen();
  await small('INSERT INTO sessions (token, user_id, expires_at, last_seen) VALUES (?, ?, ?, ?)',
    [token, user.id, expires.toISOString(), new Date().toISOString()]);
  return { token, expires: remember === false ? undefined : expires, user: publicUser(user) };
}

// Public sign-up (turn off with ALLOW_SIGNUP=false). New accounts are always customers.
export const signupAllowed = () => process.env.ALLOW_SIGNUP !== 'false';

export async function signup({ firstName, lastName, name, email, password, confirmPassword, remember } = {}) {
  if (!signupAllowed()) throw new HttpError(403, 'Sign-up is turned off. Ask the admin for an account.');
  const full = (firstName != null || lastName != null ? `${firstName || ''} ${lastName || ''}` : String(name || '')).replace(/\s+/g, ' ').trim();
  const e = String(email || '').trim().toLowerCase();
  if (firstName != null && !String(firstName).trim()) throw new HttpError(400, 'Enter your first name');
  if (!EMAIL_RE.test(e)) throw new HttpError(400, 'Enter a valid email');
  if (String(password || '').length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (confirmPassword != null && confirmPassword !== password) throw new HttpError(400, 'The two passwords do not match');
  if (await smallOne('SELECT 1 AS x FROM users WHERE email = ?', [e])) throw new HttpError(400, 'An account with this email already exists. Log in instead.');
  await small("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'user')",
    [e, full || null, hashPassword(password)]);
  return login(e, password, remember);
}

/**
 * Sign in with a Google account (email already verified by Google). A new
 * email gets a customer account with an unusable random password; they can
 * keep using Google, or the admin can set a password.
 */
export async function googleLogin({ email, name }, remember = true) {
  const e = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new HttpError(400, 'Google did not share an email address');
  let user = await smallOne(`SELECT ${USER_COLS} FROM users WHERE email = ?`, [e]);
  if (!user) {
    if (!signupAllowed()) throw new HttpError(403, 'No account for this email. Ask the admin for an account.');
    user = await smallOne(`INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'user') RETURNING ${USER_COLS}`,
      [e, String(name || '').trim() || null, hashPassword(crypto.randomBytes(24).toString('hex'))]);
  } else if (!user.name && name) {
    await small('UPDATE users SET name = ? WHERE id = ?', [String(name).trim(), user.id]);
    user.name = String(name).trim();
  }
  return createSession(user, remember);
}

export async function logout(token) {
  if (token) await small('DELETE FROM sessions WHERE token = ?', [token]);
}

export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

/** The logged-in user, or null */
export async function getUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  await ensureLastSeen();
  const now = Date.now();
  const u = await smallOne(
    `SELECT u.id, u.email, u.name, u.role, s.last_seen FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ? AND NOT u.blocked`,
    [token, new Date(now).toISOString()]);
  if (!u) return null;
  const seen = u.last_seen ? Date.parse(u.last_seen) : NaN;
  // No activity for IDLE_MINUTES: the session ends (a session from before last_seen counts as just seen)
  if (IDLE_MS && now - seen > IDLE_MS) {
    await small('DELETE FROM sessions WHERE token = ?', [token]);
    return null;
  }
  if (!(now - seen <= TOUCH_MS)) await small('UPDATE sessions SET last_seen = ? WHERE token = ?', [new Date(now).toISOString(), token]);
  return publicUser(u);
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
