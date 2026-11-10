// All people / company / saved-lead queries (server only).
// Every value from the user is a "?" parameter; the only SQL text built from
// input is picked from whitelists. Functions that depend on who is asking take
// the logged-in `user` ({ id, role }) or null for guests.
import { LRU, cached, query, queryOne, requirePeople, small, smallOne } from './db.js';
import { HttpError } from './route.js';
import { EMAIL_STATUSES, LIST_FIELDS, REVENUE_KEYS, SIZE_KEYS, filterKey, parseFilters, parseView } from './filters.js';
import { allWordsSql } from './schema.js';
import { FIXED_OPTIONS, FUNCTIONS, INDUSTRIES, COUNTRIES, SENIORITY_LEVELS } from './options.js';

export const MAX_PAGE_SIZE = 100;
export const MAX_EXPORT_ROWS = Number(process.env.MAX_EXPORT_ROWS) || 100000;
// Deep pages make DuckDB sort offset+limit rows. Like Apollo, paging stops at a
// sane depth and the user narrows the search instead.
export const MAX_OFFSET = Number(process.env.MAX_OFFSET) || 50000;
export { SIZE_KEYS };

export const COLS = `p.id, p.name, p.title, p.seniority, p.department, p.company, p.domain, p.industry, p.employees, p.revenue, p.techs,
  p.city, p.county, p.state, p.country, p.zip, p.email, p.email_status, p.phone, p.direct_phone,
  strftime(p.verified_at, '%Y-%m-%d') AS verified_at,
  p.address1, p.address2, p.linkedin, p.company_linkedin, strftime(p.updated_at, '%Y-%m-%d') AS updated_at`;
const SORT_SQL = {
  name: 'p.name', title: 'p.title', company: 'p.company', city: 'p.city',
  seniority: `list_position([${SENIORITY_LEVELS.map((s) => `'${s}'`).join(', ')}], p.seniority)`, // highest first
  employees: 'p.employees', revenue: 'p.revenue', verified: 'p.verified_at', updated: 'p.updated_at',
};

// Caches live on globalThis so the startup warm-up (instrumentation.js, bundled
// separately by Next.js) fills the same caches the routes read. dataChanged()
// in db.js clears them all.
const caches = (globalThis.__leadFinderCaches ??= {
  counts: new LRU(2000),
  facets: new LRU(300),
  pages: new LRU(300, 5 * 60_000),
  globals: new LRU(50),
  companyCounts: new LRU(500),
});

const lc = (s) => s.toLowerCase();
const marks = (n) => Array(n).fill('?').join(', ');
// A title keyword matches when all its words are in the title, in any order
const titleMatch = (n) => `SELECT id FROM titles WHERE ${Array(n).fill(allWordsSql('?', 'title_lc')).join(' OR ')}`;
const titleListMatch = (n) => `SELECT t.id FROM titles t WHERE EXISTS (SELECT 1 FROM list_values l
  WHERE l.list_id IN (${marks(n)}) AND ${allWordsSql('l.value', 't.title_lc')})`;
const listValues = (n) => `SELECT value FROM list_values WHERE list_id IN (${marks(n)})`;

// Typed values + uploaded lists of one box -> "expr IN (...) OR expr IN (list)"
function anyOf(expr, values, ids, p) {
  const parts = [];
  if (values.length) { parts.push(`${expr} IN (${marks(values.length)})`); p.push(...values); }
  if (ids.length) { parts.push(`${expr} IN (${listValues(ids.length)})`); p.push(...ids); }
  return parts.length ? `(${parts.join(' OR ')})` : null;
}

// One include / exclude box. wrap() turns a condition on the value into a
// condition on the row (company names live in the companies table).
// Excluded: rows without a value are kept.
function includeExclude(c, p, f, kind, expr, { lower = false, wrap = (x) => x } = {}) {
  const { inc, exc, list, notList } = LIST_FIELDS[kind];
  const val = (vs) => (lower ? vs.map(lc) : vs);
  const yes = anyOf(expr, val(f[inc]), f[list], p);
  if (yes) c.push(wrap(yes));
  const no = anyOf(expr, val(f[exc]), f[notList], p);
  if (no) c.push(`NOT coalesce(${wrap(no)}, false)`);
}

const techMatch = (n) => `list_has_any(techs_lc, [${marks(n)}])`;
const companyIds = (cond) => `p.company_id IN (SELECT id FROM companies WHERE ${cond})`;

// Filter -> people column, for the "pick from a list" filters
const PICK_COL = {
  department: 'p.department', seniority: 'p.seniority', industry: 'p.industry',
  country: 'p.country', state: 'p.state', county: 'p.county', city: 'p.city', emailStatus: 'p.email_status',
};
const BOOL_COL = { hasEmail: 'p.has_email', hasPhone: 'p.has_phone', hasDirect: 'p.has_direct' };

/**
 * Filters -> "WHERE ..." + params. `skip` leaves one filter group out (the
 * city counts ignore the city filter itself). extra: { user, saved, ids }
 */
