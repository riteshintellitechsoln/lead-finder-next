// GET /api/filters -> options with counts for the filter sidebar
import { getFilters } from '@/lib/people';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(() => getFilters());
