// Admin "Upload CSV" (server only). The upload is streamed to a temporary file
// (any size, low memory), DuckDB reads it with read_csv, and new tables are
// built next to the live ones and swapped in at the end. The site keeps
// answering searches with the old data while the import runs.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DB_PATH, dataChanged, dedicatedConnection } from './db.js';
import { loadCsvIntoStaging, toUtf8 } from './csv.js';
import { HttpError } from './route.js';
import { rebuildInPlace, tableExists } from './schema.js';

let running = false;
const SHOW_EXISTING = 200;

// Text compared without case or extra spaces
const norm = (col) => `nullif(lower(trim(regexp_replace(${col}, '\\s+', ' ', 'g'))), '')`;

/**
 * Rows of the uploaded file (temp table `staging`) that are already in the data,
 * checked before the import changes anything. Same email = the same person;
 * a row without an email matches on name + company.
 * Returns { count, byEmail, byNameCompany, rows: the first SHOW_EXISTING }.
 */
async function findExisting(conn, log) {
  const none = { count: 0, byEmail: 0, byNameCompany: 0, rows: [] };
  if (!(await tableExists(conn, 'people'))) return none;
  const read = async (sql) => (await conn.runAndReadAll(sql)).getRowObjectsJS()
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
  // "row" is the line in the file: the header is line 1
  await conn.run(`CREATE OR REPLACE TEMP TABLE upload_rows AS
    SELECT (row_number() OVER () + 1)::BIGINT AS row, name, company, email,
      ${norm('email')} AS em, ${norm('name')} AS nm, ${norm('company')} AS co
    FROM staging`);
  await conn.run(`CREATE OR REPLACE TEMP TABLE upload_existing AS
    SELECT u.row, u.name, u.company, u.email, 'Email' AS matched_by, min(p.id) AS person_id
      FROM upload_rows u JOIN people p ON p.email = u.em
      WHERE u.em IS NOT NULL GROUP BY ALL
    UNION ALL
    SELECT u.row, u.name, u.company, u.email, 'Name + company' AS matched_by, min(p.id) AS person_id
      FROM upload_rows u JOIN people p ON ${norm('p.name')} = u.nm AND ${norm('p.company')} = u.co
      WHERE u.em IS NULL AND u.nm IS NOT NULL AND u.co IS NOT NULL GROUP BY ALL`);
  const [totals] = await read(`SELECT count(*)::BIGINT AS count,
      count(*) FILTER (WHERE matched_by = 'Email')::BIGINT AS "byEmail",
      count(*) FILTER (WHERE matched_by <> 'Email')::BIGINT AS "byNameCompany" FROM upload_existing`);
  const rows = totals.count ? await read(`SELECT * FROM upload_existing ORDER BY row LIMIT ${SHOW_EXISTING}`) : [];
  await conn.run('DROP TABLE upload_rows');
  await conn.run('DROP TABLE upload_existing');
  log(`Already in the data: ${totals.count.toLocaleString('en-IN')} rows of the file`
    + (totals.count ? ` (${totals.byEmail.toLocaleString('en-IN')} by email, ${totals.byNameCompany.toLocaleString('en-IN')} by name + company)` : ''));
  return { ...totals, rows };
}

/** webStream: the request body. replace: delete existing people (saved lists are cleared too). */
export async function importUpload(webStream, { replace = false, log = () => {} } = {}) {
  if (running) throw new HttpError(409, 'Another import is still running. Wait for it to finish.');
  running = true;
  const t0 = Date.now();
  const dir = path.join(path.dirname(DB_PATH), 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `upload-${Date.now()}.csv`);
  let conn;
  try {
    await pipeline(Readable.fromWeb(webStream), fs.createWriteStream(file));
    const mb = fs.statSync(file).size / 1048576;
    if (!mb) throw new HttpError(400, 'The uploaded file is empty');
    log(`Received ${mb.toFixed(1)} MB`);
    await toUtf8(file, log);
    conn = await dedicatedConnection();
    const { rows } = await loadCsvIntoStaging(conn, file, log);
    const existing = await findExisting(conn, log);
    log(replace ? 'Replacing all people…' : 'Adding to existing people…');
    const result = await rebuildInPlace(conn, { append: !replace, log });
    dataChanged();
    const seconds = (Date.now() - t0) / 1000;
    log(`Done in ${seconds.toFixed(1)}s. The database now has ${result.people.toLocaleString('en-IN')} people.`);
    return { imported: rows, people: result.people, seconds, existing };
  } finally {
    running = false;
    try { conn?.closeSync(); } catch { /* ignore */ }
    fs.rmSync(file, { force: true });
  }
}
