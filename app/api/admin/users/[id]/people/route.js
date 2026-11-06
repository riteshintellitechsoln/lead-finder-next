// GET /api/admin/users/:id/people?source=search|list|download|individual&ref=<id>&page=1&q=&verifiedFrom=&verifiedTo=
// The people in one user's saved search, saved list or download (read only).
import { getUserRecords } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request, { params }) => {
  await requireAdmin();
  const sp = request.nextUrl.searchParams;
  return getUserRecords((await params).id, sp.get('source'), sp.get('ref'), sp.get('page'), {
    q: sp.get('q'), verifiedFrom: sp.get('verifiedFrom'), verifiedTo: sp.get('verifiedTo'),
  });
});
