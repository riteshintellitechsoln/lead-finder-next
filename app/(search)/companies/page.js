'use client';
// Company search with its own filters. The URL keys are the same as on the
// people page (industry, employees, revenue, tech, company / domain lists...),
// so "View people" carries the company filters over.
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Pager from '@/components/Pager';
import { useFetch } from '@/lib/api';
import { fmt, initials, revenueLabel, sizeLabel, REVENUE_LABELS, SIZE_LABELS } from '@/lib/format';
import { LISTS } from '@/lib/filters';
import Num from '@/components/Num';
import FacetChecks from '@/components/filters/FacetChecks';
import ListFilter from '@/components/filters/ListFilter';
import { useUrlFilters } from '@/components/filters/useUrlFilters';

// Company filters that mean the same for people (location is the company's here, the person's there)
const PEOPLE_KEYS = ['company', 'companyNot', 'companyList', 'companyNotList', 'domain', 'domainNot', 'domainList', 'domainNotList',
  'industry', 'employees', 'revenue', 'tech', 'techNot'];
const COUNTED = [...PEOPLE_KEYS, 'country', 'state', 'city'];

export default function CompaniesPage() {
  return (
    <Suspense fallback={<section className="view"><div className="meta">Loading…</div></section>}>
      <Companies />
    </Suspense>
  );
}

