// GET /api/locations?zip=411001&zip=560001 -> { '411001': { city, county, state, country, people } }
// Fills in where a zip code is, for the Location filter.
import { lookupZips } from '@/lib/people';
import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => (await requireUser()) && lookupZips(request.nextUrl.searchParams.getAll('zip'), request.signal));
