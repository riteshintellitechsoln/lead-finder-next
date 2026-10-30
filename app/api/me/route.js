// GET /api/me -> my account   PATCH /api/me { name, email }
import { getProfile, updateProfile } from '@/lib/profile';
import { requireUser } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => getProfile((await requireUser()).id));

export const PATCH = handle(async (request) => updateProfile((await requireUser()).id, await readJson(request)));
