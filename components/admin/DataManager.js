'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Pager from '@/components/Pager';
import PersonCell, { EmailCell } from '@/components/PersonCell';
import { useToast } from '@/components/Toast';
import { api, download, notifyStatsChanged } from '@/lib/api';
import { fmt, formatDateTime, sizeLabel } from '@/lib/format';
import Num from '@/components/Num';
import { COUNTRIES, FUNCTIONS, INDUSTRIES, SENIORITY_LEVELS, SIZE_EDGES, SIZE_KEYS, SIZE_LABELS } from '@/lib/options';

const FIELDS = [
  ['first_name', 'First name *'], ['last_name', 'Last name'], ['title', 'Job title'], ['seniority', 'Seniority level *'], ['department', 'Function *'],
  ['company', 'Company'], ['domain', 'Domain'], ['industry', 'Industry *'], ['employees', 'Company headcount *'],
  ['revenue', 'Revenue, e.g. $12M'], ['techs', 'Technologies, comma separated'],
  ['city', 'City'], ['county', 'County / District'], ['state', 'State'], ['country', 'Country'], ['zip', 'Zip / PIN code'],
  ['email', 'Email'], ['email_status', 'Email status (as in your file)'], ['verified_at', 'Verified on (YYYY-MM-DD)'],
  ['phone', 'Phone'], ['direct_phone', 'Direct phone'],
  ['address1', 'Address 1'], ['address2', 'Address 2'], ['linkedin', 'Employee LinkedIn URL'], ['company_linkedin', 'Company LinkedIn URL'],
  ['updated_at', 'Updated on (YYYY-MM-DD)'],
];
// Required, picked from the same lists as an upload (checked again on the server)
const PICK = {
  seniority: SENIORITY_LEVELS.map((v) => [v, v]),
  department: FUNCTIONS.map((v) => [v, v]),
  industry: INDUSTRIES.map((v) => [v, v]),
  employees: SIZE_KEYS.map((k) => [k, SIZE_LABELS[k]]),
  country: COUNTRIES.map((v) => [v, v]),
};
// A saved number of employees (e.g. 75) -> its range key ("51-200")
const sizeOf = (n) => {
  const v = Number(String(n ?? '').replace(/,/g, ''));
  if (!v) return SIZE_KEYS.includes(String(n)) ? String(n) : '';
  const i = SIZE_EDGES.findIndex((e) => v <= e);
  return SIZE_KEYS[i < 0 ? SIZE_KEYS.length - 1 : i];
};
const EMPTY = Object.fromEntries(FIELDS.map(([k]) => [k, '']));
const MAX_PICK = 1000; // rows picked one by one (the server takes up to 1,000 ids); "Select all" has no limit
const MAX_DOWNLOAD = 100000; // MAX_EXPORT_ROWS on the server

// Every uploaded file must have these columns, with a value from these lists (lib/csv.js REQUIRED_COLUMNS)
const REQUIRED = [
  ['employees', 'Company headcount', ['1-10', '11-50', '51-200', '201-500', '501-1,000', '1,001-5,000', '5,001-10,000', '10,001+']],
  ['department', 'Function', FUNCTIONS],
  ['seniority', 'Seniority level', SENIORITY_LEVELS],
  ['country', 'Country', COUNTRIES],
  ['industry', 'Industry', INDUSTRIES],
];
// "Uploaded 5 of 8 rows · Not uploaded: 1 wrong value, 2 duplicates"
function uploadLine(u) {
  const dups = (u.in_data || 0) + (u.in_file || 0);
  const parts = [];
  if (u.wrong) parts.push(`${fmt(u.wrong)} wrong value${u.wrong === 1 ? '' : 's'}`);
  if (dups) parts.push(`${fmt(dups)} duplicate${dups === 1 ? '' : 's'}`);
  return { text: `Uploaded ${fmt(u.imported)} of ${fmt(u.file_rows)} rows`, skipped: parts.join(', '), bad: Boolean(parts.length) };
}

