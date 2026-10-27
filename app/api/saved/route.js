// POST /api/saved  { "ids": [1, 2, 3] }
import { saveLeads } from '@/lib/people';
import { handle, readJson } from '@/lib/route';
import { HttpError } from '@/lib/tasks';

export const POST = handle(async (request) => {
  const { ids } = await readJson(request);
  const result = saveLeads(ids);
  if (!result.requested) throw new HttpError(400, 'Send { "ids": [1, 2, 3] }');
  return result;
});
