// Task queries (server only)
import { db } from './db.js';

const byId = (id) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

export function listTasks() {
  return db.prepare('SELECT * FROM tasks ORDER BY done, due_date IS NULL, due_date, id').all();
}

export function addTask({ title, who, due_date } = {}) {
  const t = String(title || '').trim();
  if (!t) throw new HttpError(400, 'Task title is required');
  const due = /^\d{4}-\d{2}-\d{2}$/.test(due_date || '') ? due_date : null;
  const info = db.prepare('INSERT INTO tasks (title, who, due_date) VALUES (?, ?, ?)').run(t, String(who || '').trim() || null, due);
  return byId(info.lastInsertRowid);
}

export function setTaskDone(id, done) {
  const { changes } = db.prepare('UPDATE tasks SET done = ? WHERE id = ?').run(done ? 1 : 0, Number(id));
  if (!changes) throw new HttpError(404, 'Task not found');
  return byId(Number(id));
}

export function deleteTask(id) {
  return { removed: db.prepare('DELETE FROM tasks WHERE id = ?').run(Number(id)).changes };
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
