// POST /api/auth/ping -> { ok: true } while the session is alive (401 when it has ended).
// The browser calls it while the person is active, so the idle logout does not hit them (components/IdleLogout.js).
import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const POST = handle(async () => {
  await requireUser();
  return { ok: true };
});
