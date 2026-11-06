// DuckDB access for the app (server only). One file: data/leads.duckdb.
//
// * One DuckDB instance per process (kept on globalThis so dev hot-reload does
//   not open the file twice).
// * A small pool of connections plus a concurrency limit: each running query
//   occupies one libuv worker thread, so DuckDB never takes all of them.
//   DuckDB itself still uses every CPU core for each query.
// * A priority queue: small queries (login, badges, saved, tasks) skip ahead of
//   big scans, and result pages skip ahead of filter counts, so the site stays
//   responsive while the server is busy.
// * Every query can be cancelled with an AbortSignal (the browser changed the
//   filters): queued queries are dropped, running ones are interrupted.
import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './password.js';
import { HttpError } from './route.js';
import { ensureAppTables, explainDbError, tableExists, upgradeIfNeeded } from './schema.js';

// (turbopackIgnore: the database is opened at runtime; it must not be bundled/traced)
export const DB_PATH = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DB_PATH || 'data/leads.duckdb');
const MAX_CONCURRENT = Math.max(1, Number(process.env.DB_CONCURRENCY) || 4);
const HIGH_EXTRA = 2; // 'high' queries only touch small tables and may use a little extra capacity
const PRIORITY = { high: 0, normal: 1, low: 2 };

const g = (globalThis.__leadFinderDuck ??= {
  ready: null,
  instance: null,
  idle: [],
  active: 0,
  queue: [],
  hasPeople: false,
  version: 0, // bumped when the people data changes (caches key on it)
});

async function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const options = { memory_limit: process.env.DUCKDB_MEMORY_LIMIT || '1GB' };
  if (process.env.DUCKDB_THREADS) options.threads = String(process.env.DUCKDB_THREADS);
  let instance;
  try {
    instance = await DuckDBInstance.fromCache(DB_PATH, options);
  } catch (e) {
    throw new HttpError(503, explainDbError(e, DB_PATH).split('\n\n')[0]);
  }
  const conn = await instance.connect();
  await ensureAppTables(conn);
  await upgradeIfNeeded(conn);
  await seedAccounts(conn);
  g.hasPeople = await tableExists(conn, 'people');
  g.idle.push(conn);
  g.instance = instance;
  return instance;
}

// First run: one admin and one user account
async function seedAccounts(conn) {
  const n = Number((await conn.runAndReadAll('SELECT count(*)::BIGINT n FROM users')).getRowObjectsJS()[0].n);
  if (n) return;
  const admin = [(process.env.ADMIN_EMAIL || 'admin@leadfinder.local').toLowerCase(), process.env.ADMIN_PASSWORD || 'admin123'];
  const user = [(process.env.USER_EMAIL || 'user@leadfinder.local').toLowerCase(), process.env.USER_PASSWORD || 'user123'];
  const add = `INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`;
  await conn.run(add, [admin[0], 'Admin', hashPassword(admin[1]), 'admin']);
  await conn.run(add, [user[0], 'User', hashPassword(user[1]), 'user']);
  console.log(`Created accounts: admin ${admin[0]} / ${admin[1]}, user ${user[0]} / ${user[1]}. Change these passwords.`);
}

function ready() {
  if (!g.ready) {
    g.ready = open().catch((e) => {
      g.ready = null; // retry on the next request (e.g. after an import finishes)
      throw e;
    });
  }
  return g.ready;
}

// Waits for a free slot (at most MAX_CONCURRENT DuckDB calls at once).
async function takeSlot(signal, priority = 'normal') {
  await ready();
  const p = PRIORITY[priority] ?? 1;
  const cap = MAX_CONCURRENT + (p === 0 ? HIGH_EXTRA : 0);
  if (g.active >= cap || (p > 0 && g.queue.length)) {
    await new Promise((resolve, reject) => {
      const waiter = { resolve, reject, p };
      // Insert after every waiter of the same or higher priority.
      const at = g.queue.findIndex((w) => w.p > p);
      g.queue.splice(at < 0 ? g.queue.length : at, 0, waiter);
      signal?.addEventListener('abort', () => {
        const i = g.queue.indexOf(waiter);
        if (i >= 0) g.queue.splice(i, 1);
        reject(abortError());
      }, { once: true });
    });
    return; // releaseSlot() counted us as active when it woke us
  }
  g.active++;
}

function releaseSlot() {
  g.active--;
  while (g.queue.length && g.active < MAX_CONCURRENT + (g.queue[0].p === 0 ? HIGH_EXTRA : 0)) {
    g.active++;
    g.queue.shift().resolve();
  }
}

async function withSlot(signal, fn, priority) {
  await takeSlot(signal, priority);
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

function abortError() {
  const e = new Error('Request cancelled');
  e.name = 'AbortError';
  return e;
}

// DuckDB values -> plain JSON-friendly values
function plain(v) {
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k in v) o[k] = plain(v[k]);
    return o;
  }
  return v;
}