export function buildWhere(f, skip = null, extra = {}) {
  const c = [];
  const p = [];
  if (f.q) {
    // Name or company: all words in any order ("prajapati ritesh" finds "Ritesh Prajapati")
    c.push(`(${allWordsSql('?', 'lower(p.name)')} OR p.company_id IN (SELECT id FROM companies WHERE ${allWordsSql('?', 'name_lc')}))`);
    p.push(f.q, f.q);
  }
  if (skip !== 'title') {
    // Title keywords are matched against the small titles table, not 20M rows.
    const inc = [];
    if (f.personTitles.length) { inc.push(`p.title_id IN (${titleMatch(f.personTitles.length)})`); p.push(...f.personTitles.map(lc)); }
    if (f.titleList.length) { inc.push(`p.title_id IN (${titleListMatch(f.titleList.length)})`); p.push(...f.titleList); }
    if (inc.length) c.push(`(${inc.join(' OR ')})`);
    if (f.personNotTitles.length) {
      c.push(`coalesce(p.title_id, 0) NOT IN (${titleMatch(f.personNotTitles.length)})`);
      p.push(...f.personNotTitles.map(lc));
    }
    if (f.titleNotList.length) {
      c.push(`coalesce(p.title_id, 0) NOT IN (${titleListMatch(f.titleNotList.length)})`);
      p.push(...f.titleNotList);
    }
  }
  includeExclude(c, p, f, 'company', 'name_lc', { lower: true, wrap: companyIds });
  includeExclude(c, p, f, 'domain', 'p.domain');
  includeExclude(c, p, f, 'email', 'p.email');
  includeExclude(c, p, f, 'zip', 'p.zip');
  for (const [key, col] of Object.entries(PICK_COL)) {
    if (f[key].length && skip !== key) {
      c.push(`${col} IN (${marks(f[key].length)})`);
      p.push(...f[key]);
    }
  }
  if (f.employees.length && skip !== 'employees') {
    c.push(`p.size_bucket IN (${marks(f.employees.length)})`);
    p.push(...f.employees.map((s) => SIZE_KEYS.indexOf(s) + 1));
  }
  if (f.revenue.length && skip !== 'revenue') {
    c.push(`p.revenue_bucket IN (${marks(f.revenue.length)})`);
    p.push(...f.revenue.map((s) => REVENUE_KEYS.indexOf(s) + 1));
  }
  // Install base: technologies are kept per company
  if (f.tech.length) { c.push(companyIds(techMatch(f.tech.length))); p.push(...f.tech.map(lc)); }
  if (f.techNot.length) { c.push(`NOT coalesce(${companyIds(techMatch(f.techNot.length))}, false)`); p.push(...f.techNot.map(lc)); }
  for (const [key, col] of Object.entries(BOOL_COL)) {
    if (f[key] && skip !== key) {
      c.push(`${col} = ?`);
      p.push(f[key] === 'true');
    }
  }
  // The date filter uses "Updated on" from the data file (URL keys keep their old names, so saved searches still work)
  if (f.verifiedFrom) { c.push('p.updated_at >= ?::DATE'); p.push(f.verifiedFrom); }
  if (f.verifiedTo) { c.push('p.updated_at <= ?::DATE'); p.push(f.verifiedTo); }
  if (extra.saved) {
    c.push('p.id IN (SELECT person_id FROM saved WHERE user_id = ?)');
    p.push(extra.user?.id ?? 0);
  }
  if (extra.savedList) {
    // Only the owner's list: someone else's list id matches nothing
    c.push(`p.id IN (SELECT person_id FROM saved_list_people
      WHERE list_id = (SELECT id FROM saved_lists WHERE id = ? AND user_id = ?))`);
    p.push(extra.savedList, extra.user?.id ?? 0);
  }
  if (extra.ids?.length) {
    c.push(`p.id IN (${marks(extra.ids.length)})`);
    p.push(...extra.ids);
  }
  if (extra.roles) {
    // Download window: anyone with one of the ticked roles
    const { seniority, department, titles } = extra.roles;
    const any = [];
    if (seniority.length) { any.push(`p.seniority IN (${marks(seniority.length)})`); p.push(...seniority); }
    if (department.length) { any.push(`p.department IN (${marks(department.length)})`); p.push(...department); }
    if (titles.length) { any.push(`p.title_id IN (${titleMatch(titles.length)})`); p.push(...titles.map(lc)); }
    if (any.length) c.push(`(${any.join(' OR ')})`);
  }
  if (extra.updatedDays) {
    // Download window: record updated in the last N days (today included)
    c.push('p.updated_at >= current_date - CAST(? AS INTEGER)');
    p.push(extra.updatedDays);
  }
  if (extra.narrow) {
    // More filters on top of these (the admin looking inside a saved search)
    const n = buildWhere(extra.narrow);
    if (n.sql) { c.push(n.sql.replace('WHERE ', '')); p.push(...n.params); }
  }
  return { sql: c.length ? `WHERE ${c.join(' AND ')}` : '', params: p };
}

function orderBy(view) {
  const d = view.sortDir === 'desc' ? 'DESC' : 'ASC';
  const col = SORT_SQL[view.sortBy];
  return col ? `ORDER BY ${col} ${d} NULLS LAST, p.id` : `ORDER BY p.id ${d}`;
}

// ids=1,2,3 (a guest's saved list or selected rows), up to 1,000
export function parseIds(sp) {
  const raw = (sp.get('ids') || '').split(',').filter(Boolean);
  const ids = raw.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);
  if (ids.length !== raw.length) throw new HttpError(400, 'ids must be a comma separated list of numbers');
  if (ids.length > 1000) throw new HttpError(400, 'Use at most 1,000 ids. For more, use "Download all results".');
  return ids;
}

function extraFrom(sp, user) {
  const list = Math.floor(Number(sp.get('savedList')));
  return { user, ids: parseIds(sp), saved: sp.get('saved') === 'true', savedList: list > 0 ? list : 0 };
}

