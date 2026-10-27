// GET /api/stats -> numbers for the Home dashboard and sidebar badges
import { getStats } from '@/lib/people';
import { handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(() => getStats());
