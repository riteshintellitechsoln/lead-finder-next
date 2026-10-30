// Task queries (server only). Every task belongs to one user.
import { db } from './db.js';
import { HttpError } from './route.js';

export { HttpError };

const byId = (userId, id) => db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);

export function listTasks(userId) {
  return db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY done, due_date IS NULL, due_date, id').all(userId);
}

export function addTask(userId, { title, who, due_date } = {}) {
  const t = String(title || '').trim();
  if (!t) throw new HttpError(400, 'Task title is required');
  const due = /^\d{4}-\d{2}-\d{2}$/.test(due_date || '') ? due_date : null;
  const info = db
    .prepare('INSERT INTO tasks (user_id, title, who, due_date) VALUES (?, ?, ?, ?)')
    .run(userId, t, String(who || '').trim() || null, due);
  return byId(userId, info.lastInsertRowid);
}

export function setTaskDone(userId, id, done) {
  const { changes } = db.prepare('UPDATE tasks SET done = ? WHERE id = ? AND user_id = ?').run(done ? 1 : 0, Number(id), userId);
  if (!changes) throw new HttpError(404, 'Task not found');
  return byId(userId, Number(id));
}

export function deleteTask(userId, id) {
  return { removed: db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(Number(id), userId).changes };
}
