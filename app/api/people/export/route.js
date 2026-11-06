// GET /api/people/export?<same filters as /api/people>  -> CSV download (max MAX_EXPORT_ROWS rows)
// ids=1,2,3 for selected people; saved=true for the logged-in user's saved leads.
// Streamed about 2,000 rows at a time, so memory stays flat for any size.
// Users pay 1 credit per row (lib/credits.js); admins download without limit.
// check=1 -> { rows, companies, credits, unlimited } without downloading (the download window asks).
// dlCompanies, dlPerCompany, dlSeniority, dlFunction, dlTitle: the user's choices (see exportQuery).
import { EXPORT_COLUMNS, csvCell, exportQuery } from '@/lib/people';
import { queryOne, streamRows } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getBalance, isUnlimited, spendCredits } from '@/lib/credits';
import { HttpError, handle } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => {
  const sp = request.nextUrl.searchParams;
  const user = await requireUser();
  const { sql, params, countSql } = await exportQuery(sp, user, request.signal);
  const name = sp.get('savedList') ? `saved-list-${Number(sp.get('savedList')) || 0}`
    : sp.get('saved') === 'true' ? 'saved-leads' : sp.get('ids') ? 'selected-people' : 'people';
  const unlimited = isUnlimited(user);
  if (sp.get('check') === '1' || !unlimited) {
    const { n, companies } = await queryOne(countSql, params, { signal: request.signal });
    if (sp.get('check') === '1') return { rows: n, companies, unlimited, credits: unlimited ? null : await getBalance(user.id) };
    if (!n) throw new HttpError(400, 'Nothing to download');
    const filters = new URLSearchParams(sp);
    ['page', 'pageSize', 'check', 'limit', 'ids', 'saved', 'savedList'].forEach((k) => filters.delete(k));
    await spendCredits(user, n, name, { query: filters.toString(), sql, params });
  }
  const rows = streamRows(sql, params, { signal: request.signal });
  const enc = new TextEncoder();
  let started = false;
  const stream = new ReadableStream({
    // pull() runs only when the browser is ready for more data (backpressure)
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          // BOM so Excel reads UTF-8 (Indian names, symbols) correctly
          controller.enqueue(enc.encode('﻿' + EXPORT_COLUMNS.map(([, h]) => h).join(',') + '\r\n'));
        }
        const { value, done } = await rows.next();
        if (done) return controller.close();
        let out = '';
        for (const r of value) out += EXPORT_COLUMNS.map(([k]) => csvCell(r[k])).join(',') + '\r\n';
        controller.enqueue(enc.encode(out));
      } catch (e) {
        if (e?.name !== 'AbortError') console.error('[export]', e);
        controller.error(e);
      }
    },
    async cancel() {
      await rows.return();
    },
  }, { highWaterMark: 1 });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
