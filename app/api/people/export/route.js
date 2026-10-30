// GET /api/people/export?<same filters as /api/people>  -> CSV download (max MAX_EXPORT_ROWS rows)
// Open to everyone, like the search itself. saved=true needs a logged-in user.
import { exportStream } from '@/lib/people';
import { getUser } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => {
  const user = await getUser();
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(exportStream(request.nextUrl.searchParams, user), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="people-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
