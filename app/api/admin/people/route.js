// GET /api/admin/people?<same filters as /api/people>   POST /api/admin/people { name, title, ... }
import { searchPeople } from '@/lib/people';
import { addPerson } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => searchPeople(request.nextUrl.searchParams, await requireAdmin(), request.signal));

export const POST = handle(async (request) => {
  await requireAdmin();
  return Response.json(await addPerson(await readJson(request)), { status: 201 });
});