function Companies() {
  const url = useUrlFilters('/companies');
  const { spStr, state, toggle, setSingle, update } = url;
  const [q, setQ] = useState(state.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [techMode, setTechMode] = useState('tech');
  const sort = state.sort || 'people';

  useEffect(() => setQ(state.q), [state.q]);
  useEffect(() => {
    const v = q.trim();
    if (v === state.q) return;
    const t = setTimeout(() => setSingle('q', v), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const { data, error, loading } = useFetch(`/api/companies?${spStr}${spStr ? '&' : ''}pageSize=25`);
  const options = useFetch('/api/filters').data;

  const [newLists, setNewLists] = useState({});
  const unknown = LISTS.flatMap((k) => state[k]).filter((id) => !newLists[id]);
  const listsFetch = useFetch(unknown.length ? `/api/lists?ids=${unknown.join(',')}` : null);
  const lists = { ...Object.fromEntries((Array.isArray(listsFetch.data) ? listsFetch.data : []).map((l) => [l.id, l])), ...newLists };
  const box = { state, url, lists, onListCreated: (l) => setNewLists((m) => ({ ...m, [l.id]: l })) };

  // Static options (people counts over all data), filtered in the browser
  const opts = (k, labels) => (options?.[k] || []).map((o) => (typeof o === 'string'
    ? { value: o, label: labels?.[o] || o, count: null }
    : { value: o.value, label: labels?.[o.value] || o.value, count: null }));
  const checks = (k, extra = {}) => <FacetChecks k={k} items={opts(k, extra.labels)} selected={state[k]} onToggle={toggle} {...extra} />;
  const n = (...keys) => keys.reduce((a, k) => a + state[k].length, 0);
  const Count = ({ n: c }) => <span className="n">{c || ''}</span>;

  const peopleQs = new URLSearchParams();
  PEOPLE_KEYS.forEach((k) => state[k].forEach((v) => peopleQs.append(k, v)));
  const active = n(...COUNTED) + (state.q ? 1 : 0);

  return (
    <section className="view">
      <div className="ps">
        <aside className={'filters' + (filtersOpen ? '' : ' closed')}>
          <div className="fhead">
            <h2>Company filters</h2>
            <button className="link" type="button" onClick={url.clearAll}>Clear all</button>
          </div>
          <input className="txt" placeholder="Search company or domain" aria-label="Search company or domain" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          <details open>
            <summary>Company name <Count n={n('company', 'companyNot', 'companyList', 'companyNotList')} /></summary>
            <div className="fbody">
              <ListFilter kind="company" {...box} placeholder="Type a name, or upload a list"
                suggest={(t) => `/api/companies?q=${encodeURIComponent(t)}&pageSize=8`} hint="One per line; any size file" />
            </div>
          </details>
          <details open={n('domain', 'domainNot', 'domainList', 'domainNotList') > 0}>
            <summary>Company domain <Count n={n('domain', 'domainNot', 'domainList', 'domainNotList')} /></summary>
            <div className="fbody">
              <ListFilter kind="domain" {...box} placeholder="e.g. infosys.com" hint="Websites work too" />
            </div>
          </details>
          <details>
            <summary>Industry <Count n={n('industry')} /></summary>
            <div className="fbody">{checks('industry', { localSearch: true, placeholder: 'Search industry…' })}</div>
          </details>
          <details>
            <summary>Company headcount <Count n={n('employees')} /></summary>
            <div className="fbody">{checks('employees', { labels: SIZE_LABELS })}</div>
          </details>
          <details>
            <summary>Revenue <Count n={n('revenue')} /></summary>
            <div className="fbody">{checks('revenue', { labels: REVENUE_LABELS })}<span className="meta">Annual revenue in USD</span></div>
          </details>
          <details>
            <summary>Location <Count n={n('country', 'state', 'city')} /></summary>
            <div className="fbody">
              <div className="lbl">Country</div>
              {checks('country', { localSearch: true, limit: 5, placeholder: 'Search country…' })}
              <div className="lbl">State</div>
              {checks('state', { localSearch: true, limit: 5, placeholder: 'Search state…' })}
              <div className="lbl">City</div>
              {checks('city', { localSearch: true, limit: 5, placeholder: 'Search city…' })}
              <span className="meta">Where most of the company&apos;s people are</span>
            </div>
          </details>
          <details open={n('tech', 'techNot') > 0}>
            <summary>Install base <Count n={n('tech', 'techNot')} /></summary>
            <div className="fbody">
              <div className="seg" role="tablist" aria-label="Technologies: include or exclude">
                <button type="button" role="tab" aria-selected={techMode === 'tech'} className={techMode === 'tech' ? 'on' : ''} onClick={() => setTechMode('tech')}>
                  Uses{state.tech.length ? ` (${state.tech.length})` : ''}
                </button>
                <button type="button" role="tab" aria-selected={techMode === 'techNot'} className={techMode === 'techNot' ? 'on ex' : ''} onClick={() => setTechMode('techNot')}>
                  Does not use{state.techNot.length ? ` (${state.techNot.length})` : ''}
                </button>
              </div>
              <FacetChecks key={techMode} k={techMode} facet="tech" items={(options?.tech || []).map((o) => ({ value: o.value, count: null }))}
                selected={state[techMode]} onToggle={toggle} searchable placeholder="Search technology…" exclude={techMode === 'techNot'} />
            </div>
          </details>
        </aside>

        <div className="results">
          <div className="bar">
            <button className="btn" id="toggleFilters" type="button" onClick={() => setFiltersOpen((o) => !o)}>
              {filtersOpen ? 'Hide filters' : `Filters${active ? ` (${active})` : ''}`}
            </button>
            <div className="count">{data ? <>Total <Num n={data.totalElements} /> companies<span>{loading ? 'updating…' : ''}</span></> : 'Loading…'}</div>
            <div className="spacer" />
            {peopleQs.toString() && <Link className="btn primary" href={`/people?${peopleQs}`}>View people at these companies</Link>}
            <select aria-label="Sort companies" value={sort} onChange={(e) => update((p) => (e.target.value === 'people' ? p.delete('sort') : p.set('sort', e.target.value)))}>
              <option value="people">Most people</option>
              <option value="name">Name A–Z</option>
              <option value="employees">Largest</option>
              <option value="revenue">Highest revenue</option>
            </select>
          </div>
          <div className={'pagebar' + (loading ? ' on' : '')} aria-hidden="true" />
          <div className={'tablewrap' + (loading ? ' loading' : '')}>
            <table>
              <thead><tr><th>Company</th><th>Industry</th><th># Employees</th><th>Revenue</th><th>Location</th><th>Install base</th><th>People</th><th /></tr></thead>
              <tbody>
                {error && <tr><td colSpan={8} className="empty">{error}</td></tr>}
                {data && !data.content.length && <tr><td colSpan={8} className="empty">No companies match these filters.</td></tr>}
                {data?.content.map((c) => (
                  <tr key={c.company}>
                    <td>
                      <div className="person">
                        <div className="av">{initials(c.company)}</div>
                        <div><div className="co">{c.company}</div>{c.domain && <div className="meta dom">{c.domain}</div>}</div>
                      </div>
                    </td>
                    <td>{c.industry || '–'}</td>
                    <td>{sizeLabel(c.employees)}</td>
                    <td>{revenueLabel(c.revenue) || '–'}</td>
                    <td>{[c.city, c.state].filter(Boolean).join(', ') || '–'}{c.country && <div className="meta">{c.country}</div>}</td>
                    <td className="techs">
                      {(c.techs || []).slice(0, 3).map((t) => <span key={t} className="pill">{t}</span>)}
                      {(c.techs || []).length > 3 && <span className="meta" title={c.techs.join(', ')}> +{c.techs.length - 3}</span>}
                    </td>
                    <td>{fmt(c.people)}</td>
                    <td><Link className="link" href={`/people?company=${encodeURIComponent(c.company)}`}>View people</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && <Pager page={data.page} totalPages={data.totalPages} onPage={(pg) => update((p) => p.set('page', String(pg)), { keepPage: true })} />}
        </div>
      </div>
    </section>
  );
}
