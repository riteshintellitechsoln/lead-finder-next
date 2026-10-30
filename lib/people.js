// All people / company / saved-lead queries (server only).
// Functions that depend on who is asking take the logged-in `user` ({ id, role }).
import { db } from './db.js';
import { toInt } from './route.js';

export const MAX_PAGE_SIZE = 100;
export const MAX_EXPORT_ROWS = Number(process.env.MAX_EXPORT_ROWS) || 100000;

// Company size buckets sent by the UI -> employee range
export const SIZES = {
  '1-50': [1, 50],
  '51-200': [51, 200],
  '201-1000': [201, 1000],
  '1001-5000': [1001, 5000],
  '5000+': [5001, 1e12],
};
// Only these columns can be sorted (prevents SQL injection through sortBy)
const SORTS = { name: 'name', title: 'title', company: 'company', city: 'city', employees: 'employees' };
export const COLS = 'id, name, title, seniority, company, industry, employees, city, email';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const list = (sp, key) => sp.getAll(key).map((s) => s.trim()).filter(Boolean);

/**
 * URLSearchParams -> SQL WHERE + params.
 * q, personTitles, personNotTitles, city, seniority, industry, employees,
 * hasEmail=true, saved=true, ids=1,2,3
 */
export function buildWhere(sp, user) {
  const where = [];
  const params = [];

  const q = (sp.get('q') || '').trim();
  if (q) {
    where.push('(name LIKE ? OR company LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const titles = list(sp, 'personTitles');
  if (titles.length) {
    where.push('(' + titles.map(() => 'title LIKE ?').join(' OR ') + ')');
    titles.forEach((t) => params.push(`%${t}%`));
  }
  for (const t of list(sp, 'personNotTitles')) {
    where.push("COALESCE(title, '') NOT LIKE ?");
    params.push(`%${t}%`);
  }
  for (const col of ['city', 'seniority', 'industry']) {
    const vals = list(sp, col);
    if (vals.length) {
      where.push(`${col} IN (${vals.map(() => '?').join(',')})`);
      params.push(...vals);
    }
  }
  const sizes = list(sp, 'employees').filter((s) => SIZES[s]);
  if (sizes.length) {
    where.push('(' + sizes.map(() => 'employees BETWEEN ? AND ?').join(' OR ') + ')');
    sizes.forEach((s) => params.push(...SIZES[s]));
  }
  if (sp.get('hasEmail') === 'true') where.push("email IS NOT NULL AND email <> ''");
  if (user && sp.get('saved') === 'true') {
    where.push('id IN (SELECT person_id FROM saved WHERE user_id = ?)');
    params.push(user.id);
  }

  const ids = (sp.get('ids') || '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 1000);
  if (ids.length) {
    where.push(`id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

// Counting millions of rows is the slowest step, so counts are cached per filter
const countCache = (globalThis.__lfCounts ??= new Map());
export function countPeople(where, params) {
  const key = where + '|' + JSON.stringify(params);
  if (countCache.has(key)) return countCache.get(key);
  const n = db.prepare(`SELECT COUNT(*) AS n FROM people ${where}`).get(...params).n;
  if (countCache.size > 500) countCache.clear();
  countCache.set(key, n);
  return n;
}
// Counts that depend on saved lists go stale when those lists change
export function clearUserCounts() {
  for (const k of countCache.keys()) if (k.includes('saved')) countCache.delete(k);
}

/** One page of people for the given filters */
export function searchPeople(sp, user) {
  const started = Date.now();
  const { where, params } = buildWhere(sp, user);
  const pageSize = clamp(toInt(sp.get('pageSize'), 25), 1, MAX_PAGE_SIZE);
  const page = Math.max(1, toInt(sp.get('page'), 1));
  const sortCol = SORTS[sp.get('sortBy')] || 'id';
  const dir = sp.get('sortDir') === 'desc' ? 'DESC' : 'ASC';

  const total = countPeople(where, params);
  const content = db
    .prepare(
      `SELECT ${COLS}, EXISTS(SELECT 1 FROM saved s WHERE s.user_id = ? AND s.person_id = people.id) AS saved
       FROM people ${where}
       ORDER BY ${sortCol} ${dir}, id
       LIMIT ? OFFSET ?`
    )
    .all(user?.id ?? 0, ...params, pageSize, (page - 1) * pageSize);

  return {
    content,
    totalElements: total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    tookMs: Date.now() - started,
  };
}

// ---------- filter options & dashboard numbers (cached until data changes) ----------
let filterCache = null;
let baseStats = null;

// Call after people are imported, added, edited or deleted
export function resetCaches() {
  filterCache = null;
  baseStats = null;
  countCache.clear();
  companyCounts.clear();
}

export function getFilters() {
  if (!filterCache) {
    const top = (col, limit) =>
      db
        .prepare(
          `SELECT ${col} AS value, COUNT(*) AS count FROM people
           WHERE ${col} IS NOT NULL AND ${col} <> ''
           GROUP BY ${col} ORDER BY count DESC LIMIT ?`
        )
        .all(limit);
    filterCache = {
      city: top('city', 100),
      seniority: top('seniority', 20),
      industry: top('industry', 100),
      titles: top('title', 300).map((r) => r.value),
      employees: Object.keys(SIZES),
      maxExportRows: MAX_EXPORT_ROWS,
    };
  }
  return filterCache;
}

export function getBaseStats() {
  if (!baseStats) {
    baseStats = {
      totalPeople: db.prepare('SELECT COUNT(*) AS n FROM people').get().n,
      withEmail: db.prepare("SELECT COUNT(*) AS n FROM people WHERE email IS NOT NULL AND email <> ''").get().n,
      totalCompanies: db.prepare('SELECT COUNT(DISTINCT company) AS n FROM people').get().n,
    };
  }
  return baseStats;
}

// Guests (user = null) get zeros here; their lists live in the browser (components/Session.js)
export function getStats(user) {
  if (!user) return { ...getBaseStats(), saved: 0, tasksDue: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const n = (sql, ...p) => db.prepare(sql).get(...p).n;
  return {
    ...getBaseStats(),
    saved: n('SELECT COUNT(*) AS n FROM saved WHERE user_id = ?', user.id),
    tasksDue: n('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND done = 0 AND due_date <= ?', user.id, today),
  };
}

// ---------- companies ----------
const companyCounts = (globalThis.__lfCompanyCounts ??= new Map());
export function searchCompanies(sp) {
  const q = (sp.get('q') || '').trim();
  const pageSize = clamp(toInt(sp.get('pageSize'), 25), 1, MAX_PAGE_SIZE);
  const page = Math.max(1, toInt(sp.get('page'), 1));
  const where = q ? 'WHERE company LIKE ?' : "WHERE company IS NOT NULL AND company <> ''";
  const params = q ? [`%${q}%`] : [];

  const key = where + JSON.stringify(params);
  if (!companyCounts.has(key)) {
    if (companyCounts.size > 200) companyCounts.clear();
    companyCounts.set(key, db.prepare(`SELECT COUNT(DISTINCT company) AS n FROM people ${where}`).get(...params).n);
  }
  const total = companyCounts.get(key);
  const content = db
    .prepare(
      `SELECT company, MAX(industry) AS industry, MAX(employees) AS employees, COUNT(*) AS people
       FROM people ${where} GROUP BY company ORDER BY company LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { content, totalElements: total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

// ---------- saved leads ----------
export const cleanIds = (ids, max) =>
  (Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, max);

export function saveLeads(userId, ids) {
  const clean = cleanIds(ids, 5000);
  const insert = db.prepare('INSERT OR IGNORE INTO saved (user_id, person_id) SELECT ?, id FROM people WHERE id = ?');
  const added = db.transaction((arr) => arr.reduce((n, id) => n + insert.run(userId, id).changes, 0))(clean);
  clearUserCounts();
  return { added, requested: clean.length };
}
export function removeSaved(userId, id) {
  const { changes } = db.prepare('DELETE FROM saved WHERE user_id = ? AND person_id = ?').run(userId, toInt(id, 0));
  clearUserCounts();
  return { removed: changes };
}

// ---------- CSV export (streamed in batches of 5,000 rows) ----------
function csv(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // stops Excel formula injection
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const CSV_HEADER = 'ID,Name,Title,Seniority,Company,Industry,Employees,City,Email\r\n';
const csvLine = (r) =>
  [r.id, r.name, r.title, r.seniority, r.company, r.industry, r.employees, r.city, r.email].map(csv).join(',') + '\r\n';

/** CSV stream from a batch function: nextBatch(lastId, size) -> rows ordered by id */
export function csvStream(nextBatch, limit = Infinity) {
  const enc = new TextEncoder();
  let lastId = 0;
  let sent = 0;

  // pull() runs only when the client is ready for more data (backpressure)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode('﻿' + CSV_HEADER)); // BOM so Excel reads UTF-8
    },
    pull(controller) {
      if (sent >= limit) return controller.close();
      const rows = nextBatch(lastId, Math.min(5000, limit - sent));
      if (!rows.length) return controller.close();
      sent += rows.length;
      lastId = rows[rows.length - 1].id;
      controller.enqueue(enc.encode(rows.map(csvLine).join('')));
    },
  });
}

// Everything matching the filters, up to MAX_EXPORT_ROWS (`user` is only needed for saved=true)
export function exportStream(sp, user) {
  const p = new URLSearchParams(sp);
  const { where, params } = buildWhere(p, user);
  const limit = clamp(toInt(p.get('limit'), MAX_EXPORT_ROWS), 1, MAX_EXPORT_ROWS);
  const stmt = db.prepare(`SELECT ${COLS} FROM people ${where ? where + ' AND' : 'WHERE'} id > ? ORDER BY id LIMIT ?`);
  return csvStream((lastId, n) => stmt.all(...params, lastId, n), limit);
}
