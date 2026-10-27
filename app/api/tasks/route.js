// GET /api/tasks   POST /api/tasks { title, who, due_date: "YYYY-MM-DD" }
import { listTasks, addTask } from '@/lib/tasks';
import { handle, readJson } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(() => listTasks());

export const POST = handle(async (request) => Response.json(addTask(await readJson(request)), { status: 201 }));
