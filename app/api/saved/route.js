// POST /api/saved  { "ids": [1, 2, 3] }
import { saveLeads } from '@/lib/people';
import { requireUser } from '@/lib/auth';
import { handle, readJson, HttpError } from '@/lib/route';

export const POST = handle(async (request) => {
  const user = await requireUser();
  const { ids } = await readJson(request);
  const result = saveLeads(user.id, ids);
  if (!result.requested) throw new HttpError(400, 'Send { "ids": [1, 2, 3] }');
  return result;
});
