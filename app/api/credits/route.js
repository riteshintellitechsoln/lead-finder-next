// GET /api/credits?from=&to= -> my download credits, requests and credit usage in that time (UTC stamps)
// POST /api/credits { amount, note } -> ask the admin for credits
import { myCredits, requestCredits } from '@/lib/credits';
import { requireUser } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => {
  const sp = new URL(request.url).searchParams;
  return myCredits(await requireUser(), { from: sp.get('from') || '', to: sp.get('to') || '' });
});

export const POST = handle(async (request) => {
  const user = await requireUser();
  return Response.json(await requestCredits(user, await readJson(request)), { status: 201 });
});
