'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Pager from '@/components/Pager';
import { api } from '@/lib/api';
import { fmt, initials, sizeLabel } from '@/lib/format';

export default function CompaniesPage() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // debounce typing
  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (query) p.set('q', query);
    api('/companies?' + p).then(setData, (e) => setError(e.message));
  }, [query, page]);

  return (
    <section className="view">
      <div className="bar">
        <input className="txt narrow" placeholder="Search companies" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="spacer" />
        <div className="count">{data ? `${fmt(data.totalElements)} companies` : ''}</div>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Company</th><th>Industry</th><th># Employees</th><th>People</th><th /></tr></thead>
          <tbody>
            {error && <tr><td colSpan={5} className="empty">{error}</td></tr>}
            {data && !data.content.length && <tr><td colSpan={5} className="empty">No companies found.</td></tr>}
            {data?.content.map((c) => (
              <tr key={c.company}>
                <td><div className="person"><div className="av">{initials(c.company)}</div><span className="co">{c.company}</span></div></td>
                <td>{c.industry || '–'}</td>
                <td>{sizeLabel(c.employees)}</td>
                <td>{fmt(c.people)}</td>
                <td><Link className="link" href={`/people?q=${encodeURIComponent(c.company)}`}>View people</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </section>
  );
}