// City / industry / seniority / ... are matched exactly (fast). Map what the URL
// says ("pune") onto the stored spelling ("Pune") so links stay case-insensitive.
const CANONICAL = { ...PICK_COL };
async function canonical(f, signal) {
  const all = await allValues(signal);
  const out = { ...f };
  for (const key of Object.keys(CANONICAL)) out[key] = f[key].map((v) => all[key].get(v.toLowerCase()) ?? v);
  return out;
}

async function allValues(signal) {
  return cached(caches.globals, 'allValues', async (sig) => {
    const out = {};
    for (const [key, col] of Object.entries(CANONICAL)) {
      const rows = await query(`SELECT DISTINCT ${col} AS v FROM people p WHERE ${col} IS NOT NULL`, [], { signal: sig });
      out[key] = new Map(rows.map((r) => [r.v.toLowerCase(), r.v]));
    }
    return out;
  }, signal);
}

const extraKey = (extra) => `${extra.saved ? `saved:${extra.user?.id ?? 0}` : ''}|${
  extra.savedList ? `saved:list:${extra.user?.id ?? 0}:${extra.savedList}` : ''}|${extra.ids.join(',')}|${
  extra.narrow ? filterKey(extra.narrow) : ''}`;

/** { people, companies }: matching people and the distinct companies they work at */
export async function countPeople(f, extra, signal) {
  return cached(caches.counts, `${filterKey(f)}#${extraKey(extra)}`, async (sig) => {
    const w = buildWhere(f, null, extra);
    return queryOne(`SELECT count(*) AS people, count(DISTINCT p.company_id) AS companies FROM people p ${w.sql}`, w.params, { signal: sig });
  }, signal);
}
// Counts that depend on a user's saved list go stale when that list changes
function clearSavedCounts() {
  for (const k of caches.counts.map.keys()) if (k.includes('saved:')) caches.counts.map.delete(k);
  for (const k of caches.pages.map.keys()) if (k.includes('saved:')) caches.pages.map.delete(k);
}

/** One page of people for the given URL filters */
export async function searchPeople(sp, user, signal, narrow = null) {
  await requirePeople();
  const started = performance.now();
  const f = await canonical(parseFilters(sp), signal);
  const view = parseView(sp);
  const extra = { ...extraFrom(sp, user), narrow };
  const offset = (view.page - 1) * view.pageSize;
  // A saved list is at most MAX_EXPORT_ROWS people, so all of it can be paged through
  const maxOffset = extra.savedList || extra.saved ? Math.max(MAX_OFFSET, MAX_EXPORT_ROWS) : MAX_OFFSET;
  if (offset > maxOffset) {
    throw new HttpError(400, `Only the first ${maxOffset.toLocaleString('en-IN')} results can be paged through. Add filters to narrow the search.`);
  }
  const w = buildWhere(f, null, extra);
  const order = orderBy(view);
  const key = `${filterKey(f)}#${extraKey(extra)}#${view.sortBy}#${view.sortDir}#${view.pageSize}#${view.page}`;
  // Late materialization: find the page's ids with only the filter and sort
  // columns, then read name/email/etc. for just those rows (about 10x faster).
  const [{ people: total, companies }, rows] = await Promise.all([
    countPeople(f, extra, signal),
    cached(caches.pages, key, (sig) => query(
      `SELECT ${COLS} FROM people p WHERE p.id IN (SELECT p.id FROM people p ${w.sql} ${order} LIMIT ? OFFSET ?) ${order}`,
      [...w.params, view.pageSize, offset], { signal: sig }), signal),
  ]);
  const pageIds = rows.map((r) => r.id);
  const savedIds = user && rows.length
    ? new Set((await small(`SELECT person_id FROM saved WHERE user_id = ? AND person_id IN (${marks(rows.length)})
        UNION SELECT person_id FROM saved_list_people
        WHERE list_id IN (SELECT id FROM saved_lists WHERE user_id = ?) AND person_id IN (${marks(rows.length)})`,
      [user.id, ...pageIds, user.id, ...pageIds], { signal })).map((r) => r.person_id))
    : new Set();
  return {
    content: rows.map((r) => ({ ...r, saved: savedIds.has(r.id) ? 1 : 0 })),
    totalElements: total,
    totalCompanies: companies,
    page: view.page,
    pageSize: view.pageSize,
    totalPages: Math.max(1, Math.ceil(Math.min(total, maxOffset + view.pageSize) / view.pageSize)),
    maxOffset,
    tookMs: Math.round(performance.now() - started),
  };
}

// ---------- live filter counts (facets) ----------
// Every option shows how many people match it together with all *other*
// active filters, like Apollo.

const FACET_COL = {
  title: 'p.title_id', ...PICK_COL, employees: 'p.size_bucket', revenue: 'p.revenue_bucket', ...BOOL_COL,
};
const FACETS = Object.keys(FACET_COL);
const SEARCHABLE = ['industry', 'country', 'state', 'county', 'city'];
const FACET_LIMIT = 100;
const isActive = (f, n) => (n === 'title'
  ? f.personTitles.length + f.personNotTitles.length + f.titleList.length + f.titleNotList.length > 0
  : BOOL_COL[n] ? Boolean(f[n]) : f[n].length > 0);
const low = (signal) => ({ signal, priority: 'low' });

