// GET /api/credits -> my download credits, requests and downloads
// POST /api/credits { amount, note } -> ask the admin for credits
import { myCredits, requestCredits } from '@/lib/credits';
import { requireUser } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => myCredits(await requireUser()));

export const POST = handle(async (request) => {
  const user = await requireUser();
  return Response.json(await requestCredits(user, await readJson(request)), { status: 201 });
});
