// POST /api/admin/import?replace=true   body: the raw CSV file
// The file is streamed to disk, so large files do not have to fit in memory.
import { importUpload } from '@/lib/import';
import { requireAdmin } from '@/lib/auth';
import { handle, HttpError } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request) => {
  await requireAdmin();
  if (!request.body) throw new HttpError(400, 'Choose a CSV file to upload');
  const log = [];
  try {
    const result = await importUpload(request.body, {
      replace: request.nextUrl.searchParams.get('replace') === 'true',
      log: (line) => log.push(line),
    });
    return { ...result, log };
  } catch (e) {
    if (e.status) e.message = [...log, e.message].join('\n');
    throw e;
  }
});