function Upload({ onDone }) {
  const toast = useToast();
  const fileRef = useRef();
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // the last upload
  const [recent, setRecent] = useState(null);

  const loadRecent = useCallback(() => { api('/admin/import').then((d) => setRecent(d.imports), () => setRecent([])); }, []);
  useEffect(loadRecent, [loadRecent]);

  // Removes the upload from this list only; the people it added stay in the data
  async function removeUpload(u) {
    if (!window.confirm(`Remove the upload "${u.file_name || `#${u.id}`}" from this list? The people it added stay in the data.`)) return;
    try {
      await api(`/admin/import/${u.id}`, { method: 'DELETE' });
      toast('Upload removed from the list');
      if (result?.id === u.id) setResult(null);
      loadRecent();
    } catch (err) {
      toast(err.message);
    }
  }

  async function upload(e) {
    e.preventDefault();
    const file = fileRef.current.files[0];
    if (!file) return toast('Choose a CSV file first');
    if (replace && !window.confirm('Replace ALL people? Saved lists of all users are cleared too.')) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      // The raw file is the request body, so the server can read it as a stream
      const res = await fetch(`/api/admin/import?replace=${replace}&name=${encodeURIComponent(file.name)}`,
        { method: 'POST', body: file, headers: { 'Content-Type': 'text/csv' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
      setResult({ id: data.importId, imported: data.imported, file_rows: data.fileRows, wrong: data.wrong, in_data: data.inData, in_file: data.inFile });
      fileRef.current.value = '';
      notifyStatsChanged();
      onDone();
      loadRecent();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  const line = result && uploadLine(result);
  return (
    <form className="card" onSubmit={upload}>
      <h3>Upload CSV</h3>
      <p className="meta">
        Every row needs <b>{REQUIRED.map(([, l]) => l).join(', ')}</b> with a value from the allowed list.
        Wrong rows and people already in the data are not uploaded. From Excel, save as <b>CSV UTF-8</b>.
      </p>
      <div className="bar">
        <button className="btn" type="button" onClick={() => download('/api/admin/import/template')}>Download template</button>
        <button className="btn" type="button" onClick={() => download('/api/admin/import/template?kind=values')}>Download allowed values</button>
      </div>
      <details className="allowed">
        <summary>See the allowed values</summary>
        <div className="allowedcols">
          {REQUIRED.map(([k, label, values]) => (
            <div key={k}><b>{label}</b> <span className="meta">({fmt(values.length)})</span><ul>{values.map((v) => <li key={v}>{v}</li>)}</ul></div>
          ))}
        </div>
      </details>
      <div className="bar">
        <input ref={fileRef} type="file" accept=".csv,text/csv" disabled={busy} />
        <label className="check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} disabled={busy} /> Replace all existing people</label>
        <div className="spacer" />
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Uploading… keep this page open' : 'Upload'}</button>
      </div>
      {error && <div className="uploadsum bad" role="alert"><b>Not uploaded.</b> {error}</div>}
      {line && (
        <div className={`uploadsum line${line.bad ? ' bad' : ''}`} role="status">
          <span>{result.imported ? line.text : <><b>Nothing uploaded.</b> Your data is unchanged</>}.{line.skipped && <> Not uploaded: {line.skipped}.</>}</span>
          {line.bad && <Link className="btn" href={`/admin/data/uploads/${result.id}`}>See what was not uploaded</Link>}
        </div>
      )}
      {recent?.length > 0 && (
        <>
          <h4 className="mt">Recent uploads</h4>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Date</th><th>File</th><th className="num">Rows</th><th className="num">Uploaded</th><th className="num">Wrong values</th><th className="num">Duplicates</th><th /></tr></thead>
              <tbody>
                {recent.map((u) => (
                  <tr key={u.id}>
                    <td>{formatDateTime(u.created_at)}</td>
                    <td>{u.file_name || '–'}{u.replaced && <span className="pill">Replaced all</span>}</td>
                    <td className="num">{fmt(u.file_rows)}</td>
                    <td className="num">{fmt(u.imported)}</td>
                    <td className="num">{u.wrong ? <b className="warntxt">{fmt(u.wrong)}</b> : 0}</td>
                    <td className="num">{u.in_data + u.in_file ? <b className="warntxt">{fmt(u.in_data + u.in_file)}</b> : 0}</td>
                    <td>
                      <div className="rowacts">
                        <Link className="btn" href={`/admin/data/uploads/${u.id}`}>Open</Link>
                        <button className="link danger" type="button" onClick={() => removeUpload(u)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </form>
  );
}

export default function DataManager() {
  const toast = useToast();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') || '');
  const [query, setQuery] = useState(q.trim());
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null); // person id, or null when adding
  const [oldEmployees, setOldEmployees] = useState(null); // the saved headcount of the person being edited
  const formRef = useRef();
  // Updated on, from / to (YYYY-MM-DD). Sent as verifiedFrom / verifiedTo, which filter Updated on.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const badRange = Boolean(from && to && from > to);
  // Picked rows (up to MAX_PICK), or every row matching the filters (all)
  const [picked, setPicked] = useState(() => new Set());
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setQ(sp.get('q') || ''), [sp]);
  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  // The filters only (no page): the same for the list, Download and Delete
  const filterQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (query) p.set('q', query);
    if (from) p.set('verifiedFrom', from);
    if (to) p.set('verifiedTo', to);
    return p;
  }, [query, from, to]);
  const filtered = Boolean(query || from || to);

  // New filters: start again on page 1 with nothing picked
  useEffect(() => { setPage(1); setPicked(new Set()); setAll(false); }, [query, from, to]);

  const load = useCallback(() => {
    if (badRange) return;
    const p = filterQuery();
    p.set('page', String(page));
    p.set('pageSize', '25');
    p.set('sortDir', 'desc');
    setError('');
    api('/admin/people?' + p).then(setData, (e) => setError(e.message));
  }, [filterQuery, page, badRange]);
  useEffect(load, [load]);

  // Extra copies of the same person already in the data (from uploads before duplicates were checked)
  const [dups, setDups] = useState(0);
  const loadDups = useCallback(() => { api('/admin/people/duplicates').then((d) => setDups(d.duplicates), () => setDups(0)); }, []);
  useEffect(loadDups, [loadDups]);
  async function removeDups() {
    if (!window.confirm(`Delete ${fmt(dups)} duplicate ${dups === 1 ? 'row' : 'rows'}? The first copy of each person is kept.`)) return;
    setBusy(true);
    try {
      const { removed } = await api('/admin/people/duplicates', { method: 'DELETE' });
      toast(`Removed ${fmt(removed)} duplicate ${removed === 1 ? 'row' : 'rows'}`);
      clearPicked();
      notifyStatsChanged();
      load();
      loadDups();
    } catch (err) {
      toast(err.message);
    }
    setBusy(false);
  }

  const total = data?.totalElements ?? 0;
  const pageIds = data?.content.map((p) => p.id) || [];
  const pageAllPicked = pageIds.length > 0 && (all || pageIds.every((id) => picked.has(id)));
  const count = all ? total : picked.size;

  function pick(id, on) {
    setAll(false);
    setPicked((old) => {
      const next = new Set(old);
      if (on) {
        if (next.size >= MAX_PICK) { toast(`You can pick up to ${fmt(MAX_PICK)} rows. Use "Select all" with a filter for more.`); return old; }
        next.add(id);
      } else next.delete(id);
      return next;
    });
  }
  function pickPage(on) {
    if (!on) { setAll(false); setPicked((old) => new Set([...old].filter((id) => !pageIds.includes(id)))); return; }
    setPicked((old) => new Set([...old, ...pageIds].slice(0, MAX_PICK)));
  }
  function clearPicked() { setAll(false); setPicked(new Set()); }

  // What the actions work on: the picked ids, or the filters (all matching)
  function targetQuery() {
    if (!all) return new URLSearchParams({ ids: [...picked].join(',') });
    const p = filterQuery();
    if (!filtered) p.set('all', 'true');
    return p;
  }
  function downloadPicked() {
    if (all && total > MAX_DOWNLOAD) toast(`A download can have at most ${fmt(MAX_DOWNLOAD)} people. You will get the first ${fmt(MAX_DOWNLOAD)}.`);
    download('/api/people/export?' + targetQuery());
  }
  async function deletePicked() {
    const what = `${fmt(count)} ${count === 1 ? 'person' : 'people'}`;
    // Every delete of picked rows asks the admin to type DELETE, not only "delete everyone"
    const message = all && !filtered
      ? `This deletes ALL ${what} in the data. It cannot be undone.\nType DELETE to continue.`
      : `This deletes ${what}. It cannot be undone.\nType DELETE to continue.`;
    const typed = window.prompt(message);
    if (typed === null) return;
    if (typed.trim() !== 'DELETE') return toast('Not deleted. Type DELETE (in capitals) to confirm.');
    setBusy(true);
    try {
      const { removed } = await api('/admin/people?' + targetQuery(), { method: 'DELETE' });
      toast(`Deleted ${fmt(removed)} ${removed === 1 ? 'person' : 'people'}`);
      clearPicked();
      notifyStatsChanged();
      load();
      loadDups();
    } catch (err) {
      toast(err.message);
    }
    setBusy(false);
  }

  function edit(p) {
    setEditing(p.id);
    setOldEmployees(p.employees ?? null);
    setForm({ ...Object.fromEntries(FIELDS.map(([k]) => [k, p[k] ?? ''])), employees: sizeOf(p.employees) });
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
  function cancel() {
    setEditing(null);
    setForm(EMPTY);
  }

  async function save(e) {
    e.preventDefault();
    try {
      // Editing: keep the exact saved headcount (e.g. 75) while its range is unchanged
      const keep = editing && oldEmployees != null && sizeOf(oldEmployees) === form.employees;
      if (editing) await api(`/admin/people/${editing}`, { method: 'PATCH', body: keep ? { ...form, employees: String(oldEmployees) } : form });
      else await api('/admin/people', { method: 'POST', body: form });
      toast(editing ? 'Person updated' : 'Person added');
      cancel();
      notifyStatsChanged();
      load();
    } catch (err) {
      toast(err.message);
    }
  }
  async function remove(p) {
    if (!window.confirm(`Delete ${p.name}? This cannot be undone.`)) return;
    try {
      await api(`/admin/people/${p.id}`, { method: 'DELETE' });
      toast('Deleted');
      notifyStatsChanged();
      load();
    } catch (err) {
      toast(err.message);
    }
  }
  const field = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <section className="view">
      <Upload onDone={() => { load(); loadDups(); }} />

      <form className="card" ref={formRef} onSubmit={save}>
        <h3>{editing ? `Edit person #${editing}` : 'Add a person'}</h3>
        <div className="personform">
          {FIELDS.map(([k, label]) => (PICK[k] ? (
            <select key={k} className={`txt${form[k] ? '' : ' empty'}`} aria-label={label} required {...field(k)}>
              <option value="">{label}</option>
              {/* an old value that is not in the list: shown so it can be changed */}
              {form[k] && !PICK[k].some(([v]) => v === form[k]) && <option value={form[k]} disabled>{form[k]} (not in the list)</option>}
              {PICK[k].map(([v, text]) => <option key={v} value={v}>{text}</option>)}
            </select>
          ) : (
            <input key={k} className="txt" placeholder={label} aria-label={label} required={k === 'first_name'}
              type={k === 'email' ? 'email' : 'text'} {...field(k)} />
          )))}
        </div>
        <div className="bar mt">
          <div className="spacer" />
          {editing && <button className="btn" type="button" onClick={cancel}>Cancel</button>}
          <button className="btn primary" type="submit">{editing ? 'Save changes' : 'Add person'}</button>
        </div>
      </form>

      <div className="bar datafilters">
        <input className="txt narrow" placeholder="Search name or company" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="meta">Updated on</span>
        <label className="meta" htmlFor="dataFrom">From</label>
        <input id="dataFrom" className="txt" type="date" style={{ width: 'auto' }} max={to || undefined} value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="meta" htmlFor="dataTo">To</label>
        <input id="dataTo" className="txt" type="date" style={{ width: 'auto' }} min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
        {filtered && <button className="link" type="button" onClick={() => { setQ(''); setQuery(''); setFrom(''); setTo(''); }}>Clear</button>}
        <div className="spacer" />
        <div className="count">{data ? <>Total <Num n={total} /></> : ''}</div>
      </div>
      {badRange && <div className="meta warn" role="alert">The From date is after the To date.</div>}
      {dups > 0 && (
        <div className="uploadsum line bad" role="status">
          <span><b>{fmt(dups)}</b> duplicate {dups === 1 ? 'row is' : 'rows are'} in the data (the same email, or the same name and company).</span>
          <button className="btn dangerbtn" type="button" disabled={busy} onClick={removeDups}>Remove duplicates</button>
        </div>
      )}

      {/* What is picked, and what to do with it */}
      <div className="bar selbar">
        <span>{count ? <><b>{fmt(count)}</b> selected</> : <span className="meta">Tick rows to select them</span>}</span>
        {!all && total > 0 && (
          <button className="link" type="button" onClick={() => { setAll(true); setPicked(new Set()); }}>
            Select all {fmt(total)}{filtered ? ' matching' : ''}
          </button>
        )}
        {count > 0 && <button className="link" type="button" onClick={clearPicked}>Clear selection</button>}
        <div className="spacer" />
        <button className="btn" type="button" disabled={!count || busy} onClick={downloadPicked}>Download selected</button>
        <button className="btn dangerbtn" type="button" disabled={!count || busy} onClick={deletePicked}>{busy ? 'Deleting…' : 'Delete selected'}</button>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th className="pick"><input type="checkbox" aria-label="Select all on this page" checked={pageAllPicked} disabled={all} onChange={(e) => pickPage(e.target.checked)} /></th>
              <th>Name</th><th>Company</th><th>Location</th><th>Email</th><th>Updated on</th><th />
            </tr>
          </thead>
          <tbody>
            {error && <tr><td colSpan={7} className="empty">{error}</td></tr>}
            {data && !data.content.length && <tr><td colSpan={7} className="empty">No people found.</td></tr>}
            {data?.content.map((p) => (
              <tr key={p.id} className={editing === p.id || all || picked.has(p.id) ? 'sel' : ''}>
                <td className="pick"><input type="checkbox" aria-label={`Select ${p.name}`} checked={all || picked.has(p.id)} disabled={all} onChange={(e) => pick(p.id, e.target.checked)} /></td>
                <td><PersonCell person={p} /></td>
                <td><div className="co">{p.company || '–'}</div><div className="meta">{p.industry ? `${p.industry} · ` : ''}{sizeLabel(p.employees)}</div></td>
                <td>{[p.city, p.state].filter(Boolean).join(', ') || '–'}</td>
                <td><EmailCell email={p.email} /></td>
                <td>{p.updated_at ? String(p.updated_at).slice(0, 10) : '–'}</td>
                <td>
                  <div className="rowacts">
                    <button className="link" type="button" onClick={() => edit(p)}>Edit</button>
                    <button className="link danger" type="button" onClick={() => remove(p)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </section>
  );
}
