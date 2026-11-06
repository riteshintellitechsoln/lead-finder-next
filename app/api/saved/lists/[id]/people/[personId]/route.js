// DELETE /api/saved/lists/:id/people/:personId   remove one person from a saved list
import { removeFromSavedList } from '@/lib/people';
import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/route';

export const DELETE = handle(async (request, { params }) => {
  const { id, personId } = await params;
  return removeFromSavedList((await requireUser()).id, id, personId);
});
