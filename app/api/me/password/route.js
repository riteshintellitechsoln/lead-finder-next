// POST /api/me/password { current, password } -> logs out other devices, keeps this one
import { cookies } from 'next/headers';
import { changePassword } from '@/lib/profile';
import { requireUser, COOKIE } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const POST = handle(async (request) => {
  const user = await requireUser();
  const token = (await cookies()).get(COOKIE)?.value;
  return changePassword(user.id, token, await readJson(request));
});
