// GET /api/admin/import/template              -> empty CSV with every column the upload reads
// GET /api/admin/import/template?kind=values  -> CSV of the allowed values for the required (*) columns
// The headers are names lib/csv.js recognises (it ignores case, spaces and symbols such as * and /).
import { requireAdmin } from '@/lib/auth';
import { handle } from '@/lib/route';
import { COUNTRIES, FUNCTIONS, INDUSTRIES, SENIORITY_LEVELS, SIZE_KEYS } from '@/lib/options';

export const dynamic = 'force-dynamic';

// * = required: a row with that cell empty or not in the allowed list is not uploaded
const HEADERS = [
  'Name', 'Job title', 'Seniority *', 'Function *', 'Email', 'Phone', 'Direct phone', 'Company',
  'Address 1', 'Address 2', 'City', 'State', 'Zip / Postal code', 'Country *', 'Industry *',
  'Employee size *', 'Revenue', 'Company LinkedIn', 'Employee LinkedIn', 'Updated on',
];
const VALUES = [
  ['Seniority *', SENIORITY_LEVELS], ['Function *', FUNCTIONS], ['Country *', COUNTRIES],
  ['Industry *', INDUSTRIES], ['Employee size *', SIZE_KEYS],
];

const cell = (v) => (/[",\r\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
const csv = (rows, fileName) => new Response(`﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`, {
  headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'no-store',
  },
});

export const GET = handle(async (request) => {
  await requireAdmin();
  if (request.nextUrl.searchParams.get('kind') === 'values') {
    // One column per required field, side by side
    const n = Math.max(...VALUES.map(([, v]) => v.length));
    const rows = [VALUES.map(([h]) => h)];
    for (let i = 0; i < n; i++) rows.push(VALUES.map(([, v]) => v[i] ?? ''));
    return csv(rows, 'lead-finder-allowed-values.csv');
  }
  return csv([HEADERS], 'lead-finder-upload-template.csv');
});
