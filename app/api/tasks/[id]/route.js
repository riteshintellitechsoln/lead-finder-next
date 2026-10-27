// PATCH /api/tasks/:id { done: true }   DELETE /api/tasks/:id
import { setTaskDone, deleteTask } from '@/lib/tasks';
import { handle, readJson } from '@/lib/route';

export const PATCH = handle(async (request, { params }) => {
  const { done } = await readJson(request);
  return setTaskDone((await params).id, done);
});

export const DELETE = handle(async (request, { params }) => deleteTask((await params).id));
