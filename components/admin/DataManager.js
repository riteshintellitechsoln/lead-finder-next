'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Pager from '@/components/Pager';
import PersonCell, { EmailCell } from '@/components/PersonCell';
import { useToast } from '@/components/Toast';
import { api, download, notifyStatsChanged } from '@/lib/api';
import { fmt, sizeLabel } from '@/lib/format';
import Num from '@/components/Num';

const FIELDS = [
  ['name', 'Name *'], ['title', 'Job title'], ['seniority', 'Seniority (guessed if empty)'], ['company', 'Company'],
  ['industry', 'Industry'], ['employees', '# Employees'], ['city', 'City'], ['email', 'Email'],
];
const EMPTY = Object.fromEntries(FIELDS.map(([k]) => [k, '']));

function Upload({ onDone }) {
  const toast = useToast();
  const fileRef = useRef();
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);

  async function upload(e) {
    e.preventDefault();
    const file = fileRef.current.files[0];
    if (!file) return toast('Choose a CSV file first');
    if (replace && !window.confirm('Replace ALL people? Saved lists of all users are cleared too.')) return;
    setBusy(true);
    setLog([`Uploading ${file.name} (${fmt(Math.round(file.size / 1024))} KB)…`]);
    try {
      // The raw file is the request body, so the server can read it as a stream
      const res = await fetch(`/api/admin/import?replace=${replace}`, { method: 'POST', body: file, headers: { 'Content-Type': 'text/csv' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
      setLog(data.log);
      toast(`Imported ${fmt(data.imported)} people`);
      fileRef.current.value = '';
      notifyStatsChanged();
      onDone();
    } catch (err) {
      setLog((l) => [...l, 'Failed: ' + err.message]);
      toast(err.message);
    }
    setBusy(false);
  }

  return (
    <form className="card" onSubmit={upload}>
      <h3>Upload CSV</h3>
      <p className="meta">
        Columns are matched by header name: name (or first + last name), title, seniority, company, industry, employees, city, email.
        For Excel files, save as <b>CSV UTF-8</b> first. Big files can take a few minutes; keep this page open.
      </p>
      <div className="bar">
        <input ref={fileRef} type="file" accept=".csv,text/csv" disabled={busy} />
        <label className="check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} disabled={busy} /> Replace all existing people</label>
        <div className="spacer" />
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Importing…' : 'Upload & import'}</button>
      </div>
      {log.length > 0 && <pre className="api log">{log.join('\n')}</pre>}
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
  const formRef = useRef();

  useEffect(() => setQ(sp.get('q') || ''), [sp]);
  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '25', sortDir: 'desc' });
    if (query) p.set('q', query);
    api('/admin/people?' + p).then(setData, (e) => setError(e.message));
  }, [query, page]);
  useEffect(load, [load]);

  function edit(p) {
    setEditing(p.id);
    setForm(Object.fromEntries(FIELDS.map(([k]) => [k, p[k] ?? ''])));
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
  function cancel() {
    setEditing(null);
    setForm(EMPTY);
  }

  async function save(e) {
    e.preventDefault();
    try {
      if (editing) await api(`/admin/people/${editing}`, { method: 'PATCH', body: form });
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
      <Upload onDone={load} />

      <form className="card" ref={formRef} onSubmit={save}>
        <h3>{editing ? `Edit person #${editing}` : 'Add a person'}</h3>
        <div className="personform">
          {FIELDS.map(([k, label]) => (
            <input key={k} className="txt" placeholder={label} aria-label={label} required={k === 'name'}
              type={k === 'employees' ? 'number' : k === 'email' ? 'email' : 'text'} {...field(k)} />
          ))}
        </div>
        <div className="bar mt">
          <div className="spacer" />
          {editing && <button className="btn" type="button" onClick={cancel}>Cancel</button>}
          <button className="btn primary" type="submit">{editing ? 'Save changes' : 'Add person'}</button>
        </div>
      </form>

      <div className="bar">
        <input className="txt narrow" placeholder="Search name or company" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="count">{data ? <>Total <Num n={data.totalElements} /><span>{data.tookMs} ms</span></> : ''}</div>
        <div className="spacer" />
        <button className="btn" type="button" onClick={() => download('/api/people/export' + (query ? '?q=' + encodeURIComponent(query) : ''))}>
          Download CSV
        </button>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Company</th><th>Location</th><th>Email</th><th /></tr></thead>
          <tbody>
            {error && <tr><td colSpan={5} className="empty">{error}</td></tr>}
            {data && !data.content.length && <tr><td colSpan={5} className="empty">No people found.</td></tr>}
            {data?.content.map((p) => (
              <tr key={p.id} className={editing === p.id ? 'sel' : ''}>
                <td><PersonCell person={p} /></td>
                <td><div className="co">{p.company || '–'}</div><div className="meta">{p.industry ? `${p.industry} · ` : ''}{sizeLabel(p.employees)}</div></td>
                <td>{p.city || '–'}</td>
                <td><EmailCell email={p.email} /></td>
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
