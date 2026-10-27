// Imports YOUR data from a CSV file into the database.
// Usage:
//   node scripts/import-csv.js path/to/people.csv            (adds to existing data)
//   node scripts/import-csv.js path/to/people.csv --replace  (deletes old people first)
//
// Column names are detected automatically (case-insensitive). Edit COLUMN_NAMES
// below if your CSV uses different header names.
import fs from 'node:fs';
import { parse } from 'csv-parse';
import { db, createIndexes, dropIndexes } from '../lib/db.js';

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

const file = process.argv[2];
const replace = process.argv.includes('--replace');
if (!file || !fs.existsSync(file)) {
  console.error('Usage: node scripts/import-csv.js path/to/people.csv [--replace]');
  process.exit(1);
}

// Guess seniority from the job title when the CSV has no seniority column
function guessSeniority(title = '') {
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
const toEmployees = (v) => {
  const m = String(v || '').replace(/,/g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

let colIndex = null;
function mapHeader(header) {
  const lower = header.map((h) => String(h).trim().toLowerCase());
  const idx = {};
  for (const [key, names] of Object.entries(COLUMN_NAMES)) {
    idx[key] = lower.findIndex((h) => names.includes(h));
  }
  if (idx.name < 0 && idx.first_name < 0) {
    throw new Error(`Could not find a name column. Headers found: ${header.join(', ')}`);
  }
  console.log('Column mapping:');
  for (const [k, i] of Object.entries(idx)) console.log(`  ${k.padEnd(11)} <- ${i >= 0 ? header[i] : '(not found)'}`);
  return idx;
}

const insert = db.prepare(
  'INSERT INTO people (name, title, seniority, company, industry, employees, city, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const insertBatch = db.transaction((rows) => {
  for (const r of rows) insert.run(r);
});

async function main() {
  const t0 = Date.now();
  if (replace) {
    console.log('Deleting existing people...');
    db.exec('DELETE FROM saved; DELETE FROM people;');
  }
  dropIndexes();

  const parser = fs.createReadStream(file).pipe(
    parse({ bom: true, relax_column_count: true, skip_empty_lines: true, trim: true })
  );

  let batch = [];
  let total = 0;
  let skipped = 0;
  const get = (row, key) => (colIndex[key] >= 0 ? row[colIndex[key]] || null : null);

  for await (const row of parser) {
    if (!colIndex) {
      colIndex = mapHeader(row);
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
      if (total % 100000 === 0) console.log(`  ${total.toLocaleString('en-IN')} rows imported`);
    }
  }
  if (batch.length) { insertBatch(batch); total += batch.length; }

  console.log('Building indexes (can take a minute for millions of rows)...');
  createIndexes();
  console.log(`Imported ${total.toLocaleString('en-IN')} rows, skipped ${skipped} without a name, in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('Restart the app (npm run dev / npm start) to see the new data.');
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  createIndexes();
  process.exit(1);
});
