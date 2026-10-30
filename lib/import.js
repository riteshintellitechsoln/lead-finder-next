// Imports people from a CSV stream (server only). Used by scripts/import-csv.js
// and by the admin "Upload CSV" page. Reads the file as a stream, so millions of
// rows work without running out of memory.
//
// Column names are detected automatically (case-insensitive). Edit COLUMN_NAMES
// below if your CSV uses different header names.
import { parse } from 'csv-parse';
import { db, createIndexes, dropIndexes } from './db.js';
import { HttpError } from './route.js';

const COLUMN_NAMES = {
  name: ['name', 'full name', 'full_name', 'person name', 'contact name'],
  first_name: ['first name', 'first_name', 'firstname'],
  last_name: ['last name', 'last_name', 'lastname'],
  title: ['title', 'job title', 'job_title', 'designation', 'person title', 'position'],
  seniority: ['seniority', 'level'],
  company: ['company', 'company name', 'company_name', 'organization', 'organisation', 'account name'],
  industry: ['industry', 'sector'],
  employees: ['employees', '# employees', 'employee count', 'num employees', 'company size', 'employees count'],
  city: ['city', 'location', 'person city', 'town'],
  email: ['email', 'email address', 'work email', 'e-mail', 'email_id'],
};

// Guess seniority from the job title when the CSV has no seniority column
export function guessSeniority(title = '') {
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cfo|coo|chro|cmo|chief)\b/.test(t)) return 'C-Suite';
  if (/\b(founder|owner|proprietor)\b/.test(t)) return 'Owner';
  if (/\b(vp|vice president)\b/.test(t)) return 'VP';
  if (/\bdirector\b/.test(t)) return 'Director';
  if (/\bhead\b/.test(t)) return 'Head';
  if (/\bmanager\b/.test(t)) return 'Manager';
  if (/\b(senior|sr\.?|lead|principal)\b/.test(t)) return 'Senior';
  return title ? 'Entry' : null;
}
// "1,200" -> 1200, "51-200" -> 51
export const toEmployees = (v) => {
  const m = String(v || '').replace(/,/g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

function mapHeader(header, log) {
  const lower = header.map((h) => String(h).trim().toLowerCase());
  const idx = {};
  for (const [key, names] of Object.entries(COLUMN_NAMES)) {
    idx[key] = lower.findIndex((h) => names.includes(h));
  }
  if (idx.name < 0 && idx.first_name < 0) {
    throw new HttpError(400, `Could not find a name column. Headers found: ${header.join(', ')}`);
  }
  log('Column mapping:');
  for (const [k, i] of Object.entries(idx)) log(`  ${k.padEnd(11)} <- ${i >= 0 ? header[i] : '(not found)'}`);
  return idx;
}

/**
 * input: a Node readable stream of CSV text.
 * replace: delete existing people first. Saved lists are cleared too, because
 * the new rows get new ids.
 */
export async function importCsv(input, { replace = false, log = () => {} } = {}) {
  const t0 = Date.now();
  if (replace) {
    log('Deleting existing people...');
    db.exec('DELETE FROM saved; DELETE FROM people;');
  }
  dropIndexes();

  const insert = db.prepare(
    'INSERT INTO people (name, title, seniority, company, industry, employees, city, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertBatch = db.transaction((rows) => {
    for (const r of rows) insert.run(r);
  });

  let colIndex = null;
  let batch = [];
  let total = 0;
  let skipped = 0;
  const get = (row, key) => (colIndex[key] >= 0 ? row[colIndex[key]] || null : null);

  try {
    const parser = input.pipe(parse({ bom: true, relax_column_count: true, skip_empty_lines: true, trim: true }));
    for await (const row of parser) {
      if (!colIndex) {
        colIndex = mapHeader(row, log);
        continue;
      }
      const name = get(row, 'name') || [get(row, 'first_name'), get(row, 'last_name')].filter(Boolean).join(' ');
      if (!name) { skipped++; continue; }
      const title = get(row, 'title');
      batch.push([
        name,
        title,
        get(row, 'seniority') || guessSeniority(title || ''),
        get(row, 'company'),
        get(row, 'industry'),
        toEmployees(get(row, 'employees')),
        get(row, 'city'),
        get(row, 'email'),
      ]);
      if (batch.length === 10000) {
        insertBatch(batch);
        total += batch.length;
        batch = [];
        if (total % 100000 === 0) log(`  ${total.toLocaleString('en-IN')} rows imported`);
      }
    }
    if (batch.length) { insertBatch(batch); total += batch.length; }
    if (!colIndex) throw new HttpError(400, 'The file is empty');
  } finally {
    log('Building indexes (can take a minute for millions of rows)...');
    createIndexes();
  }
  const seconds = (Date.now() - t0) / 1000;
  log(`Imported ${total.toLocaleString('en-IN')} rows, skipped ${skipped} without a name, in ${seconds.toFixed(1)}s`);
  return { imported: total, skipped, seconds };
}
