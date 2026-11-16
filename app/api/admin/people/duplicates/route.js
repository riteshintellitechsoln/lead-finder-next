// GET    /api/admin/people/duplicates -> { duplicates }: extra copies of people already in the data
// DELETE /api/admin/people/duplicates -> { removed }: deletes them, keeping the oldest row of each person
import { countDuplicates, removeDuplicates } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAdmin();
  return countDuplicates();
});

export const DELETE = handle(async () => {
  await requireAdmin();
  return removeDuplicates();
});
