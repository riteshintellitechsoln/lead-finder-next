// Admin panel queries (server only): dashboard, users, people data.
// Every API route that calls these checks requireAdmin() first.
import { dataChanged, query, queryOne, small, smallOne, transaction } from './db.js';
import { hashPassword } from './password.js';
import { HttpError, toInt } from './route.js';
import { buildWhere, getBaseStats, getFilters, listSavedLists, searchPeople, COLS } from './people.js';
import { activeCount, describeQuery, downloadLabel, parseFilters } from './filters.js';
import { STAGING_COLS, cleanRowSql, insertPersonSql, revenueBucket, sizeBucket } from './schema.js';
import { MAX_CREDITS, grantLog } from './credits.js';

const CREATED = "strftime(created_at, '%Y-%m-%d %H:%M:%S') AS created_at";

// ---------- dashboard ----------
export async function adminStats() {
  const [base, filters, counts, recentUsers] = await Promise.all([
    getBaseStats().catch(() => ({ totalPeople: 0, withEmail: 0, totalCompanies: 0 })),
    getFilters().catch(() => ({ city: [] })),
    smallOne(`SELECT (SELECT count(*) FROM users WHERE role = 'user') AS users,
      (SELECT count(*) FROM users WHERE role = 'user' AND created_at >= timezone('UTC', current_timestamp) - INTERVAL 7 DAY) AS "newUsers7",
      (SELECT count(*) FROM saved_lists) AS "savedSearches",
      (SELECT count(*) FROM credit_requests WHERE status = 'pending') AS "pendingCredits"`),
    small(`SELECT id, email, name, ${CREATED}, CASE WHEN blocked THEN 1 ELSE 0 END AS blocked
      FROM users WHERE role = 'user' ORDER BY id DESC LIMIT 8`),
  ]);
  return { ...base, ...counts, recentUsers, topCities: filters.city.slice(0, 8) };
}

// ---------- users ----------
const ROLES = ['user', 'admin'];
const cleanEmail = (e) => String(e || '').trim().toLowerCase();

// One row per user with their totals. saved_people adds up the size of each saved
// search plus the leads saved one by one, so a person in two searches counts twice.
// given = credits left + credits used, which stays right whatever the history says.
const USER_TOTALS = `WITH list_sizes AS (SELECT list_id, count(*) AS n FROM saved_list_people GROUP BY list_id),
    saved_totals AS (SELECT l.user_id, count(*) AS searches,
        sum(CASE WHEN l.kind = 'search' THEN coalesce(l.result_count, 0) ELSE coalesce(z.n, 0) END)::BIGINT AS people
      FROM saved_lists l LEFT JOIN list_sizes z ON z.list_id = l.id GROUP BY l.user_id)
  SELECT u.id, u.email, u.name, u.role, CASE WHEN u.blocked THEN 1 ELSE 0 END AS blocked, strftime(u.created_at, '%Y-%m-%d %H:%M:%S') AS created_at,
      coalesce(st.searches, 0) AS saved,
      coalesce(st.people, 0) + (SELECT count(*) FROM saved x WHERE x.user_id = u.id) AS saved_people,
      (SELECT count(*) FROM tasks t WHERE t.user_id = u.id) AS tasks,
      coalesce(u.download_credits, 0) AS credits,
      coalesce(u.download_credits, 0) + coalesce(dl.n, 0) AS given,
      coalesce(dl.n, 0) AS downloaded
    FROM users u LEFT JOIN saved_totals st ON st.user_id = u.id
    LEFT JOIN (SELECT user_id, sum(row_count)::BIGINT AS n FROM downloads GROUP BY user_id) dl ON dl.user_id = u.id`;

export function listUsers() {
  return small(`${USER_TOTALS} ORDER BY u.role, u.id`);
}

const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const LATEST = 100;

/**
 * One user's totals (all time) with their saved searches, downloads and credit changes.
 * q: words to look for. from / to: 'YYYY-MM-DD HH:MM:SS' in UTC, from included, to not.
 * The browser sends them, so a day means the admin's own day, like the dates on the page.
 */
