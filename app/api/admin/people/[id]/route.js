// PATCH /api/admin/people/:id { name, title, ... }   DELETE /api/admin/people/:id
import { updatePerson, deletePerson } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const PATCH = handle(async (request, { params }) => {
  await requireAdmin();
  return updatePerson((await params).id, await readJson(request));
});

export const DELETE = handle(async (request, { params }) => {
  await requireAdmin();
  return deletePerson((await params).id);
});
