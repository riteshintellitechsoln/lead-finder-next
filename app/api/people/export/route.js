// GET /api/people/export?<same filters as /api/people>  -> CSV download (max MAX_EXPORT_ROWS rows)
import { exportStream } from '@/lib/people';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle((request) => {
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(exportStream(request.nextUrl.searchParams), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="people-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
