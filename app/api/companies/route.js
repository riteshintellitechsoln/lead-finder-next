// GET /api/companies?q=&page=&pageSize= (public)
import { searchCompanies } from '@/lib/people';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle((request) => searchCompanies(request.nextUrl.searchParams));
