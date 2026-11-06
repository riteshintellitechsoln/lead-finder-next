'use client';
// People search page. All filters live in the URL (?personTitles=...&city=...),
// so a search can be bookmarked or shared, and Back/Forward work.
// Every filter option shows a live count (from /api/people/facets) that
// respects the other active filters, like Apollo. Big include / exclude lists
// (company names, domains, emails, titles, zip codes) are uploaded once and
// referenced by id (see components/filters/ListFilter.js).
import { useEffect, useState } from 'react';
import Pager from './Pager';
import PersonCell, { ContactCell } from './PersonCell';
import { useToast } from './Toast';
import { useSession } from './Session';
import { useFetch } from '@/lib/api';
import { useCredits } from './Credits';
import DownloadDialog from './DownloadDialog';
import { compact, fmt, revenueLabel, sizeLabel, REVENUE_LABELS, SIZE_LABELS } from '@/lib/format';
import { LISTS } from '@/lib/filters';
import Num from './Num';
import FacetChecks from './filters/FacetChecks';
import ListFilter from './filters/ListFilter';
import { useUrlFilters } from './filters/useUrlFilters';

const SORTABLE = [['name', 'Name'], ['company', 'Company'], ['city', 'Location'], ['seniority', 'Seniority']];

// Active filter chips above the results: [URL key, label prefix, excluded?, value -> label]
const CHIP_DEFS = [
  ['personTitles', ''], ['personNotTitles', 'Not: ', true],
  ['titleList', 'Titles: '], ['titleNotList', 'Not titles: ', true],
  ['department', ''], ['seniority', ''],
  ['company', 'Company: '], ['companyNot', 'Not company: ', true],
  ['companyList', 'Companies: '], ['companyNotList', 'Not companies: ', true],
  ['domain', 'Domain: '], ['domainNot', 'Not domain: ', true],
  ['domainList', 'Domains: '], ['domainNotList', 'Not domains: ', true],
  ['industry', ''],
  ['zip', 'Zip: '], ['zipNot', 'Not zip: ', true], ['zipList', 'Zips: '], ['zipNotList', 'Not zips: ', true],
  ['country', ''], ['state', ''], ['county', 'County: '], ['city', ''],
  ['employees', 'Headcount: ', false, (v) => SIZE_LABELS[v] || v],
  ['revenue', 'Revenue: ', false, (v) => REVENUE_LABELS[v] || v],
  ['tech', 'Uses: '], ['techNot', 'Not using: ', true],
  ['email', 'Email: '], ['emailNot', 'Not email: ', true],
  ['emailList', 'Emails: '], ['emailNotList', 'Not emails: ', true],
  ['emailStatus', 'Email: '],
];
const BOOL_LABELS = {
  hasEmail: ['Email', 'Has email', 'No email'],
  hasPhone: ['Phone', 'Has phone', 'No phone'],
  hasDirect: ['Direct phone', 'Has direct phone', 'No direct phone'],
};
const VERIFIED_PRESETS = [[30, 'Last 30 days'], [90, 'Last 3 months'], [180, 'Last 6 months'], [365, 'Last 12 months']];
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export default function PeopleSearch({ filters: options }) {
  const url = useUrlFilters('/people');
  const { spStr, state, filterQs, update, toggle, removeValue, setSingle } = url;
  const toast = useToast();
  const session = useSession();

  const [reload, setReload] = useState(0);
  const resultsUrl = `/api/people?${spStr || 'pageSize=25'}${reload ? `&_r=${reload}` : ''}`;
  // Old results stay on screen (dimmed) while new ones load; changing filters
  // again aborts the previous request, on the server too.
  const { data, error, loading, retry } = useFetch(resultsUrl);
  const facetFetch = useFetch(`/api/people/facets?${filterQs}`, { debounce: 120 });
  const facets = facetFetch.data?.facets;

  // Names and sizes of the uploaded lists in the URL
  const [newLists, setNewLists] = useState({});
  const listIds = LISTS.flatMap((k) => state[k]);
  const unknown = listIds.filter((id) => !newLists[id]);
  const listsFetch = useFetch(unknown.length ? `/api/lists?ids=${unknown.join(',')}` : null);
  const lists = { ...Object.fromEntries((Array.isArray(listsFetch.data) ? listsFetch.data : []).map((l) => [l.id, l])), ...newLists };
  const onListCreated = (l) => setNewLists((m) => ({ ...m, [l.id]: l }));

  const [selected, setSelected] = useState(() => new Set());
  // "Select all": the filters it was pressed for. New filters turn it off by themselves.
  const [allFor, setAllFor] = useState(null);
  const allSelected = allFor !== null && allFor === filterQs;
  const [savingAll, setSavingAll] = useState(false);
  const [qInput, setQInput] = useState(state.q);
  const [filtersOpen, setFiltersOpen] = useState(false); // phones only
  const [techMode, setTechMode] = useState('tech'); // 'tech' (include) or 'techNot'

  const setSort = (sortBy, sortDir) => update((p) => {
    if (sortBy) { p.set('sortBy', sortBy); if (sortDir === 'desc') p.set('sortDir', 'desc'); else p.delete('sortDir'); } else { p.delete('sortBy'); p.delete('sortDir'); }
  });

  // Keep the search box in sync with the URL (e.g. after the top-bar search)
  useEffect(() => setQInput(state.q), [state.q]);
  // Debounced name/company search
  useEffect(() => {
    const v = qInput.trim();
    if (v === state.q) return;
    const t = setTimeout(() => setSingle('q', v), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  // A guest's saved marks come from their in-memory list
  const rows = (data?.content || []).map((r) => (session.guest ? { ...r, saved: session.saved.has(r.id) ? 1 : 0 } : r));
  const [downloading, setDownloading] = useState(null); // the download window, when open
  const maxExport = options?.maxExportRows || 100000;
  const myCredits = useCredits(!session.guest);
  const limited = myCredits && !myCredits.unlimited;
  const total = data?.totalElements || 0;
  // What "Download all" will really give: capped by the export limit and by my credits
  const downloadable = Math.min(total, maxExport, limited ? myCredits.credits : Infinity);
  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && (allSelected || pageIds.every((id) => selected.has(id)));
  const selectedCount = allSelected ? Math.min(total, maxExport) : selected.size;
  function clearSelection() {
    setAllFor(null);
    setSelected(new Set());
  }

  function toggleRow(id, on) {
    if (allSelected) {
      // One person taken out: back to picking by hand, starting with this page
      setAllFor(null);
      setSelected(new Set(pageIds.filter((x) => x !== id)));
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      on ? next.add(id) : next.delete(id);
      return next;
    });
  }
  function togglePage(on) {
    if (allSelected) return clearSelection();
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
      clearSelection();
      if (!session.guest) setReload((n) => n + 1);
    } catch (e) {
      toast(e.message);
    }
  }
  // Keeps the current filters under a name. Opening it from Saved searches comes back here with them applied.
  async function saveCurrentSearch() {
    if (session.guest) return toast('Sign in to save a search.');
    const summary = chips.map((c) => c.label).join(', ');
    const suggested = summary.slice(0, 80);
    const name = window.prompt('Name for this saved search:', suggested);
    if (name === null) return;
    const p = new URLSearchParams(spStr);
    ['page', 'pageSize'].forEach((k) => p.delete(k));
    try {
      const r = await session.saveFilters(p.toString(), name.trim() || suggested, summary);
      toast(`Saved search "${r.name}". Open it any time from Saved searches.`);
    } catch (e) {
      toast(e.message);
    }
  }

  async function saveAll() {
    if (session.guest) return toast('Sign in to save all results.');
    const total = data?.totalElements || 0;
    if (total > maxExport && !window.confirm(`This search has ${fmt(total)} people. Only the first ${fmt(maxExport)} can be saved at once. Continue?`)) return;
    // All results go into ONE named list, shown in Saved searches
    const summary = chips.map((c) => c.label).join(', ');
    const suggested = (summary || 'All people').slice(0, 80);
    const name = window.prompt(`Name for this saved list (${fmt(Math.min(total, maxExport))} leads):`, suggested);
    if (name === null) return;
    const p = new URLSearchParams(spStr);
    ['page', 'pageSize'].forEach((k) => p.delete(k));
    setSavingAll(true);
    await run(() => session.saveSearch(p.toString(), name.trim() || suggested, summary),
      (r) => `Saved ${fmt(r.added)} ${r.added === 1 ? 'lead' : 'leads'} as "${r.name}". Open it from Saved searches.`);
    setSavingAll(false);
  }

  // CSV with a BOM, so Excel opens it directly with the right characters
  // Both open the download window first. Users pay 1 credit per person.
  function downloadSelected() {
    if (allSelected) {
      const p = new URLSearchParams(spStr);
      ['page', 'pageSize'].forEach((k) => p.delete(k));
      const q = p.toString();
      return setDownloading({ url: `/api/people/export${q ? `?${q}` : ''}`, what: 'your selection', partial: false });
    }
    if (selected.size > 1000) return toast('Select up to 1,000 people, or use Download all results.');
    setDownloading({ url: `/api/people/export?ids=${[...selected].join(',')}`, what: 'your selection', partial: false });
  }
  function downloadAll() {
    const p = new URLSearchParams(spStr);
    ['page', 'pageSize'].forEach((k) => p.delete(k));
    const q = p.toString();
    setDownloading({ url: `/api/people/export${q ? `?${q}` : ''}`, what: 'these results', partial: true });
  }

  const chips = [
    ...(state.q ? [{ key: 'q', value: state.q, label: `"${state.q}"`, single: true }] : []),
    ...CHIP_DEFS.flatMap(([key, prefix, ex, label]) => state[key].map((v) => ({
      key, value: v, ex, label: prefix + (LISTS.includes(key) ? (lists[v]?.name || 'uploaded list') : label ? label(v) : v),
    }))),
    ...Object.entries(BOOL_LABELS).filter(([k]) => state[k]).map(([k, [, yes, no]]) => ({ key: k, value: state[k], label: state[k] === 'true' ? yes : no, single: true })),
    ...(state.verifiedFrom ? [{ key: 'verifiedFrom', value: state.verifiedFrom, label: `Verified from ${state.verifiedFrom}`, single: true }] : []),
    ...(state.verifiedTo ? [{ key: 'verifiedTo', value: state.verifiedTo, label: `Verified up to ${state.verifiedTo}`, single: true }] : []),
  ];
  const removeChip = (c) => (c.single ? setSingle(c.key, '') : removeValue(c.key, c.value));

  // Option counts: live facets when ready, else the overall options from the page load
  const fallback = (k) => (options?.[k] || []).map((o) => (typeof o === 'string' ? { value: o } : { value: o.value, count: undefined }));
  const listFor = (k, labels) => {
    const list = facets?.[k] || fallback(k);
    return labels ? list.map((o) => ({ ...o, label: labels[o.value] || o.value })) : list;
  };
  const titleCounts = facets?.title?.chips || {};
  const n = (...keys) => keys.reduce((a, k) => a + (Array.isArray(state[k]) ? state[k].length : state[k] ? 1 : 0), 0);

  const Count = ({ n: c }) => <span className="n">{c || ''}</span>;
  const box = { state, url, lists, onListCreated };
  const checks = (k, extra = {}) => <FacetChecks k={k} items={listFor(k)} selected={state[k]} onToggle={toggle} filterQs={filterQs} {...extra} />;

  const sortHeader = (key, label) => {
    const on = state.sortBy === key;
    const next = on && state.sortDir === 'asc' ? 'desc' : 'asc';
    return (
      <th key={key} aria-sort={on ? (state.sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}>
        <button type="button" className={'sorth' + (on ? ' on' : '')} onClick={() => setSort(key, next)}>
          {label} <span aria-hidden="true">{on ? (state.sortDir === 'desc' ? '▼' : '▲') : '↕'}</span>
        </button>
      </th>
    );
  };

  return (
    <section className="view">
      <div className="ps">
        <aside className={'filters' + (filtersOpen ? '' : ' closed') + (facetFetch.loading ? ' counting' : '')}>
          <div className="fhead">
            <h2>Filters</h2>
            <button className="link" type="button" onClick={url.clearAll}>Clear all</button>
          </div>
          <input className="txt" placeholder="Search name or company" aria-label="Search name or company" autoComplete="off" value={qInput} onChange={(e) => setQInput(e.target.value)} />

          <details open>
            <summary>Email list <Count n={n('email', 'emailNot', 'emailList', 'emailNotList')} /></summary>
            <div className="fbody">
              <ListFilter kind="email" {...box} placeholder="name@company.com" hint="Exclude people you already have" />
            </div>
          </details>
          <details open>
            <summary>Job titles <Count n={n('personTitles', 'personNotTitles', 'titleList', 'titleNotList')} /></summary>
            <div className="fbody">
              <ListFilter kind="title" {...box} placeholder="e.g. HR Manager, Recruiter" suggestions={options?.titles}
                chipCount={(v) => titleCounts[v.toLowerCase()]} hint="Paste many: comma or one per line" />
              {facets?.title?.options?.length > 0 && (
                <>
                  <div className="lbl">Top titles here</div>
                  <div className="checks">
                    {facets.title.options.slice(0, 10).map((o) => (
                      <button key={o.value} type="button" className="optbtn" onClick={() => url.addValues('personTitles', [o.value])}>
                        + {o.value}<span className="c"><Num n={o.count} /></span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </details>
          <details>
            <summary>Function <Count n={n('department')} /></summary>
            <div className="fbody">{checks('department', { localSearch: true, placeholder: 'Search function…' })}</div>
          </details>
          <details>
            <summary>Seniority level <Count n={n('seniority')} /></summary>
            <div className="fbody">{checks('seniority', { localSearch: true, placeholder: 'Search seniority…' })}</div>
          </details>
          <details open={n('company', 'companyNot', 'companyList', 'companyNotList', 'domain', 'domainNot', 'domainList', 'domainNotList') > 0}>
            <summary>Company <Count n={n('company', 'companyNot', 'companyList', 'companyNotList', 'domain', 'domainNot', 'domainList', 'domainNotList')} /></summary>
            <div className="fbody">
              <div className="lbl">Company name</div>
              <ListFilter kind="company" {...box} placeholder="Type a name, or upload a list"
                suggest={(t) => `/api/companies?q=${encodeURIComponent(t)}&pageSize=8`} hint="One per line; any size file" />
              <div className="lbl">Company domain</div>
              <ListFilter kind="domain" {...box} placeholder="e.g. infosys.com" hint="Websites work too: https://www.tcs.com" />
            </div>
          </details>
          <details>
            <summary>Industry <Count n={n('industry')} /></summary>
            <div className="fbody">{checks('industry', { searchable: true, placeholder: 'Search industry…' })}</div>
          </details>
          <details open={n('zip', 'zipNot', 'zipList', 'zipNotList', 'country', 'state', 'county', 'city') > 0}>
            <summary>Location <Count n={n('zip', 'zipNot', 'zipList', 'zipNotList', 'country', 'state', 'county', 'city')} /></summary>
            <div className="fbody">
              <div className="lbl">Zip / PIN code</div>
              <ListFilter kind="zip" {...box} placeholder="e.g. 411001, 560034" hint="Or pick the place below" />
              <ZipInfo zips={state.zip} />
              <div className="lbl">Country</div>
              {checks('country', { searchable: true, limit: 5, placeholder: 'Search country…' })}
              <div className="lbl">State</div>
              {checks('state', { searchable: true, limit: 5, placeholder: 'Search state…' })}
              <div className="lbl">County / District</div>
              {checks('county', { searchable: true, limit: 5, placeholder: 'Search county or district…' })}
              <div className="lbl">City</div>
              {checks('city', { searchable: true, limit: 5, placeholder: 'Search city…' })}
            </div>
          </details>
          <details>
            <summary>Company headcount <Count n={n('employees')} /></summary>
            <div className="fbody">
              <FacetChecks k="employees" selected={state.employees} onToggle={toggle} items={listFor('employees', SIZE_LABELS)} />
            </div>
          </details>
          <details>
            <summary>Revenue <Count n={n('revenue')} /></summary>
            <div className="fbody">
              <FacetChecks k="revenue" selected={state.revenue} onToggle={toggle} items={listFor('revenue', REVENUE_LABELS)} />
              <span className="meta">Annual revenue in USD</span>
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
              <FacetChecks key={techMode} k={techMode} facet="tech" items={(options?.tech || []).map((o) => ({ value: o.value, count: o.count }))}
                selected={state[techMode]} onToggle={toggle} filterQs={filterQs} searchable placeholder="Search technology… e.g. Salesforce" exclude={techMode === 'techNot'} />
              <span className="meta">Counts are people at companies using it (all data)</span>
            </div>
          </details>
          <details open={n('hasEmail', 'hasPhone', 'hasDirect', 'emailStatus') > 0}>
            <summary>Contact info <Count n={n('hasEmail', 'hasPhone', 'hasDirect', 'emailStatus')} /></summary>
            <div className="fbody">
              {Object.entries(BOOL_LABELS).map(([k, [label, yes, no]]) => (
                <div key={k} className="tri">
                  <div className="lbl">{label}</div>
                  <div className="seg sm">
                    {[['', 'Any'], ['true', yes], ['false', no]].map(([v, l]) => {
                      const c = v ? facets?.[k]?.find((x) => x.value === v)?.count : undefined;
                      return (
                        <button key={v} type="button" className={state[k] === v ? 'on' : ''} aria-pressed={state[k] === v} onClick={() => setSingle(k, v)}>
                          {l}{c !== undefined && <span className="c"> <Num n={c} /></span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="lbl">Email status</div>
              {checks('emailStatus')}
            </div>
          </details>
          <details open={n('verifiedFrom', 'verifiedTo') > 0}>
            <summary>Verified on <Count n={state.verifiedFrom || state.verifiedTo ? 1 : 0} /></summary>
            <div className="fbody"><VerifiedFilter state={state} update={update} /></div>
          </details>
        </aside>

        <div className="results">
          <div className="bar">
            <button className="btn" id="toggleFilters" type="button" onClick={() => setFiltersOpen((o) => !o)}>
              {filtersOpen ? 'Hide filters' : `Filters${chips.length ? ` (${chips.length})` : ''}`}
            </button>
            <div className="count" aria-live="polite">
              {data ? (
                <>
                  <Num n={data.totalElements} /> people · <Num n={data.totalCompanies} /> companies
                  <span>page {fmt(data.page)} of {fmt(data.totalPages)}{loading ? ' · updating…' : ''}</span>
                </>
              ) : (
                'Loading…'
              )}
            </div>
            <div className="spacer" />
            <select aria-label="Sort" value={state.sortBy ? `${state.sortBy}:${state.sortDir}` : ''}
              onChange={(e) => { const [f, d] = e.target.value.split(':'); setSort(f, d); }}>
              <option value="">Sort: Default</option>
              <option value="name:asc">Name A–Z</option>
              <option value="name:desc">Name Z–A</option>
              <option value="company:asc">Company A–Z</option>
              <option value="city:asc">Location A–Z</option>
              <option value="seniority:asc">Seniority, highest first</option>
              <option value="employees:desc">Company size, largest</option>
              <option value="employees:asc">Company size, smallest</option>
              <option value="revenue:desc">Revenue, highest</option>
              <option value="verified:desc">Recently verified</option>
            </select>
            <select aria-label="Rows per page" value={state.pageSize} onChange={(e) => update((p) => p.set('pageSize', e.target.value))}>
              {[10, 25, 50, 100].map((s) => <option key={s} value={s}>{s} per page</option>)}
            </select>
          </div>

          {downloading && <DownloadDialog {...downloading} onClose={() => setDownloading(null)} />}
          <div className="bar actions">
            <span className="meta">{allSelected ? `All ${fmt(selectedCount)} selected` : `${fmt(selectedCount)} selected`}</span>
            {!allSelected && total > 0 && (
              <button className="link" type="button" onClick={() => setAllFor(filterQs)}
                title="Select everyone matching these filters, on all pages">
                {total > maxExport ? `Select first ${fmt(maxExport)}` : `Select all ${fmt(total)}`}
              </button>
            )}
            {limited && selectedCount > myCredits.credits && (
              <span className="pill due" title="You can download only as many people as you have credits">Limit: {fmt(myCredits.credits)} credits</span>
            )}
            <button className="btn" type="button" disabled={!chips.length} onClick={saveCurrentSearch}
              title={chips.length ? 'Save these filters under a name' : 'Apply a filter first'}>Save search</button>
            <button className="btn" type="button" disabled={!selectedCount} onClick={downloadSelected}>Download selected</button>
            {selectedCount > 0 && <button className="link" type="button" onClick={clearSelection}>Clear</button>}
            <div className="spacer" />
            <button className="btn" type="button" disabled={!data?.totalElements || savingAll} onClick={saveAll}
              title="Keep everyone in these results as one entry in Saved searches">
              {savingAll ? 'Saving…' : data && data.totalElements > maxExport ? `Save first ${compact(maxExport)}` : `Save all ${compact(data?.totalElements)}`}
            </button>
            <button className="btn primary" type="button" disabled={!data?.totalElements} onClick={downloadAll}>
              {limited && myCredits.credits < 1 ? 'Download (0 credits)'
                : data && downloadable < total ? `Download first ${compact(downloadable)}` : `Download all ${compact(data?.totalElements)}`}
            </button>
            {limited && (
              <a className={'pill' + (myCredits.credits < 1 ? ' due' : ' ok')} href="/credits" title="1 credit = 1 person downloaded. Click to ask for more.">
                {fmt(myCredits.credits)} credits left
              </a>
            )}
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

          <div className={'pagebar' + (loading ? ' on' : '')} aria-hidden="true" />
          <div className={'tablewrap' + (loading ? ' loading' : '')}>
            <table className="ptable">
              <thead>
                <tr>
                  <th className="cb"><input type="checkbox" aria-label="Select this page" checked={allOnPage} onChange={(e) => togglePage(e.target.checked)} /></th>
                  {SORTABLE.map(([k, l]) => sortHeader(k, l))}
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr><td colSpan={6} className="empty">Could not load people: {error} <button className="link" type="button" onClick={retry}>Try again</button></td></tr>
                ) : !data && loading ? (
                  Array.from({ length: 8 }, (_, i) => <tr key={i} className="skel"><td colSpan={6}><i /></td></tr>)
                ) : data && !rows.length ? (
                  <tr><td colSpan={6} className="empty">No people match these filters. Remove a filter or widen the job titles.</td></tr>
                ) : (
                  rows.map((p) => (
                    <tr key={p.id} className={allSelected || selected.has(p.id) ? 'sel' : ''}>
                      <td><input type="checkbox" aria-label={`Select ${p.name}`} checked={allSelected || selected.has(p.id)} onChange={(e) => toggleRow(p.id, e.target.checked)} /></td>
                      <td><PersonCell person={p} showSaved /></td>
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
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data && (
            <Pager
              page={data.page}
              totalPages={data.totalPages}
              onPage={(pg) => {
                update((p) => p.set('page', String(pg)), { keepPage: true });
                window.scrollTo({ top: 0 });
              }}
            />
          )}
          {data && data.totalElements > data.totalPages * data.pageSize && (
            <div className="meta center">Only the first {fmt(data.totalPages * data.pageSize)} results can be paged. Add filters to see the rest.</div>
          )}
          <div className="api"><b>GET</b> /api/people?{decodeURIComponent(spStr) || 'page=1&pageSize=25'}</div>
        </div>
      </div>
    </section>
  );
}

// Email verified date: up to a date, from a date, between two dates, or on one day.
// Stored as verifiedFrom / verifiedTo (both inclusive).
const VERIFIED_MODES = [['to', 'Up to'], ['from', 'From'], ['between', 'Between'], ['on', 'On date']];
function VerifiedFilter({ state, update }) {
  const { verifiedFrom: from, verifiedTo: to } = state;
  const current = from && to ? (from === to ? 'on' : 'between') : from ? 'from' : to ? 'to' : null;
  const [picked, setPicked] = useState('to');
  const mode = current || picked;
  const preset = VERIFIED_PRESETS.find(([d]) => !to && from === daysAgo(d))?.[0];
  const set = (f, t) => update((p) => {
    f ? p.set('verifiedFrom', f) : p.delete('verifiedFrom');
    t ? p.set('verifiedTo', t) : p.delete('verifiedTo');
  });
  function changeMode(m) {
    setPicked(m);
    const d = from || to;
    if (!d) return;
    if (m === 'to') set('', d);
    else if (m === 'from') set(d, '');
    else if (m === 'on') set(d, d);
    else set(from || d, to && to !== from ? to : '');
  }
  const date = (label, value, onChange, extra = {}) => (
    <label>{label} <input className="txt" type="date" value={value} onChange={(e) => onChange(e.target.value)} {...extra} /></label>
  );
  return (
    <>
      <div className="seg sm" role="tablist" aria-label="Verified on">
        {VERIFIED_MODES.map(([m, l]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => changeMode(m)}>{l}</button>
        ))}
      </div>
      <div className="dates">
        {mode === 'to' && date('Verified up to (and on)', to, (v) => set('', v))}
        {mode === 'from' && date('Verified on or after', from, (v) => set(v, ''))}
        {mode === 'on' && date('Verified on', from, (v) => set(v, v))}
        {mode === 'between' && (
          <>
            {date('From', from, (v) => set(v, to), { max: to || undefined })}
            {date('Up to', to, (v) => set(from, v), { min: from || undefined })}
          </>
        )}
      </div>
      <div className="lbl">Quick pick</div>
      <div className="checks">
        {VERIFIED_PRESETS.map(([d, l]) => (
          <label key={d}>
            <input type="radio" name="verifiedPreset" checked={preset === d} onChange={() => { setPicked('from'); set(daysAgo(d), ''); }} /> {l}
          </label>
        ))}
      </div>
      {(from || to) && <button className="link" type="button" onClick={() => set('', '')}>Any time</button>}
    </>
  );
}

// Where the typed zip codes are: "411001 → Pune, Pune, Maharashtra, India"
function ZipInfo({ zips }) {
  const qs = zips.slice(0, 20).map((z) => `zip=${encodeURIComponent(z)}`).join('&');
  const { data } = useFetch(qs ? `/api/locations?${qs}` : null, { debounce: 150 });
  if (!qs || !data) return null;
  return (
    <ul className="zipinfo">
      {zips.slice(0, 20).map((z) => {
        const r = data[z.replace(/\s+/g, '').toUpperCase()];
        return (
          <li key={z}>
            <b>{z}</b> {r ? <>→ {[r.city, r.county, r.state, r.country].filter(Boolean).join(', ')} <span className="meta">· {fmt(r.people)}</span></> : <span className="meta">not in the data</span>}
          </li>
        );
      })}
    </ul>
  );
}