/**
 * Runs one parameterized statement ("?" placeholders) and returns plain rows.
 * priority: 'high' (small tables), 'normal' (result pages), 'low' (filter counts, exports)
 */
export async function query(sql, params = [], { signal, priority } = {}) {
  if (signal?.aborted) throw abortError();
  await takeSlot(signal, priority);
  let conn;
  try {
    conn = g.idle.pop() || (await g.instance.connect());
  } catch (e) {
    releaseSlot();
    throw e;
  }
  const onAbort = () => { try { conn.interrupt(); } catch { /* already finished */ } };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const reader = await conn.runAndReadAll(sql, params);
    return reader.getRowObjectsJS().map(plain);
  } catch (e) {
    if (signal?.aborted) throw abortError();
    throw e;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    g.idle.push(conn);
    releaseSlot();
  }
}

export async function queryOne(sql, params, opts) {
  return (await query(sql, params, opts))[0];
}

// Small queries on small tables (users, sessions, saved, tasks)
export const small = (sql, params = [], opts = {}) => query(sql, params, { ...opts, priority: 'high' });
export const smallOne = async (sql, params, opts) => (await small(sql, params, opts))[0];

/**
 * Runs several statements on one connection inside a transaction:
 *   await transaction(async (run) => { await run('UPDATE ...', [..]); ... })
 */
export async function transaction(fn) {
  await takeSlot(null, 'high');
  const conn = g.idle.pop() || (await g.instance.connect());
  const run = async (sql, params = []) => (await conn.runAndReadAll(sql, params)).getRowObjectsJS().map(plain);
  try {
    await conn.run('BEGIN TRANSACTION');
    const out = await fn(run);
    await conn.run('COMMIT');
    return out;
  } catch (e) {
    await conn.run('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    g.idle.push(conn);
    releaseSlot();
  }
}

// Streams a large result about 2,048 rows at a time. The pool slot is held
// only while DuckDB produces a chunk, never while the browser downloads, and
// the stream gets its own connection (an unfinished stream blocks it).
export async function* streamRows(sql, params = [], { signal } = {}) {
  await ready();
  const conn = await g.instance.connect();
  const onAbort = () => { try { conn.interrupt(); } catch { /* ignore */ } };
  signal?.addEventListener('abort', onAbort, { once: true });
  let result;
  try {
    result = await withSlot(signal, () => conn.stream(sql, params), 'low');
    const names = result.deduplicatedColumnNames();
    while (true) {
      if (signal?.aborted) throw abortError();
      const chunk = await withSlot(signal, () => result.fetchChunk(), 'low');
      if (!chunk || chunk.rowCount === 0) break;
      yield chunk.getRowObjects(names).map(plain);
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    try { result?.closeSync(); } catch { /* ignore */ }
    try { conn.closeSync(); } catch { /* ignore */ }
  }
}

// A dedicated connection for long jobs (CSV upload). Not counted in the pool,
// so searches keep running while it works. Call close() when done.
export async function dedicatedConnection() {
  await ready();
  return g.instance.connect();
}

export async function requirePeople() {
  await ready();
  if (!g.hasPeople) {
    throw new HttpError(503, 'No people data yet. Upload a CSV in Admin > Data, or stop the app and run "npm run seed" / "npm run import -- file.csv".');
  }
}

// The pre-DuckDB version kept its data in data/leads.db (see scripts/migrate-sqlite.js)
export const oldSqliteExists = () => fs.existsSync(path.join(path.dirname(DB_PATH), 'leads.db'));

export async function hasPeople() {
  await ready();
  return g.hasPeople;
}

// Call after people were imported / added / edited / deleted.
export function dataChanged() {
  g.hasPeople = true;
  g.version++;
  for (const c of Object.values(globalThis.__leadFinderCaches || {})) c.map?.clear();
}

export const dataVersion = () => g.version;

// ---------------------------------------------------------------------------
// Small in-memory caches (totals, filter lists, counts per filter set).

export class LRU {
  constructor(max = 500, ttlMs = 0) {
    this.max = max;
    this.ttl = ttlMs;
    this.map = new Map();
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (this.ttl && Date.now() - hit.t > this.ttl) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.v;
  }
  set(key, v) {
    this.map.delete(key);
    this.map.set(key, { v, t: Date.now() });
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return v;
  }
}

// Caches a promise so identical concurrent requests share one query. Failed or
// cancelled lookups are not cached; if the request that started a shared query
// was cancelled, the others run it again.
export async function cached(cache, key, fn, signal) {
  for (;;) {
    let p = cache.get(key);
    if (!p) {
      const version = g.version;
      p = fn(signal).then((v) => {
        if (version !== g.version) cache.map.delete(key); // data changed meanwhile: don't keep it
        return v;
      }, (e) => {
        if (cache.map.get(key)?.v === p) cache.map.delete(key);
        throw e;
      });
      cache.set(key, p);
    }
    try {
      return await p;
    } catch (e) {
      if (e?.name === 'AbortError' && !signal?.aborted) continue;
      throw e;
    }
  }
}
