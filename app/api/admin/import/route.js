// POST /api/admin/import?replace=true   body: the raw CSV file
// The file is read as a stream, so large files do not have to fit in memory.
import { Readable } from 'node:stream';
import { importCsv } from '@/lib/import';
import { resetCaches } from '@/lib/people';
import { requireAdmin } from '@/lib/auth';
import { handle, HttpError } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request) => {
  await requireAdmin();
  if (!request.body) throw new HttpError(400, 'Choose a CSV file to upload');
  const log = [];
  try {
    const result = await importCsv(Readable.fromWeb(request.body), {
      replace: request.nextUrl.searchParams.get('replace') === 'true',
      log: (line) => log.push(line),
    });
    return { ...result, log };
  } finally {
    resetCaches();
  }
});