const byKeys = (keys, list) => keys.map((k, i) => ({ value: k, count: list.find((x) => x.value === String(i + 1))?.count || 0 }));
// Known values first in this order, then the rest as they come (most people first)
const rank = (order, v) => (order.includes(v) ? order.indexOf(v) : order.length);
const byOrder = (order, list) => list.sort((a, b) => rank(order, a.value) - rank(order, b.value));
// Fixed dropdowns (options.js): every option in the given order, 0 when no one matches.
// fq = text typed in the group's search box.
// Values the user added that are not in the list (typed + "Add") come first, with their counts.
function fixed(name, list, fq = '', selected = []) {
  const counts = new Map(list.map((x) => [x.value.toLowerCase(), x.count]));
  const q = fq.toLowerCase();
  const known = new Set(FIXED_OPTIONS[name].map((v) => v.toLowerCase()));
  const added = selected.filter((v) => !known.has(v.toLowerCase()) && (!q || v.toLowerCase().includes(q)));
  return [...added, ...FIXED_OPTIONS[name].filter((v) => !q || v.toLowerCase().includes(q))]
    .map((v) => ({ value: v, count: counts.get(v.toLowerCase()) || 0 }));
}
function shape(name, list, fq = '', selected = []) {
  if (name === 'employees') return byKeys(SIZE_KEYS, list);
  if (name === 'revenue') return byKeys(REVENUE_KEYS, list);
  if (BOOL_COL[name]) return ['true', 'false'].map((v) => ({ value: v, count: list.find((x) => x.value === v)?.count || 0 }));
  if (FIXED_OPTIONS[name]) return fixed(name, list, fq, selected);
  if (name === 'emailStatus') return byOrder(EMAIL_STATUSES, list);
  return list.slice(0, FACET_LIMIT);
}

