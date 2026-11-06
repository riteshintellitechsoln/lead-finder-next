// POST /api/auth/signup { firstName, lastName, email, password, confirmPassword, remember?, guest? } -> creates a customer account and logs in
import { signup } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';
import { startSession } from '@/lib/session';

export const POST = handle(async (request) => {
  const body = await readJson(request);
  return Response.json(await startSession(request, await signup(body), body.guest), { status: 201 });
});
