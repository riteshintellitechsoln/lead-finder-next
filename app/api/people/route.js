// GET /api/people?personTitles=HR Manager&city=Pune&page=1&pageSize=25
// Public. Emails are shown only for leads the logged-in user bought; the admin sees everything.
import { searchPeople } from '@/lib/people';
import { getUser } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => searchPeople(request.nextUrl.searchParams, await getUser()));