// Groups whose own filter is not in use share one WHERE clause, so they are
// counted in ONE scan with GROUPING SETS (about 2.5x cheaper than one query each).
async function sharedFacets(f, extra, names, signal) {
  const w = buildWhere(f, null, extra);
  const cols = names.map((n) => FACET_COL[n]);
  const rows = await query(
    `SELECT ${names.map((n, i) => `GROUPING(${cols[i]}) AS g_${n}, CAST(${cols[i]} AS VARCHAR) AS v_${n}`).join(', ')}, count(*) AS n
     FROM people p ${w.sql} GROUP BY GROUPING SETS (${cols.map((c) => `(${c})`).join(', ')})`,
    w.params, low(signal));
  const out = {};
  for (const name of names) {
    const list = rows.filter((r) => r[`g_${name}`] === 0 && r[`v_${name}`] !== null)
      .map((r) => ({ value: r[`v_${name}`], count: r.n }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    if (name === 'title') {
      const top = list.slice(0, 25);
      const titles = top.length
        ? new Map((await query(`SELECT id, title FROM titles WHERE id IN (${marks(top.length)})`, top.map((x) => Number(x.value)), low(signal)))
          .map((r) => [String(r.id), r.title]))
        : new Map();
      out.title = { options: top.map((x) => ({ value: titles.get(x.value), count: x.count })).filter((x) => x.value), chips: {} };
    } else out[name] = shape(name, list);
  }
  return out;
}

// One group with its own filter left out. fq = text typed in the group's search box.
async function ownFacet(f, extra, name, fq, signal) {
  const skip = name;
  const w = buildWhere(f, skip, extra);
  const cond = [w.sql || 'WHERE true'];
  const params = [...w.params];
  if (name === 'title') {
    if (fq) { cond.push(`p.title_id IN (${titleMatch(1)})`); params.push(lc(fq)); }
    const top = query(
      `SELECT t.title AS value, x.n AS count FROM (
         SELECT title_id, count(*) AS n FROM people p ${cond.join(' AND ')} AND p.title_id IS NOT NULL
         GROUP BY 1 ORDER BY 2 DESC LIMIT 25) x JOIN titles t ON t.id = x.title_id ORDER BY x.n DESC, t.title`,
      params, low(signal));
    // A live count for every include / exclude keyword the user typed
    const words = [...f.personTitles, ...f.personNotTitles];
    const chips = words.length
      ? queryOne(`SELECT ${words.map((_, i) => `count(*) FILTER (WHERE p.title_id IN (${titleMatch(1)})) AS c${i}`).join(', ')}
          FROM people p ${w.sql}`, [...words.map(lc), ...w.params], low(signal))
      : Promise.resolve({});
    const [options, chipRow] = await Promise.all([top, chips]);
    const counts = {};
    words.forEach((word, i) => { counts[lc(word)] = chipRow[`c${i}`] ?? 0; });
    return { options, chips: counts };
  }
  const col = FACET_COL[name];
  if (fq && SEARCHABLE.includes(name)) { cond.push(`contains(lower(${col}), ?)`); params.push(lc(fq)); }
  // Selected values are listed first so their counts stay visible.
  const sel = PICK_COL[name] ? f[name] : [];
  const selOrder = sel.length ? `(${col} IN (${marks(sel.length)})) DESC, ` : '';
  const rows = await query(
    `SELECT CAST(${col} AS VARCHAR) AS value, count(*) AS count FROM people p ${cond.join(' AND ')} AND ${col} IS NOT NULL
     GROUP BY ${col} ORDER BY ${selOrder}count DESC, value ${FIXED_OPTIONS[name] ? '' : `LIMIT ${FACET_LIMIT}`}`,
    [...params, ...sel], low(signal));
  return shape(name, rows, fq, sel);
}

// Install base options: people per technology over all companies (cached).
// Counting it live per search would mean expanding 20M rows x technologies.
async function techOptions(fq, signal) {
  return cached(caches.facets, `tech#${lc(fq)}`, (sig) => query(
    `SELECT t AS value, sum(people)::BIGINT AS count FROM (SELECT unnest(techs) AS t, people FROM companies WHERE people > 0)
     ${fq ? 'WHERE contains(lower(t), ?)' : ''} GROUP BY t ORDER BY count DESC, value LIMIT ${fq ? FACET_LIMIT : 300}`,
    fq ? [lc(fq)] : [], low(sig)), signal);
}

/** Live counts for every filter group. only + fq: one group, options containing fq. */
export async function getFacets(sp, user, signal) {
  await requirePeople();
  const started = performance.now();
  if (sp.get('facet') === 'tech') {
    return { facets: { tech: await techOptions((sp.get('fq') || '').trim().slice(0, 100), signal) }, tookMs: Math.round(performance.now() - started) };
  }
  const f = await canonical(parseFilters(sp), signal);
  const extra = extraFrom(sp, user);
  const only = FACETS.includes(sp.get('facet')) ? sp.get('facet') : null;
  const fq = (sp.get('fq') || '').trim().slice(0, 100);
  const key = `${filterKey(f)}#${extraKey(extra)}`;
  let facets;
  if (only) {
    facets = { [only]: await cached(caches.facets, `${only}#${lc(fq)}#${key}`, (sig) => ownFacet(f, extra, only, fq, sig), signal) };
  } else {
    facets = await cached(caches.facets, `all#${key}`, async (sig) => {
      const shared = FACETS.filter((n) => !isActive(f, n));
      const own = FACETS.filter((n) => isActive(f, n));
      const [s, ...rest] = await Promise.all([
        shared.length ? sharedFacets(f, extra, shared, sig) : {},
        ...own.map((n) => ownFacet(f, extra, n, '', sig)),
      ]);
      const res = { ...s };
      own.forEach((n, i) => { res[n] = rest[i]; });
      return res;
    }, signal);
  }
  return { facets, tookMs: Math.round(performance.now() - started) };
}

/** Zip codes -> where they are: { '411001': { city, county, state, country, people } } */
export async function lookupZips(zips, signal) {
  await requirePeople();
  const list = [...new Set(zips.map((z) => String(z).replace(/\s+/g, '').toUpperCase()).filter(Boolean))].slice(0, 100);
  if (!list.length) return {};
  return cached(caches.facets, `zips#${list.sort().join(',')}`, async (sig) => {
    const rows = await query(
      `SELECT zip, loc.city AS city, loc.county AS county, loc.state AS state, loc.country AS country, people FROM (
         SELECT zip, mode(struct_pack(city := city, county := county, state := state, country := country)) AS loc, count(*) AS people
         FROM people WHERE zip IN (${marks(list.length)}) GROUP BY zip)`, list, low(sig));
    return Object.fromEntries(rows.map(({ zip, ...r }) => [zip, r]));
  }, signal);
}

// ---------- filter options & dashboard numbers (cached until data changes) ----------

export async function getFilters(signal) {
  await requirePeople();
  return cached(caches.globals, 'filters', async (sig) => {
    const top = (col, limit) => query(
      `SELECT ${col} AS value, count(*) AS count FROM people WHERE ${col} IS NOT NULL GROUP BY ${col} ORDER BY count DESC LIMIT ${limit}`,
      [], { signal: sig });
    const [city, state, county, emailStatus, titles, tech] = await Promise.all([
      top('city', 500), top('state', 300), top('county', 500), top('email_status', 10),
      query('SELECT title AS value FROM titles ORDER BY people DESC LIMIT 300', [], { signal: sig }),
      techOptions('', sig),
    ]);
    byOrder(EMAIL_STATUSES, emailStatus);
    // Function, seniority, industry and country are fixed lists (options.js)
    const seniority = SENIORITY_LEVELS, industry = INDUSTRIES, department = FUNCTIONS, country = COUNTRIES;
    return {
      city, seniority, industry, department, country, state, county, emailStatus, tech,
      titles: titles.map((t) => t.value), employees: SIZE_KEYS, revenue: REVENUE_KEYS,
      maxExportRows: MAX_EXPORT_ROWS, maxOffset: MAX_OFFSET,
    };
  }, signal);
}

export async function getBaseStats(signal) {
  await requirePeople();
  return cached(caches.globals, 'stats', async (sig) => {
    const r = await queryOne(`SELECT (SELECT count(*) FROM people) AS "totalPeople",
      (SELECT count(*) FROM people WHERE has_email) AS "withEmail",
      (SELECT count(*) FROM companies WHERE people > 0) AS "totalCompanies"`, [], { signal: sig });
    return { totalPeople: r.totalPeople, withEmail: r.withEmail, totalCompanies: r.totalCompanies };
  }, signal);
}

// Guests (user = null) get zeros here; their lists live in the browser (components/Session.js)
export async function getStats(user, signal) {
  const base = await getBaseStats(signal);
  if (!user) return { ...base, saved: 0, tasksDue: 0, credits: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const r = await smallOne(`SELECT (SELECT count(*) FROM saved_lists WHERE user_id = ?) AS saved,
    (SELECT count(*) FROM tasks WHERE user_id = ? AND NOT done AND due_date <= ?) AS "tasksDue",
    (SELECT coalesce(download_credits, 0) FROM users WHERE id = ?) AS credits`, [user.id, user.id, today, user.id], { signal });
  return { ...base, saved: r.saved, tasksDue: r.tasksDue, credits: user.role === 'admin' ? null : r.credits };
}

// ---------- companies ----------
// Same URL keys as the people search (industry, employees, revenue, country,
// state, city, tech, company / domain include-exclude and lists), applied to
// the companies table.
const PAGE = (v) => Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(v)) || 25));
const COMPANY_SORTS = {
  people: 'people DESC, name', name: 'name', employees: 'employees DESC NULLS LAST, name', revenue: 'revenue DESC NULLS LAST, name',
};

