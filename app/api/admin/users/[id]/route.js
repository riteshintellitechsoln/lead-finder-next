// GET /api/admin/users/:id?q=&from=&to=   PATCH /api/admin/users/:id { name?, role?, blocked?, password?, addCredits? }   DELETE /api/admin/users/:id
import { getUserDetail, updateUser, deleteUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request, { params }) => {
  await requireAdmin();
  const sp = request.nextUrl.searchParams;
  return getUserDetail((await params).id, { q: sp.get('q') || '', from: sp.get('from') || '', to: sp.get('to') || '' });
});

export const PATCH = handle(async (request, { params }) => {
  const admin = await requireAdmin();
  return updateUser(admin, (await params).id, await readJson(request));
});

export const DELETE = handle(async (request, { params }) => deleteUser(await requireAdmin(), (await params).id));