export async function getUserDetail(id, { q = '', from = '', to = '' } = {}) {
  const uid = toInt(id, 0);
  if ((from && !STAMP.test(from)) || (to && !STAMP.test(to))) throw new HttpError(400, 'Enter valid dates');
  const user = await smallOne(`${USER_TOTALS} WHERE u.id = ?`, [uid]);
  if (!user) throw new HttpError(404, 'User not found');

  const dates = [];
  if (from) dates.push(from);
  if (to) dates.push(to);
  const inDates = (col) => `${from ? ` AND ${col} >= CAST(? AS TIMESTAMP)` : ''}${to ? ` AND ${col} < CAST(? AS TIMESTAMP)` : ''}`;
  const word = String(q).trim().toLowerCase().slice(0, 200);
  const matches = (...texts) => !word || texts.join(' ').toLowerCase().includes(word);

  const [saved, individualInDates, allDownloads, allCredits, waiting] = await Promise.all([
    listSavedLists(uid),
    smallOne(`SELECT count(*) AS n FROM saved WHERE user_id = ?${inDates('created_at')}`, [uid, ...dates]),
    small(`SELECT d.id, d.row_count, d.kind, d.query, strftime(d.created_at, '%Y-%m-%d %H:%M:%S') AS created_at, coalesce(c.n, 0) AS recorded
      FROM downloads d LEFT JOIN (SELECT download_id, count(*) AS n FROM download_people
        WHERE download_id IN (SELECT id FROM downloads WHERE user_id = ?) GROUP BY download_id) c ON c.download_id = d.id
      WHERE d.user_id = ?${inDates('d.created_at')} ORDER BY d.id DESC`, [uid, uid, ...dates]),
    small(`SELECT id, amount, status, granted, note, admin_note, ${CREATED} FROM credit_requests
      WHERE user_id = ?${inDates('created_at')} ORDER BY id DESC`, [uid, ...dates]),
    smallOne("SELECT count(*) AS n FROM credit_requests WHERE user_id = ? AND status = 'pending'", [uid]),
  ]);

  // Saved searches come with their time as 'YYYY-MM-DD HH:MM'
  const lists = saved.lists.filter((l) => (!from || l.created_at >= from.slice(0, 16)) && (!to || l.created_at < to.slice(0, 16))
    && matches(l.name, l.summary, describeQuery(l.query)));
  const individual = matches('Individually saved leads') ? individualInDates.n : 0;
  const downloads = allDownloads.filter((d) => matches(downloadLabel(d.kind), describeQuery(d.query)));
  const creditHistory = allCredits.filter((r) => matches(r.note, r.admin_note, r.status));
  return {
    user,
    pending: waiting.n > 0,
    lists,
    individual,
    downloads: downloads.slice(0, LATEST),
    creditHistory: creditHistory.slice(0, LATEST),
    found: {
      savedPeople: lists.reduce((sum, l) => sum + l.size, individual),
      downloads: downloads.length,
      downloadedPeople: downloads.reduce((sum, d) => sum + d.row_count, 0),
      creditChanges: creditHistory.length,
    },
  };
}

const RECORD_PAGE_SIZE = 25;

/**
 * A page of people from one user's saved data, for the admin to look at.
 * source: 'search' (the saved filters applied to the current data), 'list' (the people
 * a "Save all" kept), 'download' (the people in a download) or 'individual'.
 * look: { q, verifiedFrom, verifiedTo } narrows the people shown. The saved data does not change.
 */
