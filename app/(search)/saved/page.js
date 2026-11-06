'use client';
// Saved searches.
// - Logged in: every "Save search" (filters only) or "Save all" is ONE entry.
//   Opening it goes to People with those filters applied again.
//   Leads saved one by one are grouped as "Individually saved leads", opened here.
// - Guest: the in-memory list only.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import GuestNote from '@/components/GuestNote';
import Pager from '@/components/Pager';
import PersonCell, { ContactCell } from '@/components/PersonCell';
import { useSession } from '@/components/Session';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import DownloadDialog from '@/components/DownloadDialog';
import { fmt, revenueLabel, sizeLabel } from '@/lib/format';
import Num from '@/components/Num';

const INDIVIDUAL = 'individual';
const peopleHref = (l) => `/people${l.query ? `?${l.query}` : ''}`;

export default function SavedPage() {
  const session = useSession();
  const [open, setOpen] = useState(null); // null = overview, INDIVIDUAL, or a list { id, name, ... }

  if (session.guest) return <PeopleView source={{ kind: INDIVIDUAL }} />;
  if (open) return <PeopleView source={open} onBack={() => setOpen(null)} />;
  return <ListsView onOpen={setOpen} />;
}

function ListsView({ onOpen }) {
  const toast = useToast();
  const session = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(null);

  const load = useCallback(() => {
    api('/saved').then(setData, (e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function rename(list) {
    const name = window.prompt('New name for this saved search:', list.name);
    if (name === null || !name.trim()) return;
    try {
      await session.renameSavedList(list.id, name.trim());
      load();
    } catch (e) {
      toast(e.message);
    }
  }

  async function remove(list) {
    if (!window.confirm(`Delete the saved search "${list.name}"?`)) return;
    try {
      await session.deleteSavedList(list.id);
      toast(`Deleted "${list.name}"`);
      load();
    } catch (e) {
      toast(e.message);
    }
  }

  const lists = data?.lists || [];

  return (
    <section className="view">
      {downloading && <DownloadDialog {...downloading} onClose={() => setDownloading(null)} />}
      <div className="bar">
        <div className="count">
          {data ? <><Num n={lists.length} /> saved {lists.length === 1 ? 'search' : 'searches'}</> : 'Loading…'}
        </div>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Search</th><th>Results when saved</th><th>Saved on</th><th /></tr></thead>
          <tbody>
            {error && <tr><td colSpan={4} className="empty">{error}</td></tr>}
            {data && !lists.length && !data.individual && (
              <tr><td colSpan={4} className="empty">Nothing saved yet. In People, apply filters and press Save search. Open it from here to get the same filters back.</td></tr>
            )}
            {lists.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.query != null
                    ? <Link className="link" href={peopleHref(l)}><b>{l.name}</b></Link>
                    : <button className="link" type="button" onClick={() => onOpen({ kind: 'list', ...l })}><b>{l.name}</b></button>}
                  {l.summary && <div className="meta">{l.summary}</div>}
                </td>
                <td data-l="Results when saved"><Num n={l.size} /></td>
                <td data-l="Saved on">{l.created_at}</td>
                <td>
                  {l.query != null
                    ? <Link className="btn" href={peopleHref(l)}>Open</Link>
                    : <button className="btn" type="button" onClick={() => onOpen({ kind: 'list', ...l })}>Open</button>}{' '}
                  <button className="link" type="button" onClick={() => setDownloading({
                    // A saved search downloads the current results; "Save all" the people it kept
                    url: l.kind === 'search' ? `/api/people/export?${l.query}` : `/api/people/export?savedList=${l.id}`,
                    what: `"${l.name}"`,
                  })}>Download</button>{' · '}
                  <button className="link" type="button" onClick={() => rename(l)}>Rename</button>{' · '}
                  <button className="link" type="button" onClick={() => remove(l)}>Delete</button>
                </td>
              </tr>
            ))}
            {data?.individual > 0 && (
              <tr>
                <td>
                  <button className="link" type="button" onClick={() => onOpen({ kind: INDIVIDUAL })}><b>Individually saved leads</b></button>
                  <div className="meta">Rows saved one by one</div>
                </td>
                <td data-l="Leads"><Num n={data.individual} /></td>
                <td>–</td>
                <td><button className="btn" type="button" onClick={() => onOpen({ kind: INDIVIDUAL })}>Open</button></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PeopleView({ source, onBack }) {
  const toast = useToast();
  const session = useSession();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const isList = source.kind === 'list';

  // Saved list: by id. Individual (logged in): the server knows the list. Guest: look up the in-memory ids.
  const guestIds = session.guest ? [...session.saved].join(',') : null;
  const filter = isList ? `savedList=${source.id}` : guestIds ? `ids=${guestIds}` : 'saved=true';
  const load = useCallback(() => {
    if (guestIds === '') return setData({ content: [], totalElements: 0, page: 1, totalPages: 1 });
    api(`/people?${filter}&page=${page}&pageSize=25`).then(setData, (e) => setError(e.message));
  }, [page, guestIds, filter]);
  useEffect(load, [load]);

  async function remove(id) {
    try {
      if (isList) await session.removeFromSavedList(source.id, id);
      else await session.unsave(id);
      if (!session.guest) load();
    } catch (e) {
      toast(e.message);
    }
  }

  async function removeAll() {
    const what = isList ? `the list "${source.name}" with ${fmt(data.totalElements)} leads` : `all ${fmt(data.totalElements)} individually saved leads`;
    if (!window.confirm(`Delete ${what}?`)) return;
    try {
      const r = isList ? await session.deleteSavedList(source.id) : await session.clearSaved();
      toast(`Removed ${fmt(r.removed)} saved leads`);
      if (onBack) return onBack();
      setPage(1);
      if (!session.guest) load();
    } catch (e) {
      toast(e.message);
    }
  }

  const title = isList ? source.name : session.guest ? 'saved leads' : 'Individually saved leads';

  return (
    <section className="view">
      {downloading && <DownloadDialog url={`/api/people/export?${filter}`} what="this list" onClose={() => setDownloading(false)} />}
      <GuestNote what="Saved leads" />
      <div className="bar">
        {onBack && <button className="btn" type="button" onClick={onBack}>← Saved searches</button>}
        <div className="count">
          {data ? <>{isList || !session.guest ? <b>{title}</b> : null} <Num n={data.totalElements} /> {isList || !session.guest ? 'leads' : 'saved leads'}</> : 'Loading…'}
          {isList && source.summary && <span>{source.summary}</span>}
        </div>
        <div className="spacer" />
        <button className="btn" type="button" disabled={!data?.totalElements} onClick={removeAll}>{isList ? 'Delete list' : 'Remove all'}</button>
        <button
          className="btn primary"
          type="button"
          disabled={!data?.totalElements}
          onClick={() => setDownloading(true)}
        >
          Download {isList ? 'list' : 'saved leads'}
        </button>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Company</th><th>Location</th><th>Seniority</th><th>Contact</th><th /></tr></thead>
          <tbody>
            {error && <tr><td colSpan={6} className="empty">{error}</td></tr>}
            {data && !data.content.length && (
              <tr><td colSpan={6} className="empty">No saved leads here.</td></tr>
            )}
            {data?.content.map((p) => (
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
                <td><button className="link" type="button" onClick={() => remove(p.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </section>
  );
}
