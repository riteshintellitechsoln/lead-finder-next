// Task queries (server only). Every task belongs to one user.
import { small, smallOne } from './db.js';
import { HttpError } from './route.js';

export { HttpError };

const COLS = "id, user_id, title, who, due_date, CASE WHEN done THEN 1 ELSE 0 END AS done, strftime(created_at, '%Y-%m-%d %H:%M:%S') AS created_at";
const byId = (userId, id) => smallOne(`SELECT ${COLS} FROM tasks WHERE id = ? AND user_id = ?`, [id, userId]);

export function listTasks(userId, signal) {
  return small(`SELECT ${COLS} FROM tasks WHERE user_id = ? ORDER BY done, due_date IS NULL, due_date, id`, [userId], { signal });
}

export async function addTask(userId, { title, who, due_date } = {}) {
  const t = String(title || '').trim().slice(0, 300);
  if (!t) throw new HttpError(400, 'Task title is required');
  const due = /^\d{4}-\d{2}-\d{2}$/.test(due_date || '') && !Number.isNaN(Date.parse(due_date)) ? due_date : null;
  const row = await smallOne('INSERT INTO tasks (user_id, title, who, due_date) VALUES (?, ?, ?, ?) RETURNING id',
    [userId, t, String(who || '').trim().slice(0, 200) || null, due]);
  return byId(userId, row.id);
}

export async function setTaskDone(userId, id, done) {
  const r = await small('UPDATE tasks SET done = ? WHERE id = ? AND user_id = ? RETURNING id', [Boolean(done), Number(id) || 0, userId]);
  if (!r.length) throw new HttpError(404, 'Task not found');
  return byId(userId, Number(id));
}

export async function deleteTask(userId, id) {
  const r = await small('DELETE FROM tasks WHERE id = ? AND user_id = ? RETURNING id', [Number(id) || 0, userId]);
  return { removed: r.length };
}