export async function getUserRecords(id, source, ref, pageNo, look = {}) {
  const narrow = parseFilters(new URLSearchParams(Object.entries(look).filter(([, v]) => v)));
  const uid = toInt(id, 0);
  const rid = toInt(ref, 0);
  const user = await smallOne('SELECT id, email, name FROM users WHERE id = ?', [uid]);
  if (!user) throw new HttpError(404, 'User not found');
  if (source === 'search') {
    const info = await smallOne(`SELECT id, name, summary, query, result_count, ${CREATED} FROM saved_lists WHERE id = ? AND user_id = ? AND query IS NOT NULL`, [rid, uid]);
    if (!info) throw new HttpError(404, 'Saved search not found');
    const sp = new URLSearchParams(info.query);
    ['saved', 'savedList', 'ids'].forEach((k) => sp.delete(k));
    sp.set('page', String(Math.max(1, toInt(pageNo, 1))));
    sp.set('pageSize', String(RECORD_PAGE_SIZE));
    const { content, totalElements, page, totalPages } = await searchPeople(sp, null, undefined, activeCount(narrow) ? narrow : null);
    return { user, source, info, content, totalElements, page, totalPages };
  }
  let info = {};
  let members;
  let memberParams = [uid];
  if (source === 'individual') {
    members = 'SELECT person_id FROM saved WHERE user_id = ?';
  } else if (source === 'download' || source === 'list') {
    info = await smallOne(source === 'download'
      ? `SELECT id, row_count, kind, query, ${CREATED} FROM downloads WHERE id = ? AND user_id = ?`
      : `SELECT id, name, summary, query, ${CREATED} FROM saved_lists WHERE id = ? AND user_id = ?`, [rid, uid]);
    if (!info) throw new HttpError(404, source === 'download' ? 'Download not found' : 'Saved search not found');
    members = source === 'download'
      ? 'SELECT person_id FROM download_people WHERE download_id = ?'
      : 'SELECT person_id FROM saved_list_people WHERE list_id = ?';
    memberParams = [rid];
  } else {
    throw new HttpError(400, 'source must be download, list or individual');
  }
  const more = buildWhere(narrow);
  const where = `p.id IN (${members})${more.sql ? ` AND ${more.sql.replace('WHERE ', '')}` : ''}`;
  const whereParams = [...memberParams, ...more.params];
  const { n } = await queryOne(`SELECT count(*)::BIGINT AS n FROM people p WHERE ${where}`, whereParams);
  const totalPages = Math.max(1, Math.ceil(n / RECORD_PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, toInt(pageNo, 1)));
  const content = await query(`SELECT ${COLS} FROM people p WHERE ${where} ORDER BY p.name, p.id LIMIT ? OFFSET ?`,
    [...whereParams, RECORD_PAGE_SIZE, (page - 1) * RECORD_PAGE_SIZE]);
  return { user, source, info, totalElements: n, page, totalPages, content };
}

