// GET /api/people?personTitles=HR Manager&city=Pune&page=1&pageSize=25
// Signed-in users. Filters: q, company, personTitles, personNotTitles, city, seniority, industry,
// employees (1-10 ... 10001+), hasEmail (true/false), saved=true, ids=1,2,3.
// Sort: sortBy (name, title, company, city, seniority, employees), sortDir (asc/desc).
import { searchPeople } from '@/lib/people';
import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => searchPeople(request.nextUrl.searchParams, await requireUser(), request.signal));
