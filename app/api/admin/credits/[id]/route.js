// PATCH /api/admin/credits/:id { action: 'approve' | 'reject', amount?, note? }
import { decideCreditRequest } from '@/lib/credits';
import { requireAdmin } from '@/lib/auth';
import { handle, readJson } from '@/lib/route';

export const PATCH = handle(async (request, { params }) => {
  await requireAdmin();
  return decideCreditRequest((await params).id, await readJson(request));
});
