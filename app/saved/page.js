'use client';
import { useCallback, useEffect, useState } from 'react';
import Pager from '@/components/Pager';
import PersonCell, { EmailCell } from '@/components/PersonCell';
import { useToast } from '@/components/Toast';
import { api, download, notifyStatsChanged } from '@/lib/api';
import { fmt } from '@/lib/format';

export default function SavedPage() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/people?saved=true&page=${page}&pageSize=25`).then(setData, (e) => setError(e.message));
  }, [page]);
  useEffect(load, [load]);

  async function remove(id) {
    try {
      await api('/saved/' + id, { method: 'DELETE' });
      notifyStatsChanged();
      load();
    } catch (e) {
      toast(e.message);
    }
  }

  return (
    <section className="view">
      <div className="bar">
        <div className="count">{data ? `${fmt(data.totalElements)} saved leads` : 'Loading…'}</div>
        <div className="spacer" />
        <button
          className="btn primary"
          type="button"
          disabled={!data?.totalElements}
          onClick={() => { download('/api/people/export?saved=true'); toast('Downloading saved leads'); }}
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
