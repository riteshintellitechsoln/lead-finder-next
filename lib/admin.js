// Admin panel queries (server only): dashboard, users, people data.
// Every API route that calls these checks requireAdmin() first.
import { db } from './db.js';
import { hashPassword } from './password.js';
import { HttpError, toInt } from './route.js';
import { getBaseStats, getFilters, resetCaches } from './people.js';
import { guessSeniority } from './import.js';

const n = (sql, ...p) => db.prepare(sql).get(...p).n;

// ---------- dashboard ----------
export function adminStats() {
  return {
    ...getBaseStats(),
    users: n("SELECT COUNT(*) AS n FROM users WHERE role = 'user'"),
    newUsers7: n("SELECT COUNT(*) AS n FROM users WHERE role = 'user' AND created_at >= datetime('now', '-7 days')"),
    savedLeads: n('SELECT COUNT(*) AS n FROM saved'),
    recentUsers: db
      .prepare("SELECT id, email, name, created_at, blocked FROM users WHERE role = 'user' ORDER BY id DESC LIMIT 8")
      .all(),
    topCities: getFilters().city.slice(0, 8),
  };
}

// ---------- users ----------
const ROLES = ['user', 'admin'];
const cleanEmail = (e) => String(e || '').trim().toLowerCase();

export function listUsers() {
  return db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.blocked, u.created_at,
         (SELECT COUNT(*) FROM saved s WHERE s.user_id = u.id) AS saved,
         (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id) AS tasks
       FROM users u ORDER BY u.role, u.id`
    )
    .all();
}

export function createUser({ email, name, password, role } = {}) {
  const e = cleanEmail(email);
  if (!/^[^\s@]+@[^\s@]+$/.test(e)) throw new HttpError(400, 'Enter a valid email');
  if (String(password || '').length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(e)) throw new HttpError(400, 'A user with this email already exists');
  const r = ROLES.includes(role) ? role : 'user';
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(e, String(name || '').trim() || null, hashPassword(password), r);
  return { id: lastInsertRowid };
}

/** changes: { name, role, blocked, password } (any of them) */
export function updateUser(admin, id, changes = {}) {
  const uid = toInt(id, 0);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  if (!user) throw new HttpError(404, 'User not found');
  const self = uid === admin.id;
  if (self && (changes.blocked || (changes.role && changes.role !== 'admin'))) {
    throw new HttpError(400, 'You cannot block yourself or remove your own admin role');
  }
  if ('name' in changes) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(String(changes.name || '').trim() || null, uid);
  if (ROLES.includes(changes.role)) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(changes.role, uid);
  if ('blocked' in changes) {
    db.prepare('UPDATE users SET blocked = ? WHERE id = ?').run(changes.blocked ? 1 : 0, uid);
    if (changes.blocked) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid); // log them out now
  }
  if (changes.password != null) {
    if (String(changes.password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(changes.password), uid);
    if (!self) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
  }
  return { ok: true };
}

// Removes the user with their sessions, saved leads and tasks
export function deleteUser(admin, id) {
  const uid = toInt(id, 0);
  if (uid === admin.id) throw new HttpError(400, 'You cannot delete your own account');
  const removed = db.transaction(() => {
    for (const t of ['sessions', 'saved', 'tasks']) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(uid);
    return db.prepare('DELETE FROM users WHERE id = ?').run(uid).changes;
  })();
  if (!removed) throw new HttpError(404, 'User not found');
  return { removed };
}

// ---------- people data ----------
const FIELDS = ['name', 'title', 'seniority', 'company', 'industry', 'employees', 'city', 'email'];

function cleanPerson(data) {
  const p = {};
  for (const f of FIELDS) {
    const v = data?.[f];
    p[f] = f === 'employees' ? (v === '' || v == null ? null : toInt(v, null)) : String(v ?? '').trim() || null;
  }
  if (!p.name) throw new HttpError(400, 'Name is required');
  if (p.email && !/^[^\s@]+@[^\s@]+$/.test(p.email)) throw new HttpError(400, 'Email does not look valid');
  if (!p.seniority) p.seniority = guessSeniority(p.title || '');
  return p;
}

export function addPerson(data) {
  const p = cleanPerson(data);
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO people (${FIELDS.join(', ')}) VALUES (${FIELDS.map(() => '?').join(', ')})`)
    .run(...FIELDS.map((f) => p[f]));
  resetCaches();
  return db.prepare('SELECT * FROM people WHERE id = ?').get(lastInsertRowid);
}

export function updatePerson(id, data) {
  const p = cleanPerson(data);
  const { changes } = db
    .prepare(`UPDATE people SET ${FIELDS.map((f) => f + ' = ?').join(', ')} WHERE id = ?`)
    .run(...FIELDS.map((f) => p[f]), toInt(id, 0));
  if (!changes) throw new HttpError(404, 'Person not found');
  resetCaches();
  return db.prepare('SELECT * FROM people WHERE id = ?').get(toInt(id, 0));
}

export function deletePerson(id) {
  const pid = toInt(id, 0);
  const removed = db.transaction(() => {
    db.prepare('DELETE FROM saved WHERE person_id = ?').run(pid);
    return db.prepare('DELETE FROM people WHERE id = ?').run(pid).changes;
  })();
  if (!removed) throw new HttpError(404, 'Person not found');
  resetCaches();
  return { removed };
}
