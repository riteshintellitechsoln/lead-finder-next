'use client';
// Download credits for users: 1 credit = 1 person downloaded.
//   <CreditsPage />: balance, "ask for credits" form, request + download history.
import { useEffect, useState } from 'react';
import { api, useFetch } from '@/lib/api';
import { fmt, formatDateTime } from '@/lib/format';
import Num from './Num';
import { useToast } from './Toast';

/** My credits: { credits, unlimited } (null while loading or for guests). Refreshes after each download. */
export function useCredits(enabled = true) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const load = () => fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setState({ credits: s.credits ?? null, unlimited: s.credits == null }))
      .catch(() => {});
    load();
    window.addEventListener('stats-changed', load);
    return () => window.removeEventListener('stats-changed', load);
  }, [enabled]);
  return enabled ? state : null;
}

const STATUS = { pending: ['Waiting', ''], approved: ['Approved', ' ok'], rejected: ['Rejected', ' due'] };
const KIND = { people: 'Search results', 'selected-people': 'Selected people', 'saved-leads': 'Saved leads' };

export default function CreditsPage() {
  const toast = useToast();
  const { data, error, retry } = useFetch('/api/credits');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/credits', { method: 'POST', body: { amount: Number(amount), note } });
      toast('Request sent. The admin will decide how many credits to give you.');
      setAmount('');
      setNote('');
      retry();
    } catch (err) {
      toast(err.message);
    }
    setBusy(false);
  }

  if (error) return <section className="view"><div className="card">Could not load credits: {error} <button className="link" type="button" onClick={retry}>Try again</button></div></section>;
  if (!data) return <section className="view"><div className="card meta">Loading…</div></section>;

  return (
    <section className="view">
      <div className="stats">
        <div className="card stat"><div className="k">Credits left</div><div className="v">{data.unlimited ? 'Unlimited' : <Num n={data.credits} />}</div><div className="meta">1 credit = 1 person downloaded</div></div>
        <div className="card stat"><div className="k">Downloaded so far</div><div className="v"><Num n={data.used} /></div><div className="meta">people, in {fmt(data.downloads.length)} downloads</div></div>
      </div>

      {!data.unlimited && (
        <div className="card">
          <h3>Ask for credits</h3>
          {data.pending ? (
            <div className="meta">Your request is waiting for the admin. You can send a new one after it is answered.</div>
          ) : (
            <form className="creditform" onSubmit={send}>
              <input className="txt" type="number" min={1} step={1} required placeholder="How many people do you need?" aria-label="Credits wanted"
                value={amount} onChange={(e) => setAmount(e.target.value)} />
              <input className="txt" placeholder="Why / for what (optional)" aria-label="Note for the admin" maxLength={500}
                value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
            </form>
          )}
          <div className="meta">The admin decides how many credits you get. Use them whenever you like: all at once, or a few at a time.</div>
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <h3>My requests</h3>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Date</th><th>Asked</th><th>Given</th><th>Status</th></tr></thead>
              <tbody>
                {!data.requests.length && <tr><td colSpan={4} className="empty">No requests yet</td></tr>}
                {data.requests.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.created_at)}{r.note && <div className="meta">{r.note}</div>}</td>
                    <td className="num">{fmt(r.amount)}</td>
                    <td className="num">{r.granted == null ? '–' : fmt(r.granted)}</td>
                    <td><span className={'pill' + STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0] || r.status}</span>{r.admin_note && <div className="meta">{r.admin_note}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>My downloads</h3>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Date</th><th>What</th><th>People</th></tr></thead>
              <tbody>
                {!data.downloads.length && <tr><td colSpan={3} className="empty">No downloads yet</td></tr>}
                {data.downloads.map((d) => (
                  <tr key={d.id}>
                    <td>{formatDateTime(d.created_at)}</td>
                    <td>{KIND[d.kind] || (d.kind?.startsWith('saved-list') ? 'Saved list' : d.kind || '–')}</td>
                    <td className="num">{fmt(d.row_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
