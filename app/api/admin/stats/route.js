// GET /api/admin/stats -> dashboard numbers
import { adminStats } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAdmin();
  return adminStats();
});