function buildCompanyWhere(f) {
  const c = ['people > 0']; // companies whose last person was deleted stay in the table with 0 people
  const p = [];
  if (f.q) { c.push(`(${allWordsSql('?', 'name_lc')} OR contains(coalesce(domain, ''), ?))`); p.push(f.q, lc(f.q)); }
  includeExclude(c, p, f, 'company', 'name_lc', { lower: true });
  includeExclude(c, p, f, 'domain', 'domain');
  for (const key of ['industry', 'country', 'state', 'city']) {
    if (f[key].length) { c.push(`${key} IN (${marks(f[key].length)})`); p.push(...f[key]); }
  }
  if (f.employees.length) { c.push(`size_bucket IN (${marks(f.employees.length)})`); p.push(...f.employees.map((s) => SIZE_KEYS.indexOf(s) + 1)); }
  if (f.revenue.length) { c.push(`revenue_bucket IN (${marks(f.revenue.length)})`); p.push(...f.revenue.map((s) => REVENUE_KEYS.indexOf(s) + 1)); }
  if (f.tech.length) { c.push(techMatch(f.tech.length)); p.push(...f.tech.map(lc)); }
  if (f.techNot.length) { c.push(`NOT coalesce(${techMatch(f.techNot.length)}, false)`); p.push(...f.techNot.map(lc)); }
  return { sql: `WHERE ${c.join(' AND ')}`, params: p };
}