export async function createUser({ email, name, password, role, credits } = {}) {
  const e = cleanEmail(email);
  if (!/^[^\s@]+@[^\s@]+$/.test(e)) throw new HttpError(400, 'Enter a valid email');
  if (String(password || '').length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (await smallOne('SELECT 1 AS x FROM users WHERE email = ?', [e])) throw new HttpError(400, 'A user with this email already exists');
  const r = ROLES.includes(role) ? role : 'user';
  const start = Math.max(0, toInt(credits, 0));
  if (start > MAX_CREDITS) throw new HttpError(400, `Credits can be at most ${MAX_CREDITS.toLocaleString('en-IN')}`);
  return transaction(async (run) => {
    const [u] = await run('INSERT INTO users (email, name, password_hash, role, download_credits) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [e, String(name || '').trim() || null, hashPassword(password), r, start]);
    if (start) await grantLog(run, u.id, start, 'Given when the account was created');
    return u;
  });
}

/** changes: { name, role, blocked, password, addCredits } (any of them). addCredits < 0 takes credits away. */
export async function updateUser(admin, id, changes = {}) {
  const uid = toInt(id, 0);
  const user = await smallOne('SELECT id FROM users WHERE id = ?', [uid]);
  if (!user) throw new HttpError(404, 'User not found');
  const self = uid === admin.id;
  if (self && (changes.blocked || (changes.role && changes.role !== 'admin'))) {
    throw new HttpError(400, 'You cannot block yourself or remove your own admin role');
  }
  if (changes.password != null && String(changes.password).length < 6) {
    throw new HttpError(400, 'Password must be at least 6 characters');
  }
  const addCredits = 'addCredits' in changes ? toInt(changes.addCredits, NaN) : 0;
  if (!Number.isFinite(addCredits) || Math.abs(addCredits) > MAX_CREDITS) throw new HttpError(400, 'Enter a whole number of credits');
  let credits;
  await transaction(async (run) => {
    if ('name' in changes) await run('UPDATE users SET name = ? WHERE id = ?', [String(changes.name || '').trim() || null, uid]);
    if (ROLES.includes(changes.role)) await run('UPDATE users SET role = ? WHERE id = ?', [changes.role, uid]);
    if ('blocked' in changes) {
      await run('UPDATE users SET blocked = ? WHERE id = ?', [Boolean(changes.blocked), uid]);
      if (changes.blocked) await run('DELETE FROM sessions WHERE user_id = ?', [uid]); // log them out now
    }
    if (changes.password != null) {
      await run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(changes.password), uid]);
      if (!self) await run('DELETE FROM sessions WHERE user_id = ?', [uid]);
    }
    if (addCredits) {
      const [{ have }] = await run('SELECT coalesce(download_credits, 0) AS have FROM users WHERE id = ?', [uid]);
      if (Number(have) + addCredits < 0) {
        throw new HttpError(400, `This user has only ${Number(have).toLocaleString('en-IN')} credits, so you cannot take away ${(-addCredits).toLocaleString('en-IN')}`);
      }
      [{ credits }] = await run(`UPDATE users SET download_credits = coalesce(download_credits, 0) + ?
        WHERE id = ? RETURNING download_credits AS credits`, [addCredits, uid]);
      await grantLog(run, uid, addCredits, addCredits > 0 ? 'Added by admin' : 'Removed by admin');
    }
  });
  return { ok: true, credits };
}

// Removes the user with their sessions, saved leads and tasks
export async function deleteUser(admin, id) {
  const uid = toInt(id, 0);
  if (uid === admin.id) throw new HttpError(400, 'You cannot delete your own account');
  const removed = await transaction(async (run) => {
    await run('DELETE FROM saved_list_people WHERE list_id IN (SELECT id FROM saved_lists WHERE user_id = ?)', [uid]);
    await run('DELETE FROM download_people WHERE download_id IN (SELECT id FROM downloads WHERE user_id = ?)', [uid]);
    for (const t of ['sessions', 'saved', 'saved_lists', 'tasks', 'credit_requests', 'downloads']) await run(`DELETE FROM ${t} WHERE user_id = ?`, [uid]);
    return (await run('DELETE FROM users WHERE id = ? RETURNING id', [uid])).length;
  });
  if (!removed) throw new HttpError(404, 'User not found');
  return { removed };
}

// ---------- people data ----------
// The form sends raw text (like one CSV row); it is cleaned by the same SQL as
// imports, so seniority / department are guessed, revenue "$12M" is parsed, etc.
const FIELDS = STAGING_COLS.filter((c) => c !== 'id');

function rawPerson(data) {
  const p = {};
  for (const f of FIELDS) p[f] = String(data?.[f] ?? '').trim().slice(0, 1000) || null;
  if (!p.name) throw new HttpError(400, 'Name is required');
  if (p.email && !/^[^\s@]+@[^\s@]+$/.test(p.email)) throw new HttpError(400, 'Email does not look valid');
  if (p.employees && !Number.isFinite(toInt(p.employees.replace(/,/g, ''), NaN))) throw new HttpError(400, '# Employees must be a number');
  return FIELDS.map((f) => p[f]);
}

// One admin edit at a time (new ids are max + 1)
let lock = Promise.resolve();
function serial(fn) {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
}

