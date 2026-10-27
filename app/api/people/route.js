// GET /api/people?personTitles=HR Manager&city=Pune&page=1&pageSize=25
import { searchPeople } from '@/lib/people';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle((request) => searchPeople(request.nextUrl.searchParams));
