// POST /api/lists?kind=company&format=csv&name=companies.csv   body: the raw file (or pasted text)
//   -> { id, kind, name, size, matched }. kind: title, company, domain, email, zip.
//   Use the id in a search: /api/people?companyList=<id> (include) or companyNotList=<id> (exclude).
// GET /api/lists?ids=a,b -> [{ id, kind, name, size, matched }]
import { createList, getLists } from '@/lib/lists';
import { requireUser } from '@/lib/auth';
import { handle, HttpError } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request) => {
  if (!request.body) throw new HttpError(400, 'Choose a file to upload');
  const sp = request.nextUrl.searchParams;
  return createList(request.body, {
    kind: sp.get('kind'),
    format: sp.get('format') === 'csv' ? 'csv' : 'lines',
    name: sp.get('name') || '',
    user: await requireUser(),
  });
});

export const GET = handle(async (request) => (await requireUser()) && getLists((request.nextUrl.searchParams.get('ids') || '').split(','), request.signal));
