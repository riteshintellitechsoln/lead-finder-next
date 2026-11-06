// GET /api/admin/users   POST /api/admin/users { email, name, password, role }
import { listUsers, createUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAdmin();
  return listUsers();
});

export const POST = handle(async (request) => {
  await requireAdmin();
  return Response.json(await createUser(await readJson(request)), { status: 201 });
});
