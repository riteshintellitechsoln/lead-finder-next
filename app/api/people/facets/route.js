// GET /api/people/facets?<same filters as /api/people>
//   -> live counts for every filter option, respecting the other active filters
// GET /api/people/facets?<filters>&facet=city&fq=pu -> one group, options containing "pu"
import { getFacets } from '@/lib/people';
import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => getFacets(request.nextUrl.searchParams, await requireUser(), request.signal));
