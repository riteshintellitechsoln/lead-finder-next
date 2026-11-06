'use client';
// Opens when a user presses Download. Choose how many companies, how many people from
// each company and which roles, see the number of people and credits, then download.
//   <DownloadDialog url="/api/people/export?city=Pune" what="these results" partial onClose={...} />
// partial=false (picked rows): more people than credits is an error, nothing is downloaded.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { download, notifyStatsChanged } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useToast } from './Toast';

const withParams = (url, entries) => {
  const u = new URL(url, 'http://x');
  for (const [k, v] of entries) u.searchParams.append(k, v);
  return `${u.pathname}${u.search}`;
};
const isCount = (s) => s === '' || (/^\d+$/.test(s) && Number(s) >= 1);
const splitTitles = (s) => s.split(',').map((t) => t.trim()).filter(Boolean);

async function getJson(url, signal) {
  const res = await fetch(url, { signal });
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return new Promise(() => {}); // the page is leaving
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Server returned ${res.status}`);
  return out;
}

function RoleChecks({ title, items, picked, onToggle }) {
  if (!items.length) return null;
  return (
    <fieldset className="dlgroup">
      <legend>{title}</legend>
      <div className="dlchecks">
        {items.map((o) => (
          <label key={o.value} className="dlcheck">
            <input type="checkbox" checked={picked.includes(o.value)} onChange={(e) => onToggle(o.value, e.target.checked)} />
            {o.value} <span className="meta">{fmt(o.n)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function DownloadDialog({ url, what = 'these results', partial = true, onClose }) {
  const toast = useToast();
  const box = useRef(null);
  const [options, setOptions] = useState(null);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState('');
  const [perCompany, setPerCompany] = useState('');
  const [seniority, setSeniority] = useState([]);
  const [department, setDepartment] = useState([]);
  const [titles, setTitles] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');

  const valid = isCount(companies) && isCount(perCompany);
  const typedTitles = splitTitles(titles);
  const choices = [
    ...(companies ? [['dlCompanies', companies]] : []),
    ...(perCompany ? [['dlPerCompany', perCompany]] : []),
    ...seniority.map((v) => ['dlSeniority', v]),
    ...department.map((v) => ['dlFunction', v]),
    ...typedTitles.map((v) => ['dlTitle', v]),
  ];
  const finalUrl = withParams(url, choices);

  useEffect(() => {
    const ctrl = new AbortController();
    getJson(url.replace('/api/people/export', '/api/people/export/options'), ctrl.signal)
      .then(setOptions, (e) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
  }, [url]);

  // The number of people and credits, updated as the choices change
  useEffect(() => {
    if (!options || !valid) return undefined;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      getJson(withParams(finalUrl, [['check', '1']]), ctrl.signal).then(
        (out) => { setPreview(out); setPreviewError(''); },
        (e) => { if (e.name !== 'AbortError') setPreviewError(e.message); },
      );
    }, 250);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [options, valid, finalUrl]);

  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (set) => (value, on) => set((old) => (on ? [...old, value] : old.filter((v) => v !== value)));
  function toggleTitle(value) {
    const list = splitTitles(titles);
    const has = list.some((t) => t.toLowerCase() === value.toLowerCase());
    setTitles((has ? list.filter((t) => t.toLowerCase() !== value.toLowerCase()) : [...list, value]).join(', '));
  }

  const rows = preview?.rows ?? 0;
  const limited = preview && !preview.unlimited;
  const credits = preview?.credits ?? 0;
  const noCredits = limited && credits < 1;
  const over = limited && rows > credits;
  const blocked = !valid || !preview || !rows || noCredits || (over && !partial) || Boolean(previewError);
  const fromCompanies = preview?.companies ?? 0;

  function start() {
    const take = over ? credits : rows;
    download(over ? withParams(finalUrl, [['limit', String(credits)]]) : finalUrl);
    setTimeout(notifyStatsChanged, 1500); // the sidebar shows the new balance
    toast(`Downloading ${fmt(take)} people`);
    onClose();
  }

  return (
    <div className="dlback" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlbox card" role="dialog" aria-modal="true" aria-labelledby="dlTitle" tabIndex={-1} ref={box}>
        <h3 id="dlTitle">Download options</h3>
        {error && <div className="meta" role="alert">{error}</div>}
        {!options && !error && <div className="meta">Loading…</div>}
        {options && (
          <>
            <div className="meta"><b>{fmt(options.rows)}</b> people from <b>{fmt(options.companies)}</b> {options.companies === 1 ? 'company' : 'companies'} in {what}.</div>

            {options.companies > 0 && (
              <div className="dlrow">
                <label>
                  How many companies
                  <input className="txt" type="number" min={1} max={options.companies} step={1} placeholder={`All (${fmt(options.companies)})`}
                    value={companies} onChange={(e) => setCompanies(e.target.value)} />
                  <span className="meta">The ones with the most people</span>
                </label>
                <label>
                  People from each company
                  <input className="txt" type="number" min={1} step={1} placeholder="All" value={perCompany} onChange={(e) => setPerCompany(e.target.value)} />
                  <span className="meta">Highest seniority first</span>
                </label>
              </div>
            )}
            {!valid && <div className="meta" role="alert">Enter a whole number, 1 or more.</div>}
            {options.noCompany > 0 && (companies || perCompany) && (
              <div className="meta">{fmt(options.noCompany)} people without a company are left out when you set a company limit.</div>
            )}

            <h4 className="dlhead">Which roles</h4>
            <div className="meta">Tick the people you want. Anyone matching at least one is included. Tick nothing to get every role.</div>
            <RoleChecks title="Seniority" items={options.seniority} picked={seniority} onToggle={toggle(setSeniority)} />
            <RoleChecks title="Function" items={options.department} picked={department} onToggle={toggle(setDepartment)} />
            {options.titles.length > 0 && (
              <fieldset className="dlgroup">
                <legend>Job title</legend>
                <input className="txt" placeholder="e.g. CEO, HR Manager" aria-label="Job titles, separated by commas" value={titles} onChange={(e) => setTitles(e.target.value)} />
                <div className="dlchecks">
                  {options.titles.map((o) => (
                    <label key={o.value} className="dlcheck">
                      <input type="checkbox" checked={typedTitles.some((t) => t.toLowerCase() === o.value.toLowerCase())} onChange={() => toggleTitle(o.value)} />
                      {o.value} <span className="meta">{fmt(o.n)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="dlsum" aria-live="polite">
              {previewError && <div role="alert">{previewError}</div>}
              {!previewError && !preview && <span className="meta">Counting…</span>}
              {!previewError && preview && (
                <>
                  <div><b>{fmt(rows)}</b> people from <b>{fmt(fromCompanies)}</b> {fromCompanies === 1 ? 'company' : 'companies'}{rows >= options.maxRows && ` (a download can have at most ${fmt(options.maxRows)})`}</div>
                  {!rows && <div className="meta">No people match these choices.</div>}
                  {limited && !over && rows > 0 && <div className="meta">Uses {fmt(rows)} credits. You will have {fmt(credits - rows)} left.</div>}
                  {noCredits && <div role="alert">You have no download credits left. <Link className="link" href="/credits">Ask the admin for credits</Link></div>}
                  {!noCredits && over && !partial && (
                    <div role="alert">Download limit: you have only {fmt(credits)} credits. Lower the numbers above by {fmt(rows - credits)} people, or <Link className="link" href="/credits">ask the admin for more</Link>.</div>
                  )}
                  {!noCredits && over && partial && (
                    <div role="alert">You have only {fmt(credits)} credits, so you will get the first {fmt(credits)} of these {fmt(rows)}. Lower the numbers above, or <Link className="link" href="/credits">ask the admin for more</Link>.</div>
                  )}
                </>
              )}
            </div>
          </>
        )}
        <div className="dlacts">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          {options && (
            <button className="btn primary" type="button" disabled={blocked} onClick={start}>
              {over && partial && !noCredits ? `Download first ${fmt(credits)}` : `Download ${fmt(rows)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
