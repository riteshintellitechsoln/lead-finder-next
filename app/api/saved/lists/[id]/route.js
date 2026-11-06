// GET    /api/saved/lists/:id                   { id, name, summary, query, created_at, size }
// PATCH  /api/saved/lists/:id  { "name": "..." }  rename
// DELETE /api/saved/lists/:id                   delete the list (the people stay in the database)
// The people of a list: GET /api/people?savedList=:id (and /api/people/export?savedList=:id)
import { deleteSavedList, getSavedList, renameSavedList } from '@/lib/people';
import { requireUser } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request, { params }) => getSavedList((await requireUser()).id, (await params).id));

export const PATCH = handle(async (request, { params }) => {
  const user = await requireUser();
  const body = await readJson(request);
  return renameSavedList(user.id, (await params).id, body.name);
});

export const DELETE = handle(async (request, { params }) => deleteSavedList((await requireUser()).id, (await params).id));
