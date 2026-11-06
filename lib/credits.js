// Download credits (server only). 1 credit = 1 person in a CSV download.
// Users start with 0 and ask for credits; an admin decides how many to give
// (or adds / removes credits on the Users page). Admins download without limit.
// Credits are taken when a download starts, for the rows it contains.
import { small, smallOne, transaction } from './db.js';
import { HttpError, toInt } from './route.js';

export const MAX_CREDITS = 100_000_000;
const TIME = (c) => `strftime(${c}, '%Y-%m-%d %H:%M:%S')`;
const UTC_NOW = "timezone('UTC', current_timestamp)";
const note = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 500) || null;
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export const isUnlimited = (user) => user?.role === 'admin';

export async function getBalance(userId) {
  return (await smallOne('SELECT coalesce(download_credits, 0) AS credits FROM users WHERE id = ?', [userId]))?.credits ?? 0;
}

/** A credit change made by an admin, kept in the request history as an approved entry */
export const grantLog = (run, userId, amount, text) => run(
  `INSERT INTO credit_requests (user_id, amount, note, status, granted, decided_at) VALUES (?, ?, ?, 'approved', ?, ${UTC_NOW})`,
  [userId, Math.abs(amount), text, amount]);

/** My balance, my requests and my downloads */
export async function myCredits(user) {
  const [credits, requests, downloads, used] = await Promise.all([
    getBalance(user.id),
    small(`SELECT id, amount, note, status, granted, admin_note, ${TIME('created_at')} AS created_at, ${TIME('decided_at')} AS decided_at
      FROM credit_requests WHERE user_id = ? ORDER BY id DESC LIMIT 100`, [user.id]),
    small(`SELECT id, row_count, kind, ${TIME('created_at')} AS created_at FROM downloads WHERE user_id = ? ORDER BY id DESC LIMIT 100`, [user.id]),
    smallOne('SELECT coalesce(sum(row_count), 0) AS n FROM downloads WHERE user_id = ?', [user.id]),
  ]);
  return { credits, unlimited: isUnlimited(user), used: used.n, pending: requests.some((r) => r.status === 'pending'), requests, downloads };
}

export async function requestCredits(user, { amount, note: text } = {}) {
  if (isUnlimited(user)) throw new HttpError(400, 'Admins can download without credits');
  const n = toInt(amount, 0);
  if (n < 1) throw new HttpError(400, 'Enter how many people you want to download (1 or more)');
  if (n > MAX_CREDITS) throw new HttpError(400, `You can ask for at most ${fmt(MAX_CREDITS)} credits at a time`);
  if (await smallOne("SELECT 1 AS x FROM credit_requests WHERE user_id = ? AND status = 'pending'", [user.id])) {
    throw new HttpError(400, 'You already have a request waiting. The admin will answer it soon.');
  }
  return smallOne('INSERT INTO credit_requests (user_id, amount, note) VALUES (?, ?, ?) RETURNING id', [user.id, n, note(text)]);
}

/**
 * Takes `rows` credits for a download, or throws 402 when there are not enough. Returns what is left.
 * record: { query, sql, params } keeps the filters and the people in it (sql returns them with an id column).
 */
export async function spendCredits(user, rows, kind, record = {}) {
  if (isUnlimited(user) || rows <= 0) return null;
  return transaction(async (run) => {
    const r = await run(`UPDATE users SET download_credits = coalesce(download_credits, 0) - ?
      WHERE id = ? AND coalesce(download_credits, 0) >= ? RETURNING download_credits AS credits`, [rows, user.id, rows]);
    if (!r.length) {
      const [{ credits }] = await run('SELECT coalesce(download_credits, 0) AS credits FROM users WHERE id = ?', [user.id]);
      throw new HttpError(402, `Not enough credits: this download has ${fmt(rows)} people and you have ${fmt(credits)} credits. Ask the admin for more on the Credits page.`);
    }
    const [{ id }] = await run('INSERT INTO downloads (user_id, row_count, kind, query) VALUES (?, ?, ?, ?) RETURNING id',
      [user.id, rows, kind || null, record.query || null]);
    if (record.sql) await run(`INSERT INTO download_people SELECT ?, id FROM (${record.sql})`, [id, ...record.params]);
    return r[0].credits;
  });
}

// ---------- admin ----------

/** Pending requests first, then the latest answered ones */
export function listCreditRequests() {
  return small(`SELECT r.id, r.user_id, u.email, u.name, coalesce(u.download_credits, 0) AS credits,
      r.amount, r.note, r.status, r.granted, r.admin_note, ${TIME('r.created_at')} AS created_at, ${TIME('r.decided_at')} AS decided_at,
      (SELECT coalesce(sum(row_count), 0) FROM downloads d WHERE d.user_id = r.user_id) AS downloaded
    FROM credit_requests r JOIN users u ON u.id = r.user_id
    ORDER BY (r.status = 'pending') DESC, r.id DESC LIMIT 300`);
}

/** action: 'approve' (gives `amount`, default what was asked) or 'reject' */
export async function decideCreditRequest(id, { action, amount, note: text } = {}) {
  const rid = toInt(id, 0);
  const req = await smallOne('SELECT id, user_id, amount, status FROM credit_requests WHERE id = ?', [rid]);
  if (!req) throw new HttpError(404, 'Request not found');
  if (req.status !== 'pending') throw new HttpError(400, 'This request was already answered');
  if (action === 'reject') {
    await small(`UPDATE credit_requests SET status = 'rejected', granted = 0, admin_note = ?, decided_at = ${UTC_NOW} WHERE id = ?`, [note(text), rid]);
    return { ok: true, status: 'rejected' };
  }
  if (action !== 'approve') throw new HttpError(400, 'action must be approve or reject');
  const give = amount == null || amount === '' ? req.amount : toInt(amount, 0);
  if (give < 1 || give > MAX_CREDITS) throw new HttpError(400, 'Enter how many credits to give (1 or more)');
  return transaction(async (run) => {
    await run(`UPDATE credit_requests SET status = 'approved', granted = ?, admin_note = ?, decided_at = ${UTC_NOW} WHERE id = ?`,
      [give, note(text), rid]);
    const [{ credits }] = await run(`UPDATE users SET download_credits = coalesce(download_credits, 0) + ? WHERE id = ?
      RETURNING download_credits AS credits`, [give, req.user_id]);
    return { ok: true, status: 'approved', granted: give, credits };
  });
}
