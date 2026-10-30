// PATCH /api/admin/users/:id { name?, role?, blocked?, password? }   DELETE /api/admin/users/:id
import { updateUser, deleteUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const PATCH = handle(async (request, { params }) => {
  const admin = await requireAdmin();
  return updateUser(admin, (await params).id, await readJson(request));
});

export const DELETE = handle(async (request, { params }) => deleteUser(await requireAdmin(), (await params).id));
