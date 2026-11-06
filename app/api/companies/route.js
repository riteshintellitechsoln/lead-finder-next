// GET /api/companies?q=&page=&pageSize=&sort=people|name|employees (signed-in users)
import { searchCompanies } from '@/lib/people';
import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => (await requireUser()) && searchCompanies(request.nextUrl.searchParams, request.signal));
