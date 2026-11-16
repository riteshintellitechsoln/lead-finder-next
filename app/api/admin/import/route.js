// POST /api/admin/import?replace=true&name=people.csv   body: the raw CSV file
// The file is streamed to disk, so large files do not have to fit in memory.
// GET  /api/admin/import -> the latest uploads (one line each)
import { importUpload, listImports } from '@/lib/import';
import { requireAdmin } from '@/lib/auth';
import { handle, HttpError } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAdmin();
  return { imports: await listImports() };
});

export const POST = handle(async (request) => {
  const admin = await requireAdmin();
  if (!request.body) throw new HttpError(400, 'Choose a CSV file to upload');
  const sp = request.nextUrl.searchParams;
  const log = [];
  try {
    return await importUpload(request.body, {
      replace: sp.get('replace') === 'true',
      fileName: sp.get('name') || '',
      userId: admin.id,
      log: (line) => log.push(line),
    });
  } catch (e) {
    // The admin sees only the short reason; the steps go to the server console
    console.log(['[import] Not uploaded:', ...log, e.message].join('\n  '));
    throw e;
  }
});
