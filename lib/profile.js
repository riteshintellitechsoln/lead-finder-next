// The logged-in person's own account: details, name / email change, password change (server only)
import { small, smallOne, transaction } from './db.js';
import { checkPassword, hashPassword } from './password.js';
import { HttpError } from './route.js';

export async function getProfile(userId) {
  const u = await smallOne(`SELECT id, email, name, role, strftime(created_at, '%Y-%m-%d %H:%M:%S') AS created_at,
      (SELECT count(*) FROM saved_lists WHERE user_id = u.id) AS saved,
      (SELECT count(*) FROM tasks WHERE user_id = u.id) AS tasks,
      (SELECT count(*) FROM tasks WHERE user_id = u.id AND NOT done) AS "openTasks",
      (SELECT count(*) FROM sessions WHERE user_id = u.id AND expires_at > ?) AS sessions
    FROM users u WHERE id = ?`, [new Date().toISOString(), userId]);
  if (!u) throw new HttpError(404, 'Account not found');
  return u;
}

export async function updateProfile(userId, { name, email } = {}) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'Enter a valid email');
  if (await smallOne('SELECT 1 AS x FROM users WHERE email = ? AND id <> ?', [e, userId])) {
    throw new HttpError(400, 'Another account already uses this email');
  }
  await small('UPDATE users SET name = ?, email = ? WHERE id = ?', [String(name ?? '').trim() || null, e, userId]);
  return getProfile(userId);
}

// Needs the current password. Other devices are logged out; this one stays logged in.
export async function changePassword(userId, currentToken, { current, password } = {}) {
  const u = await smallOne('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!u || !checkPassword(current, u.password_hash)) throw new HttpError(400, 'Current password is wrong');
  if (String(password || '').length < 6) throw new HttpError(400, 'New password must be at least 6 characters');
  if (password === current) throw new HttpError(400, 'New password must be different from the current one');
  await transaction(async (run) => {
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), userId]);
    await run('DELETE FROM sessions WHERE user_id = ? AND token <> ?', [userId, currentToken || '']);
  });
  return { ok: true };
}
