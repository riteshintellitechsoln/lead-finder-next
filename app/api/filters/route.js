// GET /api/filters -> options with counts for the filter sidebar (signed-in users, cached)
import { getFilters } from '@/lib/people';
import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => (await requireUser()) && getFilters(request.signal));
