'use client';
import { formatDue, todayISO } from '@/lib/format';
import { useSession } from './Session';
import { useToast } from './Toast';

export default function TaskItem({ task, onChanged }) {
  const toast = useToast();
  const session = useSession();
  const overdue = !task.done && task.due_date && task.due_date <= todayISO();

  async function run(action) {
    try {
      await action();
      onChanged?.();
    } catch (e) {
      toast(e.message);
    }
  }

  return (
    <div className={'li' + (task.done ? ' done' : '')}>
      <input
        type="checkbox"
        aria-label="Mark done"
        checked={!!task.done}
        onChange={(e) => run(() => session.setTaskDone(task.id, e.target.checked))}
      />
      <div className="grow">
        <div className="nm">{task.title}</div>
        <div className="meta">{task.who || ''}</div>
      </div>
      <span className={'pill' + (task.done ? ' ok' : overdue ? ' due' : '')}>{task.done ? 'Done' : formatDue(task.due_date)}</span>
      <button className="icon-btn" type="button" aria-label="Delete task" onClick={() => run(() => session.deleteTask(task.id))}>
        ✕
      </button>
    </div>
  );
}
