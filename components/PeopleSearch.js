'use client';
// People search page. All filters live in the URL (?personTitles=...&city=...),
// so a search can be bookmarked or shared, and Back/Forward work.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Pager from './Pager';
import PersonCell, { EmailCell } from './PersonCell';
import { useToast } from './Toast';
import { useSession } from './Session';
import { download } from '@/lib/api';
import { compact, fmt, sizeLabel, SIZE_LABELS } from '@/lib/format';
import Num from './Num';

const MULTI = ['personTitles', 'personNotTitles', 'city', 'seniority', 'industry', 'employees'];

export default function PeopleSearch({ filters }) {
  const sp = useSearchParams();
  const spStr = sp.toString();
  const toast = useToast();
  const session = useSession();

  // Read current filters from the URL
  const state = useMemo(() => {
    const p = new URLSearchParams(spStr);
    const s = { q: p.get('q') || '', hasEmail: p.get('hasEmail') === 'true' };
    MULTI.forEach((k) => (s[k] = p.getAll(k)));
    s.sort = p.get('sortBy') ? `${p.get('sortBy')}:${p.get('sortDir') || 'asc'}` : '';
    s.pageSize = Number(p.get('pageSize')) || 25;
    return s;
  }, [spStr]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(() => new Set());
  const [qInput, setQInput] = useState(state.q);
  const [filtersOpen, setFiltersOpen] = useState(false); // phones only

  // Change the URL -> triggers a new fetch
  function update(mutate, { keepPage = false } = {}) {
    const p = new URLSearchParams(spStr);
    mutate(p);
    if (!keepPage) p.delete('page');
    const qs = p.toString();
    // Native history update: Next.js syncs useSearchParams without a server round trip
    window.history.pushState(null, '', qs ? `/people?${qs}` : '/people');
  }
  const setMulti = (p, key, values) => {
    p.delete(key);
    values.forEach((v) => p.append(key, v));
  };
  const toggle = (key, value) =>
    update((p) => {
      const cur = p.getAll(key);
      setMulti(p, key, cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]);
    });
  const addValue = (key, value) => update((p) => !p.getAll(key).includes(value) && p.append(key, value));
  const removeValue = (key, value) => update((p) => setMulti(p, key, p.getAll(key).filter((v) => v !== value)));

  // Fetch one page whenever the URL changes
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError('');
    const p = new URLSearchParams(spStr);
    if (!p.get('pageSize')) p.set('pageSize', '25');
    fetch('/api/people?' + p, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `Server returned ${r.status}`);
        setData(d);
      })
      .catch((e) => e.name !== 'AbortError' && setError(e.message))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [spStr, reload]);

  // Keep the search box in sync with the URL (e.g. after the top-bar search)
  useEffect(() => setQInput(state.q), [state.q]);
  // Debounced name/company search
  useEffect(() => {
    const v = qInput.trim();
    if (v === state.q) return;
    const t = setTimeout(() => update((p) => (v ? p.set('q', v) : p.delete('q'))), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  // A guest's saved marks come from their in-memory list
  const rows = (data?.content || []).map((r) => (session.guest ? { ...r, saved: session.saved.has(r.id) ? 1 : 0 } : r));
  const maxExport = filters.maxExportRows;
  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function toggleRow(id, on) {
    setSelected((prev) => {
      const next = new Set(prev);
      on ? next.add(id) : next.delete(id);
      return next;
    });
  }
  function togglePage(on) {
    setSelected((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  // Logged in: stored in the database. Guest: kept in memory until refresh (see Session.js).
  const guestNote = session.guest ? ' Sign in to keep it after a refresh.' : '';
  async function run(action, message) {
    try {
      const r = await action();
      toast(message(r) + guestNote);
      setSelected(new Set());
      if (!session.guest) setReload((n) => n + 1);
    } catch (e) {
      toast(e.message);
    }
  }
  const saveSelected = () =>
    run(() => session.save([...selected]), (r) => `Saved ${fmt(r.added)} new ${r.added === 1 ? 'lead' : 'leads'}.`);

  // CSV with a BOM, so Excel opens it directly with the right characters
  function downloadSelected() {
    if (selected.size > 1000) return toast('Select up to 1,000 people, or use Download all results.');
    download(`/api/people/export?ids=${[...selected].join(',')}`);
    toast(`Downloading ${fmt(selected.size)} selected people`);
  }
  function downloadAll() {
    const p = new URLSearchParams(spStr);
    ['page', 'pageSize', 'sortBy', 'sortDir'].forEach((k) => p.delete(k));
    download(`/api/people/export?${p}`);
    toast(`Downloading ${fmt(Math.min(data?.totalElements || 0, maxExport))} people`);
  }

  const chips = [
    ...(state.q ? [{ key: 'q', value: state.q, label: `"${state.q}"` }] : []),
    ...state.personTitles.map((v) => ({ key: 'personTitles', value: v, label: v })),
    ...state.personNotTitles.map((v) => ({ key: 'personNotTitles', value: v, label: 'Not: ' + v, ex: true })),
    ...['city', 'seniority', 'industry'].flatMap((k) => state[k].map((v) => ({ key: k, value: v, label: v }))),
    ...state.employees.map((v) => ({ key: 'employees', value: v, label: SIZE_LABELS[v] || v })),
    ...(state.hasEmail ? [{ key: 'hasEmail', value: 'true', label: 'Has email' }] : []),
  ];
  const removeChip = (c) =>
    c.key === 'q' || c.key === 'hasEmail' ?update((p) => p.delete(c.key)) : removeValue(c.key, c.value);

  const Checks = ({ k, items }) => (
    <div className="checks">
      {items.length === 0 && <span className="meta">No values</span>}
      {items.map((o) => (
        <label key={o.value}>
          <input type="checkbox" checked={state[k].includes(o.value)} onChange={() => toggle(k, o.value)} />{' '}
          {o.label ?? o.value}
          {o.count != null && <span className="c"><Num n={o.count} /></span>}
        </label>
      ))}
    </div>
  );
  const Count = ({ n }) => <span className="n">{n || ''}</span>;

  const titleKeyDown = (key) => (e) => {
    const v = e.target.value.trim();
    if (e.key === 'Enter' && v) {
      addValue(key, v);
      e.target.value = '';
    }
  };

  return (
    <section className="view">
      <div className="ps">
        <aside className={'filters' + (filtersOpen ? '' : ' closed')}>
          <div className="fhead">
            <h2>Filters</h2>
            <button className="link" type="button" onClick={() => update((p) => [...p.keys()].forEach((k) => p.delete(k)))}>
              Clear all
            </button>
          </div>
          <input className="txt" placeholder="Search name or company" autoComplete="off" value={qInput} onChange={(e) => setQInput(e.target.value)} />

          <details open>
            <summary>Job titles <Count n={state.personTitles.length + state.personNotTitles.length} /></summary>
            <div className="fbody">
              <label className="lbl" htmlFor="titleIn">Include (press Enter)</label>
              <input className="txt" id="titleIn" placeholder="e.g. HR Manager" list="titleList" autoComplete="off" onKeyDown={titleKeyDown('personTitles')} />
              <div className="chips">
                {state.personTitles.map((v) => (
                  <span className="chip" key={v}>{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => removeValue('personTitles', v)}>×</button></span>
                ))}
              </div>
              <label className="lbl" htmlFor="titleEx">Exclude</label>
              <input className="txt" id="titleEx" placeholder="e.g. Software Engineer" list="titleList" autoComplete="off" onKeyDown={titleKeyDown('personNotTitles')} />
              <div className="chips">
                {state.personNotTitles.map((v) => (
                  <span className="chip ex" key={v}>{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => removeValue('personNotTitles', v)}>×</button></span>
                ))}
              </div>
              <datalist id="titleList">{filters.titles.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
          </details>
          <details open>
            <summary>Location <Count n={state.city.length} /></summary>
            <div className="fbody"><Checks k="city" items={filters.city} /></div>
          </details>
          <details>
            <summary>Seniority <Count n={state.seniority.length} /></summary>
            <div className="fbody"><Checks k="seniority" items={filters.seniority} /></div>
          </details>
          <details>
            <summary>Industry <Count n={state.industry.length} /></summary>
            <div className="fbody"><Checks k="industry" items={filters.industry} /></div>
          </details>
          <details>
            <summary># Employees <Count n={state.employees.length} /></summary>
            <div className="fbody">
              <Checks k="employees" items={filters.employees.map((v) => ({ value: v, label: SIZE_LABELS[v] || v }))} />
            </div>
          </details>
          <details>
            <summary>Contact info <Count n={state.hasEmail ? 1 : 0} /></summary>
            <div className="fbody">
              <div className="checks">
                <label>
                  <input type="checkbox" checked={state.hasEmail} onChange={(e) => update((p) => (e.target.checked ? p.set('hasEmail', 'true') : p.delete('hasEmail')))} />{' '}
                  Has email
                </label>
              </div>
            </div>
          </details>
        </aside>

        <div className="results">
          <div className="bar">
            <button className="btn" id="toggleFilters" type="button" onClick={() => setFiltersOpen((o) => !o)}>
              {filtersOpen ? 'Hide filters' : 'Filters'}
            </button>
            <div className="count">
              {data ? (
                <>
                  Total <Num n={data.totalElements} />
                  <span>page {fmt(data.page)} of {fmt(data.totalPages)} · {data.tookMs} ms</span>
                </>
              ) : (
                'Loading…'
              )}
            </div>
            <div className="spacer" />
            <select
              aria-label="Sort"
              value={state.sort}
              onChange={(e) =>
                update((p) => {
                  const [f, d] = e.target.value.split(':');
                  if (f) { p.set('sortBy', f); p.set('sortDir', d); } else { p.delete('sortBy'); p.delete('sortDir'); }
                })
              }
            >
              <option value="">Sort: Default</option>
              <option value="name:asc">Name A–Z</option>
              <option value="name:desc">Name Z–A</option>
              <option value="company:asc">Company A–Z</option>
              <option value="employees:desc">Company size, largest</option>
            </select>
            <select aria-label="Rows per page" value={state.pageSize} onChange={(e) => update((p) => p.set('pageSize', e.target.value))}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="bar actions">
            <span className="meta">{fmt(selected.size)} selected</span>
            <button className="btn" type="button" disabled={!selected.size} onClick={saveSelected}>Save to list</button>
            <button className="btn" type="button" disabled={!selected.size} onClick={downloadSelected}>Download selected</button>
            <div className="spacer" />
            <button className="btn primary" type="button" disabled={!data?.totalElements} onClick={downloadAll}>
              {data && data.totalElements > maxExport ? `Download first ${compact(maxExport)}` : `Download all ${compact(data?.totalElements)}`}
            </button>
          </div>

          {chips.length > 0 && (
            <div className="active">
              {chips.map((c) => (
                <span key={c.key + c.value} className={'chip' + (c.ex ? ' ex' : '')}>
                  {c.label}
                  <button type="button" aria-label={`Remove ${c.label}`} onClick={() => removeChip(c)}>×</button>
                </span>
              ))}
            </div>
          )}

          <div className={'tablewrap' + (loading ? ' loading' : '')}>
            <table>
              <thead>
                <tr>
                  <th className="cb"><input type="checkbox" aria-label="Select this page" checked={allOnPage} onChange={(e) => togglePage(e.target.checked)} /></th>
                  <th>Name</th><th>Company</th><th>Location</th><th>Seniority</th><th>Email</th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr><td colSpan={6} className="empty">Could not load people: {error}</td></tr>
                ) : data && !rows.length ? (
                  <tr><td colSpan={6} className="empty">No people match these filters. Remove a filter or widen the job titles.</td></tr>
                ) : (
                  rows.map((p) => (
                    <tr key={p.id}>
                      <td><input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.has(p.id)} onChange={(e) => toggleRow(p.id, e.target.checked)} /></td>
                      <td><PersonCell person={p} showSaved /></td>
                      <td>
                        <div className="co">{p.company || '–'}</div>
                        <div className="meta">{p.industry ? `${p.industry} · ` : ''}{sizeLabel(p.employees)}</div>
                      </td>
                      <td>{p.city || '–'}</td>
                      <td>{p.seniority ? <span className="pill">{p.seniority}</span> : '–'}</td>
                      <td><EmailCell email={p.email} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data && (
            <Pager
              page={data.page}
              totalPages={data.totalPages}
              onPage={(n) => {
                update((p) => p.set('page', String(n)), { keepPage: true });
                window.scrollTo({ top: 0 });
              }}
            />
          )}
          <div className="api"><b>GET</b> /api/people?{decodeURIComponent(spStr) || 'page=1&pageSize=25'}</div>
        </div>
      </div>
    </section>
  );
}
