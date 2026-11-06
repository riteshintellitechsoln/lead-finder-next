// GET /api/tasks   POST /api/tasks { title, who, due_date: "YYYY-MM-DD" }
import { listTasks, addTask } from '@/lib/tasks';
import { requireUser } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => listTasks((await requireUser()).id, request.signal));

export const POST = handle(async (request) => {
  const user = await requireUser();
  return Response.json(await addTask(user.id, await readJson(request)), { status: 201 });
});
