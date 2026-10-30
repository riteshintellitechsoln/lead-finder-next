// The logged-in person's own account: details, name / email change, password change (server only)
import { db } from './db.js';
import { checkPassword, hashPassword } from './password.js';
import { HttpError } from './route.js';

export function getProfile(userId) {
  const u = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(userId);
  if (!u) throw new HttpError(404, 'Account not found');
  const n = (sql) => db.prepare(sql).get(userId).n;
  return {
    ...u,
    saved: n('SELECT COUNT(*) AS n FROM saved WHERE user_id = ?'),
    tasks: n('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?'),
    openTasks: n('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND done = 0'),
    sessions: n("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"),
  };
}

export function updateProfile(userId, { name, email } = {}) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'Enter a valid email');
  if (db.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').get(e, userId)) {
    throw new HttpError(400, 'Another account already uses this email');
  }
  db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(String(name ?? '').trim() || null, e, userId);
  return getProfile(userId);
}

// Needs the current password. Other devices are logged out; this one stays logged in.
export function changePassword(userId, currentToken, { current, password } = {}) {
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  if (!u || !checkPassword(current, u.password_hash)) throw new HttpError(400, 'Current password is wrong');
  if (String(password || '').length < 6) throw new HttpError(400, 'New password must be at least 6 characters');
  if (password === current) throw new HttpError(400, 'New password must be different from the current one');
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(userId, currentToken);
  })();
  return { ok: true };
}
