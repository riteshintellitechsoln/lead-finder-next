// A guest's saved leads and tasks live only in the browser. When they log in
// or sign up, the browser sends them along and they are copied into the account.
import { saveLeads } from './people.js';
import { addTask } from './tasks.js';

export async function mergeGuest(user, guest) {
  if (!guest || user.role !== 'user') return null;
  const result = { saved: 0, tasks: 0 };
  if (Array.isArray(guest.saved) && guest.saved.length) result.saved = (await saveLeads(user.id, guest.saved)).added;
  for (const t of (Array.isArray(guest.tasks) ? guest.tasks : []).slice(0, 200)) {
    try {
      await addTask(user.id, t);
      result.tasks++;
    } catch {
      // a task without a title is skipped; it must not block the login
    }
  }
  return result;
}
