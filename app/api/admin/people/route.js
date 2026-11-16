// GET    /api/admin/people?<same filters as /api/people>   POST /api/admin/people { name, title, ... }
// DELETE /api/admin/people?ids=1,2,3          delete the picked people
// DELETE /api/admin/people?<filters>          delete everyone matching (e.g. q, verifiedFrom, verifiedTo)
// DELETE /api/admin/people?all=true           delete everyone (only with all=true)
import { searchPeople } from '@/lib/people';
import { addPerson, deletePeople } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => searchPeople(request.nextUrl.searchParams, await requireAdmin(), request.signal));

export const POST = handle(async (request) => {
  await requireAdmin();
  return Response.json(await addPerson(await readJson(request)), { status: 201 });
});

export const DELETE = handle(async (request) => deletePeople(request.nextUrl.searchParams, await requireAdmin()));
