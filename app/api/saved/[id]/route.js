// DELETE /api/saved/:id
import { removeSaved } from '@/lib/people';
import { handle } from '@/lib/route';

export const DELETE = handle(async (request, { params }) => removeSaved((await params).id));
