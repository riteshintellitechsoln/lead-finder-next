// GET /api/people/export/options?<same filters as the export> -> what the download window offers
import { requireUser } from '@/lib/auth';
import { downloadOptions } from '@/lib/people';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => {
  const user = await requireUser();
  return downloadOptions(request.nextUrl.searchParams, user, request.signal);
});
