// GET /api/stats -> numbers for the Home dashboard and sidebar badges (zeros for guests)
import { getStats } from '@/lib/people';
import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => getStats(await requireUser(), request.signal));
