// GET    /api/saved                                           { lists: [...], individual: <count> }
// POST   /api/saved  { "ids": [1, 2, 3] }                    save these people (one by one)
//                    { "query": "industry=Software&...", "name": "...", "summary": "..." }
//                                                          save everything matching these filters as ONE list
//                    { "query": "...", "name": "...", "summary": "...", "filtersOnly": true }
//                                                          save only the filters (a saved search)
// DELETE /api/saved                                         remove all leads saved one by one
import { clearSaved, listSavedLists, saveFilters, saveLeads, saveSearch } from '@/lib/people';
import { requireUser } from '@/lib/auth';
import { handle, readJson, HttpError } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => listSavedLists((await requireUser()).id));

export const POST = handle(async (request) => {
  const user = await requireUser();
  const body = await readJson(request);
  if (typeof body.query === 'string' && body.filtersOnly) {
    return saveFilters(user, new URLSearchParams(body.query), { name: body.name, summary: body.summary }, request.signal);
  }
  if (typeof body.query === 'string') {
    return saveSearch(user, new URLSearchParams(body.query), { name: body.name, summary: body.summary }, request.signal);
  }
  const result = await saveLeads(user.id, body.ids);
  if (!result.requested) throw new HttpError(400, 'Send { "ids": [1, 2, 3] } or { "query": "<filters>" }');
  return result;
});

export const DELETE = handle(async () => clearSaved((await requireUser()).id));
