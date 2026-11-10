'use client';
// Read only: the people in one user's saved search, saved list or download.
// The admin only looks here: they can search inside it and pick dates, but the user's
// saved filters stay as they are, and there is no download, edit or save.
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Pager from '@/components/Pager';
import PersonCell, { ContactCell } from '@/components/PersonCell';
import { api } from '@/lib/api';
import { describeQuery } from '@/lib/filters';
import { fmt, formatDateTime, revenueLabel, sizeLabel } from '@/lib/format';

export default function Page() {
  return <Suspense fallback={<section className="view"><div className="card empty">Loading…</div></section>}><AdminUserRecordsPage /></Suspense>;
}

function AdminUserRecordsPage() {
  const { id, source, ref } = useParams();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const urlQuery = sp.toString();
  // find / vfrom / vto belong to this page. q / from / to are the user page's filters, kept for "Back".
  const find = sp.get('find') || '';
  const vfrom = sp.get('vfrom') || '';
  const vto = sp.get('vto') || '';
  const badRange = Boolean(vfrom && vto && vfrom > vto);
  const filtered = Boolean(find || vfrom || vto);
  const [text, setText] = useState(find);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // Only the latest answer counts when filters change quickly
  const latest = useRef(0);
  useEffect(() => {
    if (badRange) return;
    const params = new URLSearchParams({ source, ref, page: String(page) });
    if (find) params.set('q', find);
    if (vfrom) params.set('verifiedFrom', vfrom);
    if (vto) params.set('verifiedTo', vto);
    const call = ++latest.current;
    api(`/admin/users/${id}/people?${params}`).then(
      (out) => { if (call === latest.current) setData(out); },
      (e) => { if (call === latest.current) setError(e.message); },
    );
  }, [id, source, ref, page, find, vfrom, vto, badRange]);

  const setFilters = useCallback((changes) => {
    const next = new URLSearchParams(urlQuery);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setPage(1);
    const out = next.toString();
    router.replace(out ? `${path}?${out}` : path, { scroll: false });
  }, [urlQuery, path, router]);

  useEffect(() => { setText(find); }, [find]);
  useEffect(() => {
    if (text.trim() === find) return undefined;
    const timer = setTimeout(() => setFilters({ find: text.trim() }), 300);
    return () => clearTimeout(timer);
  }, [text, find, setFilters]);

  // Opened from "Users' saves": back=/admin/saves?... goes back there with its filters
  const fromSaves = (sp.get('back') || '').startsWith('/admin/saves') ? sp.get('back') : '';
  const backParams = new URLSearchParams(urlQuery);
  ['find', 'vfrom', 'vto', 'back'].forEach((k) => backParams.delete(k));
  const backQuery = backParams.toString();
  const back = fromSaves
    ? <Link className="link" href={fromSaves}>← Back to users&apos; saves</Link>
    : <Link className="link" href={`/admin/users/${id}${backQuery ? `?${backQuery}` : ''}`}>← Back to user</Link>;
  if (error) return <section className="view">{back}<div className="card empty">{error}</div></section>;
  if (!data) return <section className="view"><div className="card empty">Loading…</div></section>;

  const { user, info, totalElements } = data;
  const isSearch = source === 'search';
  const title = source === 'download' ? 'Download' : source === 'individual' ? 'Individually saved leads' : info.name;
  const about = source === 'list' ? info.summary || describeQuery(info.query) : source === 'download' ? describeQuery(info.query) : '';
  const filters = isSearch ? describeQuery(info.query).split(' · ').filter(Boolean) : [];
  const missing = source === 'download' && !filtered ? info.row_count - totalElements : 0;

  return (
    <section className="view">
      {back}
      <div className="card">
        <div className="bar">
          <input className="txt" type="search" placeholder="Search by person or company name" aria-label="Search by person or company name"
            style={{ flex: '1 1 260px', width: 'auto' }} value={text} onChange={(e) => setText(e.target.value)} />
          <span className="meta">Updated on</span>
          <label className="meta" htmlFor="verFrom">From</label>
          <input id="verFrom" className="txt" type="date" style={{ width: 'auto' }} max={vto || undefined} value={vfrom} onChange={(e) => setFilters({ vfrom: e.target.value })} />
          <label className="meta" htmlFor="verTo">To</label>
          <input id="verTo" className="txt" type="date" style={{ width: 'auto' }} min={vfrom || undefined} value={vto} onChange={(e) => setFilters({ vto: e.target.value })} />
          {filtered && <button className="link" type="button" onClick={() => { setText(''); setFilters({ find: '', vfrom: '', vto: '' }); }}>Clear</button>}
        </div>
        {badRange && <div className="meta" role="alert" style={{ marginTop: 8 }}>The From date is after the To date. These results are not updated until you fix it.</div>}
      </div>
      <div className="card">
        <h3>{title}</h3>
        <div className="meta">{user.name || user.email}{info.created_at && <> · {formatDateTime(info.created_at)}</>}</div>
        {about && <div className="meta">{about}</div>}
        {isSearch && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
            {filters.length ? filters.map((t) => <span key={t} className="pill">{t}</span>) : <span className="meta">No filters</span>}
          </div>
        )}
        <div className="meta">
          <b>{fmt(totalElements)}</b> people{filtered && ' match your search'}{source === 'download' && <> of {fmt(info.row_count)} downloaded</>}
          {isSearch && info.result_count != null && <>{filtered ? ' · ' : ' now · '}{fmt(info.result_count)} when saved</>}
        </div>
        {missing > 0 && <div className="meta">{fmt(missing)} can no longer be shown: they were deleted, the data was replaced, or this download is from before downloads were recorded.</div>}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Company</th><th>Location</th><th>Seniority</th><th>Contact</th></tr></thead>
          <tbody>
            {!data.content.length && <tr><td colSpan={5} className="empty">{filtered ? 'No people match your search.' : 'No people to show.'}</td></tr>}
            {data.content.map((p) => (
              <tr key={p.id}>
                <td><PersonCell person={p} /></td>
                <td data-l="Company">
                  <div className="co">{p.company || '–'}</div>
                  {p.domain && <div className="meta dom">{p.domain}</div>}
                  <div className="meta">{[p.industry, p.employees != null && sizeLabel(p.employees), revenueLabel(p.revenue)].filter(Boolean).join(' · ')}</div>
                </td>
                <td data-l="Location">
                  {[p.city, p.state].filter(Boolean).join(', ') || '–'}
                  {(p.zip || p.country) && <div className="meta">{[p.zip, p.country].filter(Boolean).join(' · ')}</div>}
                </td>
                <td data-l="Seniority">
                  {p.seniority ? <span className="pill">{p.seniority}</span> : '–'}
                  {p.department && <div className="meta">{p.department}</div>}
                </td>
                <td data-l="Contact"><ContactCell person={p} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} totalPages={data.totalPages} onPage={setPage} />
    </section>
  );
}
