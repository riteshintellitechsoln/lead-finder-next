// POST /api/auth/login { email, password, guest?: { saved, tasks } } -> sets the session cookie
import { login } from '@/lib/auth';
import { startSession } from '@/lib/session';
import { handle, readJson } from '@/lib/route';

export const POST = handle(async (request) => {
  const { email, password, guest } = await readJson(request);
  return startSession(request, login(email, password), guest);
});
