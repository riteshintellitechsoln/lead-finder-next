// GET /api/admin/saves?q=&user=&type=&from=&to= -> what every user saved (newest first)
import { listAllSaves } from '@/lib/admin';
import { requireAdmin } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => {
  await requireAdmin();
  const sp = new URL(request.url).searchParams;
  const get = (k) => sp.get(k) || '';
  return listAllSaves({ q: get('q'), user: get('user'), type: get('type'), from: get('from'), to: get('to') });
});
