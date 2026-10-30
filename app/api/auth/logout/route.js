// POST /api/auth/logout
import { cookies } from 'next/headers';
import { logout, COOKIE } from '@/lib/auth';
import { handle } from '@/lib/route';

export const POST = handle(async () => {
  const store = await cookies();
  logout(store.get(COOKIE)?.value);
  store.delete(COOKIE);
  return { ok: true };
});
