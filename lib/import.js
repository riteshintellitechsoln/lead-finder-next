// Admin "Upload CSV" (server only). The upload is streamed to a temporary file
// (any size, low memory), DuckDB reads it with read_csv, and new tables are
// built next to the live ones and swapped in at the end. The site keeps
// answering searches with the old data while the import runs.
//
// Rows that are not imported (a wrong value, already in the data, or repeated in
// the file) are kept in import_skipped, so the admin can open each upload later.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DB_PATH, dataChanged, dedicatedConnection, small } from './db.js';
import { loadCsvIntoStaging, rejectWrongValues, skipDuplicates, toUtf8 } from './csv.js';
import { HttpError } from './route.js';
import { importTablesSql, rebuildInPlace, tableExists } from './schema.js';

let running = false;

const one = async (conn, sql, params) => (await conn.runAndReadAll(sql, params)).getRowObjectsJS()
  .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])))[0];

/**
 * webStream: the request body. replace: delete existing people (saved lists are cleared too).
 * Returns { importId, fileRows, imported, wrong, wrongByField, inData, inFile, people, seconds }.
 */
export async function importUpload(webStream, { replace = false, fileName = '', userId = null, log = () => {} } = {}) {
  if (running) throw new HttpError(409, 'Another upload is still running. Wait for it to finish.');
  running = true;
  const t0 = Date.now();
  const dir = path.join(path.dirname(DB_PATH), 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `upload-${Date.now()}.csv`);
  let conn;
  try {
    await pipeline(Readable.fromWeb(webStream), fs.createWriteStream(file));
    const mb = fs.statSync(file).size / 1048576;
    if (!mb) throw new HttpError(400, 'The file is empty.');
    log(`Received ${mb.toFixed(1)} MB`);
    await toUtf8(file, log);
    conn = await dedicatedConnection();
    for (const sql of importTablesSql()) await conn.run(sql);

    const { rows, map } = await loadCsvIntoStaging(conn, file, log);
    // Left out: a wrong or empty Company headcount, Function, Seniority level, Country or Industry,
    // then people already in the data (not when replacing it) and rows repeated in the file
    const wrong = await rejectWrongValues(conn, map, log);
    const hasPeople = await tableExists(conn, 'people');
    const { inData, inFile } = await skipDuplicates(conn, { againstData: !replace && hasPeople, log });
    const imported = rows - wrong.count - inData - inFile;

    let people;
    if (imported > 0) {
      await conn.run('ALTER TABLE staging DROP COLUMN file_row');
      log(replace ? 'Replacing all people…' : 'Adding to existing people…');
      people = (await rebuildInPlace(conn, { append: !replace, log })).people;
      dataChanged();
    } else {
      log('Nothing was imported. The data was not changed.');
      people = hasPeople ? (await one(conn, 'SELECT count(*)::BIGINT AS n FROM people')).n : 0;
    }

    // Remember this upload and every row that was left out
    const { id } = await one(conn, `INSERT INTO imports (user_id, file_name, replaced, file_rows, imported, wrong, in_data, in_file)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [userId, String(fileName || '').slice(0, 200) || null, Boolean(replace && imported > 0), rows, imported, wrong.count, inData, inFile]);
    await conn.run(`INSERT INTO import_skipped BY NAME SELECT ${id}::BIGINT AS import_id, * FROM skipped`);
    await conn.run('DROP TABLE skipped');

    const seconds = (Date.now() - t0) / 1000;
    log(`Done in ${seconds.toFixed(1)}s. The database has ${people.toLocaleString('en-IN')} people.`);
    return { importId: id, fileRows: rows, imported, wrong: wrong.count, wrongByField: wrong.byField, inData, inFile, people, seconds };
  } finally {
    running = false;
    try { conn?.closeSync(); } catch { /* ignore */ }
    fs.rmSync(file, { force: true });
  }
}

// ---------- reading uploads back (admin) ----------

const importsExist = async () => (await small("SELECT count(*)::INTEGER AS n FROM duckdb_tables() WHERE table_name = 'imports'"))[0].n > 0;
const IMPORT_COLS = `i.id, i.file_name, i.replaced, i.file_rows, i.imported, i.wrong, i.in_data, i.in_file,
  strftime(i.created_at, '%Y-%m-%d %H:%M:%S') AS created_at, u.name AS user_name, u.email AS user_email`;

/** Removes one upload from the list, with its left-out rows. The people it added stay in the data. */
export async function deleteImport(id) {
  const n = Number(id) || 0;
  if (!(await importsExist()) || !(await small('SELECT id FROM imports WHERE id = ?', [n])).length) {
    throw new HttpError(404, 'This upload was not found');
  }
  await small('DELETE FROM import_skipped WHERE import_id = ?', [n]);
  await small('DELETE FROM imports WHERE id = ?', [n]);
  return { removed: 1 };
}

/** The latest uploads, newest first */
export async function listImports(limit = 20) {
  if (!(await importsExist())) return [];
  return small(`SELECT ${IMPORT_COLS} FROM imports i LEFT JOIN users u ON u.id = i.user_id ORDER BY i.id DESC LIMIT ?`, [limit]);
}

const REASONS = { wrong: ['wrong'], duplicate: ['in_data', 'in_file'] };
const PAGE_SIZE = 50;

/** One upload and one page of its left-out rows. reason: 'wrong' | 'duplicate' */
export async function getImport(id, { reason = 'wrong', page = 1 } = {}) {
  if (!REASONS[reason]) throw new HttpError(400, 'Unknown list');
  const info = (await importsExist())
    ? (await small(`SELECT ${IMPORT_COLS} FROM imports i LEFT JOIN users u ON u.id = i.user_id WHERE i.id = ?`, [Number(id) || 0]))[0]
    : null;
  if (!info) throw new HttpError(404, 'This upload was not found');
  const total = reason === 'wrong' ? info.wrong : info.in_data + info.in_file;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const rows = total
    ? await small(`SELECT * EXCLUDE (import_id) FROM import_skipped
        WHERE import_id = ? AND reason IN (${REASONS[reason].map(() => '?').join(', ')})
        ORDER BY file_row LIMIT ? OFFSET ?`, [info.id, ...REASONS[reason], PAGE_SIZE, (p - 1) * PAGE_SIZE])
    : [];
  return { info, reason, rows, total, page: p, totalPages, pageSize: PAGE_SIZE };
}

/** Every left-out row of one upload (for the CSV download) */
export async function allSkipped(id, reason) {
  if (!REASONS[reason]) throw new HttpError(400, 'Unknown list');
  if (!(await importsExist())) throw new HttpError(404, 'This upload was not found');
  return small(`SELECT * EXCLUDE (import_id) FROM import_skipped
    WHERE import_id = ? AND reason IN (${REASONS[reason].map(() => '?').join(', ')}) ORDER BY file_row`,
  [Number(id) || 0, ...REASONS[reason]]);
}
