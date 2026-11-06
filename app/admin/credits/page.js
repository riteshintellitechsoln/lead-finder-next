'use client';
// Credit requests: users ask for download credits, the admin decides how many to give.
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { api, notifyStatsChanged } from '@/lib/api';
import { fmt, formatDateTime } from '@/lib/format';

const STATUS = { pending: ['Waiting', ''], approved: ['Approved', ' ok'], rejected: ['Rejected', ' due'] };

export default function AdminCreditsPage() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [give, setGive] = useState({}); // request id -> credits typed by the admin
  const [notes, setNotes] = useState({});

  const load = useCallback(() => api('/admin/credits').then(setRows, (e) => toast(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);

  async function decide(r, action) {
    const amount = give[r.id] ?? r.amount;
    if (action === 'approve' && !(Number(amount) >= 1)) return toast('Enter how many credits to give (1 or more)');
    if (action === 'reject' && !window.confirm(`Reject the request from ${r.email}?`)) return;
    try {
      const out = await api(`/admin/credits/${r.id}`, { method: 'PATCH', body: { action, amount: Number(amount), note: notes[r.id] || '' } });
      toast(action === 'approve' ? `Gave ${fmt(out.granted)} credits to ${r.email}. They now have ${fmt(out.credits)}.` : 'Request rejected');
      notifyStatsChanged();
      load();
    } catch (e) {
      toast(e.message);
    }
  }

  const pending = rows?.filter((r) => r.status === 'pending') || [];
  const done = rows?.filter((r) => r.status !== 'pending') || [];

  return (
    <section className="view">
      <div className="card">
        <h3>Waiting for you {pending.length > 0 && <span className="pill accent">{fmt(pending.length)}</span>}</h3>
        <div className="meta">1 credit = 1 person downloaded. Change the number to give more or less than asked.</div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>User</th><th>Asked</th><th>Has now</th><th>Downloaded</th><th>Asked on</th><th>Give</th><th /></tr></thead>
            <tbody>
              {!rows && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
              {rows && !pending.length && <tr><td colSpan={7} className="empty">No requests waiting</td></tr>}
              {pending.map((r) => (
                <tr key={r.id}>
                  <td><div className="co">{r.name || '–'}</div><div className="meta">{r.email}</div>{r.note && <div className="meta">“{r.note}”</div>}</td>
                  <td className="num">{fmt(r.amount)}</td>
                  <td className="num">{fmt(r.credits)}</td>
                  <td className="num">{fmt(r.downloaded)}</td>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td>
                    <input className="txt num" type="number" min={1} step={1} aria-label={`Credits to give ${r.email}`} style={{ width: 120 }}
                      value={give[r.id] ?? r.amount} onChange={(e) => setGive({ ...give, [r.id]: e.target.value })} />
                    <input className="txt" placeholder="Note to user (optional)" aria-label="Note to user" maxLength={500} style={{ marginTop: 4 }}
                      value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  </td>
                  <td>
                    <div className="rowacts">
                      <button className="btn primary" type="button" onClick={() => decide(r, 'approve')}>Approve</button>
                      <button className="link danger" type="button" onClick={() => decide(r, 'reject')}>Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>History</h3>
        <div className="tablewrap">
          <table>
            <thead><tr><th>User</th><th>Asked</th><th>Given</th><th>Status</th><th>Asked on</th><th>Answered</th></tr></thead>
            <tbody>
              {rows && !done.length && <tr><td colSpan={6} className="empty">Nothing yet</td></tr>}
              {done.map((r) => (
                <tr key={r.id}>
                  <td><div className="co">{r.name || '–'}</div><div className="meta">{r.email}</div>{r.note && <div className="meta">“{r.note}”</div>}</td>
                  <td className="num">{fmt(r.amount)}</td>
                  <td className="num">{fmt(r.granted)}</td>
                  <td><span className={'pill' + (STATUS[r.status]?.[1] || '')}>{STATUS[r.status]?.[0] || r.status}</span>{r.admin_note && <div className="meta">{r.admin_note}</div>}</td>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td>{formatDateTime(r.decided_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
