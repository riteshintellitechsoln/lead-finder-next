// GET /api/admin/import/:id?reason=wrong|duplicate&page=1 -> one upload and a page of the rows it left out
// GET /api/admin/import/:id?reason=wrong|duplicate&format=csv -> all of those rows as a CSV file
// DELETE /api/admin/import/:id -> removes the upload from the list (the people it added stay)
import { allSkipped, deleteImport, getImport } from '@/lib/import';
import { requireAdmin } from '@/lib/auth';
import { handle } from '@/lib/route';
import { whyText } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

const COLUMNS = [
  ['file_row', 'Row in file'], ['name', 'Name'], ['email', 'Email'], ['company', 'Company'],
  ['employees', 'Company headcount'], ['department', 'Function'], ['seniority', 'Seniority level'],
  ['country', 'Country'], ['industry', 'Industry'], ['why', 'Why not uploaded'],
];
const cell = (v) => (/[",\r\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));

export const GET = handle(async (request, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const reason = sp.get('reason') || 'wrong';
  if (sp.get('format') !== 'csv') return getImport(id, { reason, page: sp.get('page') });
  const rows = await allSkipped(id, reason);
  const lines = [COLUMNS.map(([, h]) => h).join(',')];
  for (const r of rows) lines.push(COLUMNS.map(([k]) => cell(k === 'why' ? whyText(r) : r[k])).join(','));
  return new Response('\ufeff' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="upload-${Number(id) || 0}-${reason === 'wrong' ? 'wrong-values' : 'duplicates'}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});

export const DELETE = handle(async (request, { params }) => {
  await requireAdmin();
  return deleteImport((await params).id);
});
