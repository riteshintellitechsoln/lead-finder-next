'use client';
import { useCallback, useEffect, useState } from 'react';
import GuestNote from '@/components/GuestNote';
import Pager from '@/components/Pager';
import PersonCell, { EmailCell } from '@/components/PersonCell';
import { useSession } from '@/components/Session';
import { useToast } from '@/components/Toast';
import { api, download } from '@/lib/api';
import { fmt } from '@/lib/format';
import Num from '@/components/Num';

export default function SavedPage() {
  const toast = useToast();
  const session = useSession();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // Logged in: the server knows the list. Guest: look up the in-memory ids.
  const guestIds = session.guest ? [...session.saved].join(',') : null;
  const filter = guestIds ? `ids=${guestIds}` : 'saved=true';
  const load = useCallback(() => {
    if (guestIds === '') return setData({ content: [], totalElements: 0, page: 1, totalPages: 1 });
    api(`/people?${filter}&page=${page}&pageSize=25`).then(setData, (e) => setError(e.message));
  }, [page, guestIds, filter]);
  useEffect(load, [load]);

  async function remove(id) {
    try {
      await session.unsave(id);
      if (!session.guest) load();
    } catch (e) {
      toast(e.message);
    }
  }

  return (
    <section className="view">
      <GuestNote what="Saved leads" />
      <div className="bar">
        <div className="count">{data ? <><Num n={data.totalElements} /> saved leads</> : 'Loading…'}</div>
        <div className="spacer" />
        <button
          className="btn primary"
          type="button"
          disabled={!data?.totalElements}
          onClick={() => { download(`/api/people/export?${filter}`); toast(`Downloading ${fmt(data.totalElements)} saved leads`); }}
        >
          Download saved leads
        </button>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Company</th><th>Location</th><th>Email</th><th /></tr></thead>
          <tbody>
            {error && <tr><td colSpan={5} className="empty">{error}</td></tr>}
            {data && !data.content.length && (
              <tr><td colSpan={5} className="empty">No saved leads yet. Select people in People and press Save to list.</td></tr>
            )}
            {data?.content.map((p) => (
              <tr key={p.id}>
                <td><PersonCell person={p} /></td>
                <td>{p.company || '–'}</td>
                <td>{p.city || '–'}</td>
                <td><EmailCell email={p.email} /></td>
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
