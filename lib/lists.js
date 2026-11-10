// Uploaded include / exclude lists (server only): company names, domains,
// emails, job titles or zip codes, from a CSV / TXT file or pasted text, any
// size (4 lakh+ rows). The file is streamed to disk, DuckDB reads it, and the
// values go into list_values. A search refers to a list by its id
// (?companyList=<id>), so the URL stays short and the link can be shared.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DB_PATH, dedicatedConnection, hasPeople, small } from './db.js';
import { CANDIDATES, norm, toUtf8 } from './csv.js';
import { LIST_FIELDS, LIST_KINDS } from './filters.js';
import { HttpError } from './route.js';
import { allWordsSql, domainSql, zipSql } from './schema.js';

const MAX_BYTES = (Number(process.env.MAX_LIST_MB) || 200) * 1048576;
const MAX_VALUES = { title: 2000, default: Number(process.env.MAX_LIST_VALUES) || 5_000_000 };
const KEEP_DAYS = Number(process.env.LIST_KEEP_DAYS) || 180;

const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`;
const spaced = (v) => `lower(trim(regexp_replace(${v}, '\\s+', ' ', 'g')))`;
// Raw text -> the form it is matched in (same as the people columns)
const NORMALIZE = {
  title: spaced,
  company: spaced,
  domain: (v) => domainSql(v),
  email: (v) => `lower(trim(${v}))`,
  zip: (v) => zipSql(v),
};
// For a CSV with several columns, which header holds the values
const HEADERS = {
  title: CANDIDATES.title,
  company: CANDIDATES.company,
  domain: CANDIDATES.domain,
  email: CANDIDATES.email,
  zip: CANDIDATES.zip,
};

// How many of the list's values exist in the data (shown next to the list)
const MATCHED = {
  title: `SELECT count(*) AS n FROM titles t WHERE EXISTS (SELECT 1 FROM list_values l WHERE l.list_id = ? AND ${allWordsSql('l.value', 't.title_lc')})`,
  company: 'SELECT count(*) AS n FROM companies WHERE people > 0 AND name_lc IN (SELECT value FROM list_values WHERE list_id = ?)',
  domain: 'SELECT count(DISTINCT domain) AS n FROM companies WHERE people > 0 AND domain IN (SELECT value FROM list_values WHERE list_id = ?)',
  email: 'SELECT count(*) AS n FROM people WHERE email IN (SELECT value FROM list_values WHERE list_id = ?)',
  zip: 'SELECT count(DISTINCT zip) AS n FROM people WHERE zip IN (SELECT value FROM list_values WHERE list_id = ?)',
};

function limitBytes(max) {
  let n = 0;
  return new Transform({
    transform(chunk, _enc, done) {
      n += chunk.length;
      if (n > max) done(new HttpError(413, `The file is bigger than ${Math.round(max / 1048576)} MB`));
      else done(null, chunk);
    },
  });
}

/**
 * webStream: the raw file (or pasted text). format: 'csv' (pick the right
 * column by its header) or 'lines' (one value per line; for everything except
 * company names, commas also separate values).
 */
export async function createList(webStream, { kind, format = 'lines', name = '', user }) {
  if (!LIST_KINDS.includes(kind)) throw new HttpError(400, `kind must be one of: ${LIST_KINDS.join(', ')}`);
  if (!user) throw new HttpError(401, 'Sign in to upload a list');
  const dir = path.join(path.dirname(DB_PATH), 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `list-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.txt`);
  const id = crypto.randomBytes(12).toString('hex');
  let conn;
  try {
    await pipeline(Readable.fromWeb(webStream), limitBytes(MAX_BYTES), fs.createWriteStream(file));
    if (!fs.statSync(file).size) throw new HttpError(400, 'The file is empty');
    await toUtf8(file);
    conn = await dedicatedConnection();
    const run = async (sql, params = []) => (await conn.runAndReadAll(sql, params)).getRowObjectsJS();

    // Lists nobody used for a long time are removed, unless a saved search still needs them
    const expired = `created_at < timezone('UTC', current_timestamp) - INTERVAL ${KEEP_DAYS} DAY
      AND NOT EXISTS (SELECT 1 FROM saved_lists s WHERE contains(s.query, lists.id))`;
    await run(`DELETE FROM list_values WHERE list_id IN (SELECT id FROM lists WHERE ${expired})`);
    await run(`DELETE FROM lists WHERE ${expired}`);

    let source;
    let column = null;
    if (format === 'csv') {
      // parallel = false: cells may hold line breaks, which the parallel reader refuses (a list is one column, so this stays fast)
      const csv = (skip) => `read_csv(${sqlString(file)}, header = false, all_varchar = true, ignore_errors = true, null_padding = true, parallel = false${skip ? ', skip = 1' : ''})`;
      const first = (await run(`SELECT * FROM ${csv(false)} LIMIT 1`))[0] || {};
      const cols = Object.keys(first);
      // The header row tells which column to use; without one, the first column
      const hit = cols.find((c) => HEADERS[kind].includes(norm(String(first[c] ?? ''))));
      column = hit ? String(first[hit]).trim() : null;
      const pickCol = hit || cols[0];
      source = `SELECT "${pickCol.replace(/"/g, '""')}" AS raw FROM ${csv(Boolean(hit))}`;
    } else {
      const sep = kind === 'company' ? '[\\r\\n;\\t]+' : '[\\r\\n,;\\t]+';
      source = `SELECT unnest(regexp_split_to_array(content, '${sep}')) AS raw FROM read_text(${sqlString(file)})`;
    }
    await run(`INSERT INTO list_values SELECT DISTINCT ?, v FROM (SELECT ${NORMALIZE[kind]('raw')} AS v FROM (${source}))
      WHERE v IS NOT NULL AND v <> ''`, [id]);
    const size = Number((await run('SELECT count(*)::BIGINT AS n FROM list_values WHERE list_id = ?', [id]))[0].n);
    const max = MAX_VALUES[kind] || MAX_VALUES.default;
    if (!size || size > max) {
      await run('DELETE FROM list_values WHERE list_id = ?', [id]);
      if (!size) throw new HttpError(400, 'No values found in the file');
      throw new HttpError(400, `A ${LIST_FIELDS[kind].label.toLowerCase()} list can have at most ${max.toLocaleString('en-IN')} values (this one has ${size.toLocaleString('en-IN')})`);
    }
    const matched = (await hasPeople())
      ? Number((await run(MATCHED[kind], [id]))[0].n)
      : null;
    const label = String(name || '').trim().slice(0, 120) || `${LIST_FIELDS[kind].label} list`;
    await run('INSERT INTO lists (id, kind, name, size, matched, user_id) VALUES (?, ?, ?, ?, ?, ?)', [id, kind, label, size, matched, user.id]);
    return { id, kind, name: label, size, matched, column };
  } finally {
    try { conn?.closeSync(); } catch { /* ignore */ }
    fs.rmSync(file, { force: true });
  }
}

/** ids -> [{ id, kind, name, size, matched }] for the chips under each filter */
export async function getLists(ids, signal) {
  const clean = [...new Set(ids)].filter((v) => /^[a-z0-9]{10,40}$/.test(v)).slice(0, 50);
  if (!clean.length) return [];
  return small(`SELECT id, kind, name, size, matched FROM lists WHERE id IN (${clean.map(() => '?').join(', ')})`, clean, { signal });
}