// Finds or creates the lookup row for a title / company and returns its id.
async function lookupId(run, table, value, c = {}) {
  if (!value) return null;
  const col = table === 'titles' ? 'title' : 'name';
  const hit = (await run(`SELECT id FROM ${table} WHERE ${col} = ?`, [value]))[0];
  if (hit) return hit.id;
  const id = (await run(`SELECT coalesce(max(id), 0) + 1 AS id FROM ${table}`))[0].id;
  if (table === 'titles') await run('INSERT INTO titles VALUES (?, ?, lower(?), 0)', [id, value, value]);
  else {
    await run(`INSERT INTO companies (id, name, name_lc, domain, industry, employees, size_bucket, revenue, revenue_bucket,
        city, state, country, techs, techs_lc, people)
      VALUES (?, ?, lower(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, string_split(?, ', '), string_split(lower(?), ', '), 0)`,
    [id, value, value, c.domain ?? null, c.industry ?? null, c.employees ?? null, sizeBucket(c.employees), c.revenue ?? null,
      revenueBucket(c.revenue), c.city ?? null, c.state ?? null, c.country ?? null, c.techs ?? null, c.techs ?? null]);
  }
  return id;
}

async function bump(run, table, id, by) {
  if (id) await run(`UPDATE ${table} SET people = greatest(people + ?, 0) WHERE id = ?`, [by, id]);
}

const personRow = async (run, id) => (await run(`SELECT ${COLS} FROM people p WHERE p.id = ?`, [id]))[0];

// Writes the person with this id (insert; for an edit the old row is deleted first)
async function writePerson(run, id, raw) {
  const clean = (await run(cleanRowSql(), [id, ...raw]))[0];
  const titleId = await lookupId(run, 'titles', clean.title);
  const companyId = await lookupId(run, 'companies', clean.company, clean);
  await run(insertPersonSql(), [id, ...raw, titleId, companyId]);
  return { titleId, companyId };
}

export function addPerson(data) {
  const raw = rawPerson(data);
  return serial(async () => {
    const row = await transaction(async (run) => {
      const id = (await run('SELECT coalesce(max(id), 0) + 1 AS id FROM people'))[0].id;
      const { titleId, companyId } = await writePerson(run, id, raw);
      await bump(run, 'titles', titleId, 1);
      await bump(run, 'companies', companyId, 1);
      return personRow(run, id);
    });
    dataChanged();
    return row;
  });
}

export function updatePerson(id, data) {
  const pid = toInt(id, 0);
  const raw = rawPerson(data);
  return serial(async () => {
    const row = await transaction(async (run) => {
      const old = (await run('SELECT title_id, company_id FROM people WHERE id = ?', [pid]))[0];
      if (!old) throw new HttpError(404, 'Person not found');
      await run('DELETE FROM people WHERE id = ?', [pid]);
      const { titleId, companyId } = await writePerson(run, pid, raw);
      if (old.title_id !== titleId) { await bump(run, 'titles', old.title_id, -1); await bump(run, 'titles', titleId, 1); }
      if (old.company_id !== companyId) { await bump(run, 'companies', old.company_id, -1); await bump(run, 'companies', companyId, 1); }
      return personRow(run, pid);
    });
    dataChanged();
    return row;
  });
}

export function deletePerson(id) {
  const pid = toInt(id, 0);
  return serial(async () => {
    await transaction(async (run) => {
      const old = (await run('SELECT title_id, company_id FROM people WHERE id = ?', [pid]))[0];
      if (!old) throw new HttpError(404, 'Person not found');
      await run('DELETE FROM saved WHERE person_id = ?', [pid]);
      await run('DELETE FROM saved_list_people WHERE person_id = ?', [pid]);
      await run('DELETE FROM download_people WHERE person_id = ?', [pid]); // ids can be used again
      await run('DELETE FROM people WHERE id = ?', [pid]);
      await bump(run, 'titles', old.title_id, -1);
      await bump(run, 'companies', old.company_id, -1);
    });
    dataChanged();
    return { removed: 1 };
  });
}

