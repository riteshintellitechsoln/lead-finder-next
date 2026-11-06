'use client';
// One user: credits left / given, downloads, saved searches. The admin adds or takes away credits here.
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { describeQuery, downloadLabel } from '@/lib/filters';
import { fmt, formatDateTime } from '@/lib/format';

const STATUS = { pending: ['Waiting', ''], approved: ['Approved', ' ok'], rejected: ['Rejected', ' due'] };

// A date from the date box -> the start of that day (+ days) on this computer, in UTC like the database
function dayStart(day, plus = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const t = new Date(`${day}T00:00`);
  t.setDate(t.getDate() + plus);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString().slice(0, 19).replace('T', ' ');
}

function creditChange(r) {
  if (r.status !== 'approved') return `Asked ${fmt(r.amount)}`;
  return (r.granted > 0 ? '+' : '−') + fmt(Math.abs(r.granted));
}

export default function Page() {
  return <Suspense fallback={<section className="view"><div className="card empty">Loading…</div></section>}><AdminUserPage /></Suspense>;
}

function AdminUserPage() {
  const { id } = useParams();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const urlQuery = sp.toString();
  const q = sp.get('q') || '';
  const from = sp.get('from') || '';
  const to = sp.get('to') || '';
  const badRange = Boolean(from && to && from > to);
  const [text, setText] = useState(q);
  const toast = useToast();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  // Only the latest answer counts when filters change quickly
  const latest = useRef(0);
  const load = useCallback(() => {
    if (badRange) return Promise.resolve();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (dayStart(from)) params.set('from', dayStart(from));
    if (dayStart(to, 1)) params.set('to', dayStart(to, 1));
    const call = ++latest.current;
    return api(`/admin/users/${id}?${params}`).then(
      (out) => { if (call === latest.current) setData(out); },
      (e) => { if (call === latest.current) setFailed(e.message); },
    );
  }, [id, q, from, to, badRange]);
  useEffect(() => { load(); }, [load]);

  // Filters live in the URL, so they are still there when coming back from a search or download
  const setFilters = useCallback((changes) => {
    const next = new URLSearchParams(urlQuery);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const out = next.toString();
    router.replace(out ? `${path}?${out}` : path, { scroll: false });
  }, [urlQuery, path, router]);

  useEffect(() => { setText(q); }, [q]);
  useEffect(() => {
    if (text.trim() === q) return undefined;
    const timer = setTimeout(() => setFilters({ q: text.trim() }), 300);
    return () => clearTimeout(timer);
  }, [text, q, setFilters]);

  async function change(sign) {
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1) return toast('Enter a whole number of credits (1 or more)');
    setBusy(true);
    try {
      const out = await api(`/admin/users/${id}`, { method: 'PATCH', body: { addCredits: sign * n } });
      toast(`${sign > 0 ? 'Added' : 'Took away'} ${fmt(n)} credits. They now have ${fmt(out.credits)}.`);
      setAmount('');
      await load();
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }

  const back = <Link className="link" href="/admin/users">← All users</Link>;
  if (failed) return <section className="view">{back}<div className="card empty">{failed}</div></section>;
  if (!data) return <section className="view"><div className="card empty">Loading…</div></section>;

  const { user: u, lists, individual, downloads, creditHistory, pending, found } = data;
  const admin = u.role === 'admin';
  const filtered = Boolean(q || from || to);
  const keep = urlQuery ? `?${urlQuery}` : ''; // keeps the filters when coming back
  const none = filtered ? 'Nothing found for these filters' : null;

  return (
    <section className="view">
      {back}
      <div className="card">
        <h3>{u.name || u.email} <span className={'pill' + (u.blocked ? ' due' : ' ok')}>{u.blocked ? 'Blocked' : 'Active'}</span></h3>
        <div className="meta">{u.email} · Joined {formatDateTime(u.created_at)}</div>
      </div>

      <div className="card">
        <div className="bar">
          <input className="txt" type="search" placeholder="Search saved searches, downloads and credit notes" aria-label="Search this user's data"
            style={{ flex: '1 1 260px', width: 'auto' }} value={text} onChange={(e) => setText(e.target.value)} />
          <label className="meta" htmlFor="userFrom">From</label>
          <input id="userFrom" className="txt" type="date" style={{ width: 'auto' }} max={to || undefined} value={from} onChange={(e) => setFilters({ from: e.target.value })} />
          <label className="meta" htmlFor="userTo">To</label>
          <input id="userTo" className="txt" type="date" style={{ width: 'auto' }} min={from || undefined} value={to} onChange={(e) => setFilters({ to: e.target.value })} />
          {filtered && <button className="link" type="button" onClick={() => { setText(''); setFilters({ q: '', from: '', to: '' }); }}>Clear</button>}
        </div>
        {badRange
          ? <div className="meta" role="alert" style={{ marginTop: 8 }}>The From date is after the To date. These results are not updated until you fix it.</div>
          : filtered && (
            <div className="meta" aria-live="polite" style={{ marginTop: 8 }}>
              Found: <b>{fmt(lists.length)}</b> saved {lists.length === 1 ? 'search' : 'searches'} ({fmt(found.savedPeople)} people when saved) · <b>{fmt(found.downloads)}</b> {found.downloads === 1 ? 'download' : 'downloads'} ({fmt(found.downloadedPeople)} people) · <b>{fmt(found.creditChanges)}</b> credit {found.creditChanges === 1 ? 'entry' : 'entries'}. The boxes below show all-time totals.
            </div>
          )}
      </div>

      <div className="stats">
        <div className="card stat"><div className="k">Credits left</div><div className="v">{admin ? 'Unlimited' : fmt(u.credits)}</div><div className="meta">1 credit = 1 person downloaded</div></div>
        <div className="card stat"><div className="k">Credits given</div><div className="v">{admin ? '–' : fmt(u.given)}</div><div className="meta">In total, after any taken away</div></div>
        <div className="card stat"><div className="k">People downloaded</div><div className="v">{admin ? '–' : fmt(u.downloaded)}</div><div className="meta">{admin ? 'Admin downloads are not counted' : 'Credits used so far'}</div></div>
        <div className="card stat"><div className="k">Saved searches</div><div className="v">{fmt(u.saved)}</div><div className="meta">{fmt(u.saved_people)} people when saved</div></div>
      </div>

      {!admin && (
        <div className="card">
          <h3>Change credits</h3>
          <div className="meta">
            {pending ? <>This user has a request waiting. <Link className="link" href="/admin/credits">Answer it on Credit requests</Link>.</> : 'Give more credits or take some away. The user sees the change in their credit history.'}
          </div>
          <form style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); change(1); }}>
            <input className="txt num" type="number" min={1} step={1} placeholder="Credits" aria-label="Number of credits" style={{ width: 160 }}
              value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button className="btn primary" type="submit" disabled={busy}>Add credits</button>
            <button className="btn" type="button" disabled={busy} onClick={() => change(-1)}>Take away</button>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Saved searches</h3>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Search</th><th>People when saved</th><th>Saved on</th><th /></tr></thead>
            <tbody>
              {!lists.length && !individual && <tr><td colSpan={4} className="empty">{none || 'Nothing saved yet'}</td></tr>}
              {lists.map((l) => (
                <tr key={l.id}>
                  <td><div className="co">{l.name}</div><div className="meta">{l.summary || describeQuery(l.query)}</div></td>
                  <td className="num">{fmt(l.size)}</td>
                  <td>{formatDateTime(l.created_at)}</td>
                  <td>
                    <div className="rowacts">
                      {l.query != null && <Link className="btn" href={`/admin/users/${id}/search/${l.id}${keep}`}>Open</Link>}
                      {l.kind !== 'search' && <Link className="link" href={`/admin/users/${id}/list/${l.id}${keep}`}>View people</Link>}
                    </div>
                  </td>
                </tr>
              ))}
              {individual > 0 && (
                <tr>
                  <td><div className="co">Individually saved leads</div></td>
                  <td className="num">{fmt(individual)}</td>
                  <td>–</td>
                  <td><div className="rowacts"><Link className="link" href={`/admin/users/${id}/individual/0${keep}`}>View people</Link></div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Downloads</h3>
        <div className="meta">Latest 100</div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Date</th><th>What was downloaded</th><th>People (credits used)</th><th /></tr></thead>
            <tbody>
              {!downloads.length && <tr><td colSpan={4} className="empty">{none || (admin ? 'Admin downloads are not counted' : 'No downloads yet')}</td></tr>}
              {downloads.map((d) => (
                <tr key={d.id}>
                  <td>{formatDateTime(d.created_at)}</td>
                  <td><div className="co">{downloadLabel(d.kind)}</div><div className="meta">{describeQuery(d.query)}</div></td>
                  <td className="num">{fmt(d.row_count)}</td>
                  <td>
                    <div className="rowacts">
                      {d.recorded > 0
                        ? <Link className="link" href={`/admin/users/${id}/download/${d.id}${keep}`}>View people</Link>
                        : <span className="meta">Details not available</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Credit history</h3>
        <div className="meta">Latest 100</div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Date</th><th>Credits</th><th>Status</th><th>Note</th></tr></thead>
            <tbody>
              {!creditHistory.length && <tr><td colSpan={4} className="empty">{none || 'No credit changes yet'}</td></tr>}
              {creditHistory.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td className="num">{creditChange(r)}</td>
                  <td><span className={'pill' + (STATUS[r.status]?.[1] || '')}>{STATUS[r.status]?.[0] || r.status}</span></td>
                  <td>{[r.note, r.admin_note].filter(Boolean).join(' · ') || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
