// GET /api/filters -> options with counts for the filter sidebar (public)
import { getFilters } from '@/lib/people';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(() => getFilters());
