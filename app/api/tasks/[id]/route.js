// PATCH /api/tasks/:id { done: true }   DELETE /api/tasks/:id
import { setTaskDone, deleteTask } from '@/lib/tasks';
import { requireUser } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const PATCH = handle(async (request, { params }) => {
  const user = await requireUser();
  const { done } = await readJson(request);
  return setTaskDone(user.id, (await params).id, done);
});

export const DELETE = handle(async (request, { params }) => deleteTask((await requireUser()).id, (await params).id));