export async function searchCompanies(sp, signal) {
  await requirePeople();
  const started = performance.now();
  const f = await canonical(parseFilters(sp), signal);
  const pageSize = PAGE(sp.get('pageSize'));
  const page = Math.max(1, Math.floor(Number(sp.get('page'))) || 1);
  const order = COMPANY_SORTS[sp.get('sort')] || COMPANY_SORTS.people;
  const offset = (page - 1) * pageSize;
  if (offset > MAX_OFFSET) throw new HttpError(400, 'That page is too deep. Add filters or search for the company name instead.');
  const w = buildCompanyWhere(f);
  const [total, rows] = await Promise.all([
    cached(caches.companyCounts, filterKey(f), async (sig) => (await queryOne(`SELECT count(*) AS n FROM companies ${w.sql}`, w.params, { signal: sig })).n, signal),
    query(`SELECT name AS company, domain, industry, employees, revenue, city, state, country, techs, people
      FROM companies ${w.sql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...w.params, pageSize, offset], { signal }),
  ]);
  return {
    content: rows,
    totalElements: total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(Math.min(total, MAX_OFFSET + pageSize) / pageSize)),
    tookMs: Math.round(performance.now() - started),
  };
}

// ---------- saved leads ----------
export const cleanIds = (ids, max) =>
  [...new Set((Array.isArray(ids) ? ids : []).map(Number))].filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, max);

export async function saveLeads(userId, ids) {
  const clean = cleanIds(ids, 5000);
  if (!clean.length) return { added: 0, requested: 0 };
  const before = (await smallOne('SELECT count(*) AS n FROM saved WHERE user_id = ?', [userId])).n;
  // Only ids that exist; already-saved ones are skipped
  await small(`INSERT INTO saved (user_id, person_id) SELECT ?, id FROM people WHERE id IN (${marks(clean.length)}) ON CONFLICT DO NOTHING`,
    [userId, ...clean]);
  const after = (await smallOne('SELECT count(*) AS n FROM saved WHERE user_id = ?', [userId])).n;
  clearSavedCounts();
  return { added: after - before, requested: clean.length };
}

/**
 * Saves everything matching the URL filters (same order as the list), up to
 * MAX_EXPORT_ROWS, as ONE new named list. The Saved page shows it as a single
 * entry; opening it pages through all of its people.
 */
export async function saveSearch(user, sp, { name, summary } = {}, signal) {
  await requirePeople();
  const f = await canonical(parseFilters(sp), signal);
  const extra = { ...extraFrom(sp, user), saved: false, savedList: 0 };
  const w = buildWhere(f, null, extra);
  const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const listName = clean(name, 120) || `Search ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  const query_ = new URLSearchParams(sp);
  ['page', 'pageSize', 'saved', 'savedList', 'ids'].forEach((k) => query_.delete(k));
  const { id } = await smallOne('INSERT INTO saved_lists (user_id, name, summary, query) VALUES (?, ?, ?, ?) RETURNING id',
    [user.id, listName, clean(summary, 500) || null, query_.toString()]);
  try {
    await query(`INSERT INTO saved_list_people (list_id, person_id)
      SELECT ?, id FROM (SELECT p.id FROM people p ${w.sql} ${orderBy(parseView(sp))} LIMIT ?)`,
    [id, ...w.params, MAX_EXPORT_ROWS], { signal });
  } catch (e) {
    // Cancelled or failed: do not leave a half-filled list behind
    await small('DELETE FROM saved_list_people WHERE list_id = ?', [id]).catch(() => {});
    await small('DELETE FROM saved_lists WHERE id = ?', [id]).catch(() => {});
    throw e;
  }
  const { n } = await smallOne('SELECT count(*) AS n FROM saved_list_people WHERE list_id = ?', [id]);
  clearSavedCounts();
  return { id, name: listName, added: n, limit: MAX_EXPORT_ROWS };
}

/**
 * Saves only the filters of a search, under a name. Opening it later goes back
 * to People with those filters applied, so the results are always current.
 */
export async function saveFilters(user, sp, { name, summary } = {}, signal) {
  await requirePeople();
  const query_ = new URLSearchParams(sp);
  ['page', 'pageSize', 'saved', 'savedList', 'ids'].forEach((k) => query_.delete(k));
  const f = await canonical(parseFilters(query_), signal);
  const { people } = await countPeople(f, { user, ids: [], saved: false, savedList: 0 }, signal);
  const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const listName = clean(name, 120) || `Search ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  const { id } = await smallOne(`INSERT INTO saved_lists (user_id, name, summary, query, kind, result_count)
    VALUES (?, ?, ?, ?, 'search', ?) RETURNING id`, [user.id, listName, clean(summary, 500) || null, query_.toString(), people]);
  return { id, name: listName, results: people };
}

/** The user's saved searches and lists (newest first) + how many leads were saved one by one */
export async function listSavedLists(userId) {
  const lists = await small(`SELECT l.id, l.name, l.summary, l.query, l.kind, strftime(l.created_at, '%Y-%m-%d %H:%M') AS created_at,
      CASE WHEN l.kind = 'search' THEN coalesce(l.result_count, 0) ELSE coalesce(c.n, 0) END AS size
    FROM saved_lists l
    LEFT JOIN (SELECT list_id, count(*) AS n FROM saved_list_people
      WHERE list_id IN (SELECT id FROM saved_lists WHERE user_id = ?) GROUP BY list_id) c ON c.list_id = l.id
    WHERE l.user_id = ? ORDER BY l.created_at DESC, l.id DESC`, [userId, userId]);
  const { n } = await smallOne('SELECT count(*) AS n FROM saved WHERE user_id = ?', [userId]);
  return { lists, individual: n };
}

async function ownList(userId, id) {
  const row = await smallOne(`SELECT id, name, summary, query, strftime(created_at, '%Y-%m-%d %H:%M') AS created_at
    FROM saved_lists WHERE id = ? AND user_id = ?`, [Math.floor(Number(id)) || 0, userId]);
  if (!row) throw new HttpError(404, 'Saved list not found');
  return row;
}

export async function getSavedList(userId, id) {
  const row = await ownList(userId, id);
  const { n } = await smallOne('SELECT count(*) AS n FROM saved_list_people WHERE list_id = ?', [row.id]);
  return { ...row, size: n };
}

export async function renameSavedList(userId, id, name) {
  const row = await ownList(userId, id);
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!clean) throw new HttpError(400, 'Name is required');
  await small('UPDATE saved_lists SET name = ? WHERE id = ?', [clean, row.id]);
  return { id: row.id, name: clean };
}

export async function deleteSavedList(userId, id) {
  const row = await ownList(userId, id);
  const r = await small('DELETE FROM saved_list_people WHERE list_id = ? RETURNING person_id', [row.id]);
  await small('DELETE FROM saved_lists WHERE id = ?', [row.id]);
  clearSavedCounts();
  return { removed: r.length };
}

export async function removeFromSavedList(userId, id, personId) {
  const row = await ownList(userId, id);
  const r = await small('DELETE FROM saved_list_people WHERE list_id = ? AND person_id = ? RETURNING person_id',
    [row.id, Number(personId) || 0]);
  clearSavedCounts();
  return { removed: r.length };
}

export async function clearSaved(userId) {
  const r = await small('DELETE FROM saved WHERE user_id = ? RETURNING person_id', [userId]);
  clearSavedCounts();
  return { removed: r.length };
}

export async function removeSaved(userId, id) {
  const r = await small('DELETE FROM saved WHERE user_id = ? AND person_id = ? RETURNING person_id', [userId, Number(id) || 0]);
  clearSavedCounts();
  return { removed: r.length };
}

// ---------- CSV export ----------
export const EXPORT_COLUMNS = [
  ['id', 'ID'], ['name', 'Name'], ['email', 'Email'], ['email_status', 'Email Status'], ['verified_at', 'Verified On'],
  ['title', 'Job Title'], ['seniority', 'Seniority'], ['department', 'Function'],
  ['phone', 'Phone'], ['direct_phone', 'Direct Phone'],
  ['company', 'Company'], ['domain', 'Company Domain'],
  ['address1', 'Address 1'], ['address2', 'Address 2'],
  ['city', 'City'], ['county', 'County'], ['state', 'State'], ['zip', 'Zip / Postal Code'], ['country', 'Country'],
  ['industry', 'Industry'], ['employees', 'Employees'], ['revenue', 'Annual Revenue (USD)'], ['techs', 'Technologies'],
  ['company_linkedin', 'Company LinkedIn URL'], ['linkedin', 'Employee LinkedIn URL'], ['updated_at', 'Updated On'],
];

// What the user picked in the download window:
//   dlCompanies=100     only the 100 companies with the most matching people
//   dlPerCompany=2      at most 2 people from each company, highest seniority first
//   dlSeniority, dlFunction, dlTitle (repeated)  only people with one of these roles
function downloadChoices(sp) {
  const count = (k) => {
    const raw = sp.get(k);
    if (raw == null || raw === '') return 0;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'Enter a whole number, 1 or more');
    return Math.min(n, MAX_EXPORT_ROWS);
  };
  const values = (k) => [...new Set(sp.getAll(k).map((v) => v.replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean))].slice(0, 100);
  return {
    companies: count('dlCompanies'),
    perCompany: count('dlPerCompany'),
    // From each company: 'updated' = most recently updated first, otherwise highest seniority first
    pick: sp.get('dlPick') === 'updated' ? 'updated' : 'seniority',
    // Only people updated in the last N days ("Updated on" in the data file)
    updatedDays: Math.min(count('dlUpdatedDays'), 36500),
    roles: { seniority: values('dlSeniority'), department: values('dlFunction'), titles: values('dlTitle') },
  };
}

/** SQL for everything matching the URL filters and download choices, up to MAX_EXPORT_ROWS */
export async function exportQuery(sp, user, signal) {
  await requirePeople();
  const f = await canonical(parseFilters(sp), signal);
  const extra = extraFrom(sp, user);
  if ((extra.saved || extra.savedList) && !user) throw new HttpError(401, 'Please log in to download your saved leads');
  const limit = Math.min(MAX_EXPORT_ROWS, Math.max(1, Math.floor(Number(sp.get('limit'))) || MAX_EXPORT_ROWS));
  const { companies, perCompany, pick, updatedDays, roles } = downloadChoices(sp);
  const w = buildWhere(f, null, { ...extra, roles, updatedDays });
  const firstInCompany = pick === 'updated'
    ? `p.updated_at DESC NULLS LAST, ${SORT_SQL.seniority} NULLS LAST, p.id`
    : `${SORT_SQL.seniority} NULLS LAST, p.updated_at DESC NULLS LAST, p.id`;
  let where = w.sql;
  let whereParams = w.params;
  if (companies || perCompany) {
    // A company limit only makes sense for people who have a company
    const base = `${w.sql ? `${w.sql} AND` : 'WHERE'} p.company_id IS NOT NULL`;
    const top = companies
      ? ` AND p.company_id IN (SELECT p.company_id FROM people p ${base} GROUP BY p.company_id ORDER BY count(*) DESC, p.company_id LIMIT ?)`
      : '';
    const topParams = companies ? [...w.params, companies] : [];
    const picked = perCompany
      ? `SELECT id FROM (SELECT p.id, row_number() OVER (PARTITION BY p.company_id ORDER BY ${firstInCompany}) AS rn
          FROM people p ${base}${top}) WHERE rn <= ?`
      : `SELECT p.id FROM people p ${base}${top}`;
    where = `WHERE p.id IN (${picked})`;
    whereParams = [...w.params, ...topParams, ...(perCompany ? [perCompany] : [])];
  }
  return {
    sql: `SELECT ${COLS} FROM people p ${where} ${orderBy(parseView(sp))} LIMIT ?`,
    params: [...whereParams, limit],
    // How many rows the download will have (= credits it uses) and from how many companies
    countSql: `SELECT count(*)::BIGINT AS n, count(DISTINCT company_id)::BIGINT AS companies
      FROM (SELECT p.company_id FROM people p ${where} LIMIT ?)`,
  };
}

// "Updated in the last …" choices in the download window
export const UPDATED_DAYS = [30, 90, 180, 365];

/** What the download window offers: the people in these results by company, role and verified date */
export async function downloadOptions(sp, user, signal) {
  await requirePeople();
  const f = await canonical(parseFilters(sp), signal);
  const extra = extraFrom(sp, user);
  if ((extra.saved || extra.savedList) && !user) throw new HttpError(401, 'Please log in to download your saved leads');
  const w = buildWhere(f, null, extra);
  const opts = low(signal);
  const notNull = (col) => `${w.sql ? `${w.sql} AND` : 'WHERE'} ${col} IS NOT NULL`;
  const group = (col, tail = '') => query(`SELECT ${col} AS value, count(*)::BIGINT AS n FROM people p ${notNull(col)} GROUP BY 1 ${tail}`, w.params, opts);
  const updatedIn = (days) => `count(*) FILTER (WHERE p.updated_at >= current_date - ${days})::BIGINT AS "updated${days}"`;
  const [totals, companyList, seniority, department, titles] = await Promise.all([
    queryOne(`SELECT count(*)::BIGINT AS rows, count(DISTINCT p.company_id)::BIGINT AS companies,
      count(*) FILTER (WHERE p.company_id IS NULL)::BIGINT AS "noCompany",
      count(p.updated_at)::BIGINT AS "updatedAny", ${UPDATED_DAYS.map(updatedIn).join(', ')}
      FROM people p ${w.sql}`, w.params, opts),
    // Same order as the "How many companies" choice, so the first 5 here are the 5 it takes
    query(`SELECT p.company AS value, count(*)::BIGINT AS n FROM people p ${notNull('p.company_id')}
      GROUP BY p.company_id, p.company ORDER BY n DESC, p.company_id LIMIT 200`, w.params, opts),
    group('p.seniority'),
    group('p.department', 'ORDER BY value'),
    group('p.title', 'ORDER BY n DESC, value LIMIT 30'),
  ]);
  const position = (v) => { const i = SENIORITY_LEVELS.indexOf(v); return i < 0 ? 99 : i; };
  return {
    ...totals,
    maxRows: MAX_EXPORT_ROWS,
    companyList,
    seniority: seniority.sort((a, b) => position(a.value) - position(b.value)),
    department,
    titles,
  };
}

// Quotes a CSV value and stops spreadsheet formulas (=, +, -, @, tab, CR at
// the start would run as a formula in Excel).
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
