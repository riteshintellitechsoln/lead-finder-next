// GET /api/admin/credits -> credit requests (pending first)
import { listCreditRequests } from '@/lib/credits';
import { requireAdmin } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAdmin();
  return listCreditRequests();
});
