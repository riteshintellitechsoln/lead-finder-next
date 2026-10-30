// DELETE /api/saved/:id
import { removeSaved } from '@/lib/people';
import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/route';

export const DELETE = handle(async (request, { params }) => removeSaved((await requireUser()).id, (await params).id));
