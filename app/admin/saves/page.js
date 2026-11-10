'use client';
// Admin: what every user saved, in one place. Look only: Open shows the people, nothing can be changed.
// Filters live in the URL: /admin/saves?q=pune&user=2&type=search&from=2026-11-01&to=2026-11-10
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useFetch } from '@/lib/api';
import { fmt, formatDateTime } from '@/lib/format';

const TYPES = { search: 'Saved search', list: 'Save all (people kept)', individual: 'Saved one by one' };

// A date from the date box -> the start of that day (+ days) on this computer, in UTC like the database
function dayStart(day, plus = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const t = new Date(`${day}T00:00`);
  t.setDate(t.getDate() + plus);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString().slice(0, 19).replace('T', ' ');
}

export default function Page() {
  return <Suspense fallback={<section className="view"><div className="card empty">Loading…</div></section>}><AdminSavesPage /></Suspense>;
}

function AdminSavesPage() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const q = sp.get('q') || '';
  const user = sp.get('user') || '';
  const type = TYPES[sp.get('type')] ? sp.get('type') : '';
  const from = sp.get('from') || '';
  const to = sp.get('to') || '';
  const badRange = Boolean(from && to && from > to);
  const [text, setText] = useState(q);

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (user) params.set('user', user);
  if (type) params.set('type', type);
  if (dayStart(from)) params.set('from', dayStart(from));
  if (dayStart(to, 1)) params.set('to', dayStart(to, 1));
  const { data, error, loading, retry } = useFetch(badRange ? null : `/api/admin/saves?${params}`);

  function setFilters(changes) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    const qs = next.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }

  // Search as you type, a moment after the last key
  useEffect(() => {
    if (text.trim() === q) return undefined;
    const t = setTimeout(() => setFilters({ q: text.trim() }), 300);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setText(q); }, [q]);

  const filtered = Boolean(q || user || type || from || to);
  const clear = () => { setText(''); router.replace(path, { scroll: false }); };
  // The people page's Back link returns here with the same filters
  const back = `?back=${encodeURIComponent(sp.toString() ? `${path}?${sp}` : path)}`;
  const openHref = (r) => {
    if (r.type === 'individual') return `/admin/users/${r.user_id}/individual/0${back}`;
    return `/admin/users/${r.user_id}/${r.query != null ? 'search' : 'list'}/${r.id}${back}`;
  };

  return (
    <section className="view">
      <div className="card">
        <form className="savefilters" role="search" onSubmit={(e) => { e.preventDefault(); setFilters({ q: text.trim() }); }}>
          <input className="txt grow" type="search" placeholder="Search by user name, email, search name or filters (e.g. Pune, HR Manager)"
            aria-label="Search saves" value={text} onChange={(e) => setText(e.target.value)} />
          <select className="txt" aria-label="User" value={user} onChange={(e) => setFilters({ user: e.target.value })}>
            <option value="">All users</option>
            {(data?.users || []).map((u) => <option key={u.id} value={u.id}>{u.name ? `${u.name} (${u.email})` : u.email}</option>)}
          </select>
          <select className="txt" aria-label="Type" value={type} onChange={(e) => setFilters({ type: e.target.value })}>
            <option value="">All types</option>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="lbl" htmlFor="saveFrom">From</label>
          <input id="saveFrom" className="txt" type="date" max={to || undefined} value={from} onChange={(e) => setFilters({ from: e.target.value })} />
          <label className="lbl" htmlFor="saveTo">To</label>
          <input id="saveTo" className="txt" type="date" min={from || undefined} value={to} onChange={(e) => setFilters({ to: e.target.value })} />
          {filtered && <button className="link" type="button" onClick={clear}>Clear</button>}
        </form>
        {badRange && <div className="meta" role="alert">The From date is after the To date.</div>}
      </div>

      {data && (
        <div className="stats">
          <div className="card stat"><div className="k">Saves</div><div className="v">{fmt(data.found.saves)}</div><div className="meta">{filtered ? 'matching the filters' : 'by all users'}</div></div>
          <div className="card stat"><div className="k">People in them</div><div className="v">{fmt(data.found.people)}</div><div className="meta">when saved</div></div>
          <div className="card stat"><div className="k">Users</div><div className="v">{fmt(data.found.users)}</div><div className="meta">who saved something</div></div>
        </div>
      )}

      <div className="card">
        <h3>Users&apos; saves</h3>
        <div className="meta">Open shows the people only. Nothing can be changed or downloaded from here.</div>
        {error && <div role="alert">Could not load: {error} <button className="link" type="button" onClick={retry}>Try again</button></div>}
        <div className="tablewrap" style={{ opacity: loading && data ? 0.6 : 1 }}>
          <table>
            <thead><tr><th>User</th><th>What was saved</th><th>Type</th><th className="num">People</th><th>Saved on</th><th /></tr></thead>
            <tbody>
              {!data && !error && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
              {data && !data.rows.length && <tr><td colSpan={6} className="empty">{filtered ? 'Nothing matches these filters' : 'No user has saved anything yet'}</td></tr>}
              {data?.rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <Link className="co link" href={`/admin/users/${r.user_id}`}>{r.user_name || r.email}</Link>
                    {r.user_name && <div className="meta">{r.email}</div>}
                  </td>
                  <td><div className="co">{r.name}</div>{(r.summary || r.filters) && <div className="meta">{r.summary || r.filters}</div>}</td>
                  <td><span className="pill">{TYPES[r.type]}</span></td>
                  <td className="num">{fmt(r.size)}</td>
                  <td>{r.type === 'individual' ? <>Latest: {formatDateTime(r.created_at)}</> : formatDateTime(r.created_at)}</td>
                  <td><div className="rowacts"><Link className="btn" href={openHref(r)}>Open</Link></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.found.saves > data.rows.length && (
          <div className="meta">Showing the newest {fmt(data.rows.length)} of {fmt(data.found.saves)}. Use the filters to find older ones.</div>
        )}
      </div>
    </section>
  );
}
