'use client';
// Download credits for users: 1 credit = 1 person downloaded.
//   <CreditsPage />: credit usage (like a billing page), usage details and "ask for credits".
// The time range and the tab live in the URL: /credits?range=30&tab=usage  or  ?range=custom&from=2026-10-01&to=2026-10-31
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, useFetch } from '@/lib/api';
import { describeQuery } from '@/lib/filters';
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

/**
 * "246 credits" button; a click opens a small box: used of given, a bar, credits left,
 * View usage and Add more credits.   <CreditsButton credits={246} />
 */
export function CreditsButton({ credits }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null); // { used, given, pending }
  const [toLeft, setToLeft] = useState(false); // open towards the right when the button is near the left edge
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const ctrl = new AbortController();
    fetch('/api/credits', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setInfo({ used: d.used, given: d.given, pending: d.pending }))
      .catch(() => {});
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { ctrl.abort(); document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const used = info?.used ?? 0;
  const given = info?.given ?? credits;
  return (
    <span className="credpop" ref={box}>
      <button type="button" className={'credbtn' + (credits < 1 ? ' due' : '')} aria-expanded={open} aria-haspopup="dialog"
        onClick={() => { setToLeft((box.current?.getBoundingClientRect().right ?? 999) < 360); setOpen((o) => !o); }} title="1 credit = 1 person downloaded">
        {fmt(credits)} credits
      </button>
      {open && (
        <div className={'credmenu' + (toLeft ? ' left' : '')} role="dialog" aria-label="Credit usage">
          <div className="credtitle">Credit usage</div>
          <div><b>{info ? fmt(used) : '…'}</b> of {fmt(given)} credits used</div>
          <div className="credbar" aria-hidden="true"><i style={{ width: `${given ? Math.min(100, (used / given) * 100) : 0}%` }} /></div>
          <div className="meta credleft">{fmt(credits)} credits left</div>
          {info?.pending && <div className="meta">Your request is waiting for the admin.</div>}
          <div className="credacts">
            <Link className="btn" href="/credits" onClick={() => setOpen(false)}>View usage</Link>
            <Link className="btn add" href="/credits?tab=ask" onClick={() => setOpen(false)}>Add more credits</Link>
          </div>
        </div>
      )}
    </span>
  );
}

const STATUS = { pending: ['Waiting', ''], approved: ['Approved', ' ok'], rejected: ['Rejected', ' due'] };
// Where credits were used. Each kind keeps its own color whatever the time range.
const KINDS = [
  ['people', 'People search'],
  ['selected-people', 'Selected people'],
  ['saved-list', 'Saved search'],
  ['saved-leads', 'Saved leads'],
];
const KIND_LABEL = Object.fromEntries(KINDS);
const KIND_COLOR = Object.fromEntries(KINDS.map(([k], i) => [k, `var(--s${i + 1})`]));
const kindOf = (k) => (k?.startsWith('saved-list') ? 'saved-list' : k || 'people');

const RANGES = [
  ['month', 'This month'],
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['90', 'Last 3 months'],
  ['365', 'Last 12 months'],
  ['all', 'All time'],
  ['custom', 'Custom dates'],
];
const TABS = [['overview', 'Overview'], ['usage', 'Usage details'], ['ask', 'Ask for credits']];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const showDay = (day) => new Date(`${day}T00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// A day on this computer -> the start of that day (+ days) in UTC, like the database
function dayStart(day, plus = 0) {
  if (!DAY.test(day)) return '';
  const t = new Date(`${day}T00:00`);
  t.setDate(t.getDate() + plus);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString().slice(0, 19).replace('T', ' ');
}

/** range -> { from, to } as local days ('' = open end) */
function rangeDays(range, from, to) {
  const today = new Date();
  if (range === 'custom') return { from: DAY.test(from) ? from : '', to: DAY.test(to) ? to : '' };
  if (range === 'all') return { from: '', to: '' };
  if (range === 'month') return { from: localDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: localDay(today) };
  const start = new Date(today);
  start.setDate(start.getDate() - Number(range) + 1);
  return { from: localDay(start), to: localDay(today) };
}

const signed = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');

function toCsv(rows) {
  const cell = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [['Date', 'What', 'Details', 'Credits'], ...rows.map((r) => [
    formatDateTime(r.at),
    r.type === 'download' ? `Download: ${KIND_LABEL[kindOf(r.kind)]}` : (r.credits > 0 ? 'Credits given' : 'Credits removed'),
    r.type === 'download' ? describeQuery(r.query) : r.note || '',
    r.credits,
  ])];
  return `﻿${lines.map((l) => l.map(cell).join(',')).join('\r\n')}\r\n`;
}

/**
 * Ring split into parts: [{ key, label, value, color }].
 * withAvailable: the rest of the ring is the credits still available (Features view);
 * without it the parts fill the whole ring (Action view: how the used credits split).
 */
function Donut({ parts, available, used, unlimited, withAvailable = true, active, onActive }) {
  const wrap = useRef(null);
  const [tip, setTip] = useState(null); // { x, y } of the pointer inside the ring box
  const R = 70;
  const C = 2 * Math.PI * R;
  const rest = withAvailable && !unlimited ? [{ key: 'available', label: 'Available', value: available, color: 'var(--chip)' }] : [];
  const all = [...parts, ...rest].filter((p) => p.value > 0);
  const total = all.reduce((n, p) => n + p.value, 0);
  const GAP = all.length > 1 ? 2 : 0; // 2px gap between parts
  let at = 0;
  const arcs = [];
  for (const p of all) {
    const len = (p.value / total) * C;
    arcs.push({ ...p, dash: `${Math.max(len - GAP, 0.5)} ${C}`, offset: -at, pct: (p.value / total) * 100, mid: at + len / 2 });
    at += len;
  }
  const on = arcs.find((a) => a.key === active);
  const pctText = (p) => (p >= 99.95 ? '100%' : p < 0.1 ? '<0.1%' : `${p.toFixed(p < 10 ? 1 : 0)}%`);

  function point(e, key) {
    const r = wrap.current.getBoundingClientRect();
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top });
    onActive(key);
  }
  // Keyboard: put the tip on the middle of the part
  function focusTip(a) {
    const box = wrap.current.getBoundingClientRect();
    const angle = (a.mid / C) * 2 * Math.PI - Math.PI / 2;
    const scale = box.width / 180;
    setTip({ x: (90 + Math.cos(angle) * R) * scale, y: (90 + Math.sin(angle) * R) * scale });
    onActive(a.key);
  }
  const leave = () => { setTip(null); onActive(null); };

  return (
    <div className="donut" ref={wrap} onMouseLeave={leave}>
      <svg viewBox="0 0 180 180" role="img" aria-label={`${fmt(used)} credits used${unlimited ? '' : `, ${fmt(available)} available`}`}>
        <circle cx="90" cy="90" r={R} fill="none" stroke="var(--chip)" strokeWidth="18" />
        {/* Soft ring around the part under the pointer */}
        {on && (
          <circle cx="90" cy="90" r={R} fill="none" stroke={on.color} strokeWidth="34" opacity="0.25"
            strokeDasharray={on.dash} strokeDashoffset={on.offset} transform="rotate(-90 90 90)" pointerEvents="none" />
        )}
        {arcs.map((a) => (
          <circle key={a.key} cx="90" cy="90" r={R} fill="none" stroke={a.color} strokeWidth="18" className="arc"
            opacity={active && active !== a.key ? 0.45 : 1}
            strokeDasharray={a.dash} strokeDashoffset={a.offset} transform="rotate(-90 90 90)"
            tabIndex={0} aria-label={`${a.label}: ${fmt(a.value)} credits, ${pctText(a.pct)}`}
            onMouseMove={(e) => point(e, a.key)} onFocus={() => focusTip(a)} onBlur={leave} />
        ))}
      </svg>
      {on && tip && (
        <div className="donut-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          <b>{on.label}</b>
          <span>{fmt(on.value)} {on.value === 1 ? 'credit' : 'credits'} · {pctText(on.pct)}</span>
        </div>
      )}
      <div className="donut-mid">
        <b>{fmt(used)}{unlimited ? '' : ` of ${fmt(used + available)}`}</b>
        <span className="meta">credits used</span>
      </div>
    </div>
  );
}

function Legend({ items, active, onActive }) {
  return (
    <ul className="legend" onMouseLeave={() => onActive(null)}>
      {items.map((i) => (
        <li key={i.key} className={active === i.key ? 'on' : ''} onMouseEnter={() => onActive(i.key)}>
          <i style={{ background: i.color }} aria-hidden="true" />
          <div>
            <div className="nm">{i.label}</div>
            <div className="meta">{fmt(i.value)} {i.value === 1 ? 'credit' : 'credits'}{i.sub && ` · ${i.sub}`}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function CreditsPage() {
  const toast = useToast();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const tab = TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'overview';
  const range = RANGES.some(([k]) => k === sp.get('range')) ? sp.get('range') : 'month';
  const days = rangeDays(range, sp.get('from') || '', sp.get('to') || '');
  const badRange = Boolean(days.from && days.to && days.from > days.to);

  const params = new URLSearchParams();
  if (dayStart(days.from)) params.set('from', dayStart(days.from));
  if (dayStart(days.to, 1)) params.set('to', dayStart(days.to, 1));
  const { data, error, retry } = useFetch(badRange ? null : `/api/credits?${params}`);

  const [view, setView] = useState('features'); // overview card: by feature or by action
  const [active, setActive] = useState(null); // the part under the pointer, in the ring and the list
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  function setUrl(changes) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    if (next.get('tab') === 'overview') next.delete('tab');
    if (next.get('range') === 'month') next.delete('range');
    if (next.get('range') !== 'custom') { next.delete('from'); next.delete('to'); }
    const qs = next.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }
  function pickRange(value) {
    // Custom starts from the dates shown now, so nothing jumps
    setUrl(value === 'custom' ? { range: value, from: days.from || localDay(new Date()), to: days.to || localDay(new Date()) } : { range: value });
  }

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

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(data.activity)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit-usage-${days.from || 'start'}-to-${days.to || localDay(new Date())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const rangeText = days.from || days.to
    ? `${days.from ? showDay(days.from) : 'the start'} – ${days.to ? showDay(days.to) : 'today'}`
    : 'All time';

  const bar = (
    <div className="card creditbar">
      <div className="tabs" role="tablist" aria-label="Credits">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setUrl({ tab: k })}>{label}</button>
        ))}
      </div>
      {tab !== 'ask' && (
        <div className="rangebox">
          <label className="lbl" htmlFor="creditRange">Date</label>
          <select id="creditRange" className="txt" value={range} onChange={(e) => pickRange(e.target.value)}>
            {RANGES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          {range === 'custom' && (
            <>
              <input className="txt" type="date" aria-label="From" max={days.to || undefined} value={days.from} onChange={(e) => setUrl({ from: e.target.value })} />
              <span className="meta">to</span>
              <input className="txt" type="date" aria-label="To" min={days.from || undefined} value={days.to} onChange={(e) => setUrl({ to: e.target.value })} />
            </>
          )}
          {range !== 'custom' && <span className="meta">{rangeText}</span>}
          {tab === 'usage' && data && (
            <button className="btn" type="button" onClick={exportCsv} disabled={!data.activity.length} title="Download this list as a CSV file">Export CSV</button>
          )}
        </div>
      )}
    </div>
  );

  if (badRange) return <section className="view">{bar}<div className="card" role="alert">The From date is after the To date.</div></section>;
  if (error) return <section className="view">{bar}<div className="card">Could not load credits: {error} <button className="link" type="button" onClick={retry}>Try again</button></div></section>;
  if (!data) return <section className="view">{bar}<div className="card meta">Loading…</div></section>;

  const { period } = data;
  const used = new Map(period.byKind.map((k) => [kindOf(k.kind), k]));
  const parts = KINDS.map(([k, label]) => ({ key: k, label, value: used.get(k)?.credits || 0, color: KIND_COLOR[k], sub: used.get(k) ? `${fmt(used.get(k).downloads)} ${used.get(k).downloads === 1 ? 'download' : 'downloads'}` : '' }));
  const featureItems = [
    ...(data.unlimited ? [] : [{ key: 'available', label: 'Available', value: data.credits, color: 'var(--chip)' }]),
    ...parts.filter((p) => p.value),
  ];
  // What the credits were spent on. Today the only action is downloading people as CSV.
  const actionItems = period.used
    ? [{ key: 'download', label: 'People downloaded (CSV)', value: period.used, color: 'var(--s1)', sub: `${fmt(period.downloads)} ${period.downloads === 1 ? 'download' : 'downloads'}` }]
    : [];
  const shown = view === 'features' ? featureItems : actionItems;

  return (
    <section className="view">
      {bar}

      {tab === 'overview' && (
        <div className="grid2">
          <div className="card">
            <h3>Credit usage</h3>
            <div className="meta">{rangeText}</div>
            <div className="usage">
              <Donut parts={view === 'features' ? parts : actionItems} available={data.credits} used={period.used}
                unlimited={data.unlimited} withAvailable={view === 'features'} active={active} onActive={setActive} />
              <div className="usageside">
                <div className="switch" role="group" aria-label="Show credits by">
                  <button type="button" className={view === 'features' ? 'on' : ''} aria-pressed={view === 'features'} onClick={() => setView('features')}>Features</button>
                  <button type="button" className={view === 'actions' ? 'on' : ''} aria-pressed={view === 'actions'} onClick={() => setView('actions')}>Action</button>
                </div>
                <Legend items={shown} active={active} onActive={setActive} />
                {!period.used && <div className="meta">No credits used in this time.</div>}
                {view === 'actions' && (period.received > 0 || period.removed > 0) && (
                  <div className="meta">
                    In this time the admin gave you {fmt(period.received)} credits{period.removed ? ` and took back ${fmt(period.removed)}` : ''}.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card overview">
            <h3>Overview</h3>
            <div className="availbox">
              <div className="meta">Available credits</div>
              {data.unlimited ? (
                <div className="big">Unlimited</div>
              ) : (
                <div className="big"><Num n={data.credits} /><span> / {fmt(data.given)}</span></div>
              )}
              <div className="meta">{data.unlimited ? 'Admins download without credits.' : `${fmt(data.used)} used so far. 1 credit = 1 person downloaded.`}</div>
              {data.pending && <div className="meta"><b>Request waiting:</b> the admin will answer it soon.</div>}
            </div>
            {!data.unlimited && (
              <div className="availacts">
                <button className="btn add" type="button" onClick={() => setUrl({ tab: 'ask' })}>Add more credits</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'overview' && !data.unlimited && (
        <div className="card infocard">
          <h3>Information</h3>
          <div className="infobody">
            <div className="infohead">Need more credits?</div>
            <p>
              Ask the admin for the number of people you want to download. Once the admin approves,
              the credits are added here and you can use them any time. 1 credit = 1 person downloaded.
            </p>
            <div className="infoacts">
              {data.pending
                ? <span className="pill">Your request is waiting for the admin</span>
                : <button className="btn add" type="button" onClick={() => setUrl({ tab: 'ask' })}>Ask for credits</button>}
              <button className="btn" type="button" onClick={() => setUrl({ tab: 'usage' })}>See usage details</button>
            </div>

            <hr />
            <div className="infohead">Request summary</div>
            <p>
              Requests sent: {fmt(data.requests.length)} · Credits received: {fmt(data.requests.reduce((n, r) => n + (r.status === 'approved' && r.granted > 0 ? r.granted : 0), 0))}
            </p>
            <table className="infotable">
              <thead><tr><th>Date</th><th className="num">Asked</th><th className="num">Given</th><th>Status</th></tr></thead>
              <tbody>
                {!data.requests.length && <tr><td colSpan={4} className="empty">No requests yet</td></tr>}
                {data.requests.slice(0, 5).map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.created_at)}</td>
                    <td className="num">{fmt(r.amount)}</td>
                    <td className="num">{r.granted == null ? '–' : signed(r.granted)}</td>
                    <td><span className={'pill' + STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0] || r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.requests.length > 5 && (
              <button className="link" type="button" onClick={() => setUrl({ tab: 'ask' })}>See all {fmt(data.requests.length)} requests</button>
            )}
          </div>
        </div>
      )}

      {tab === 'usage' && (
        <div className="card">
          <h3>Usage details</h3>
          <div className="meta">{rangeText} · {fmt(period.used)} credits used in {fmt(period.downloads)} downloads{period.received ? ` · ${fmt(period.received)} given by the admin` : ''}</div>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Date</th><th>What</th><th>Details</th><th className="num">Credits</th></tr></thead>
              <tbody>
                {!data.activity.length && <tr><td colSpan={4} className="empty">Nothing in this time</td></tr>}
                {data.activity.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.at)}</td>
                    <td>
                      {r.type === 'download'
                        ? <><i className="dot" style={{ background: KIND_COLOR[kindOf(r.kind)] }} aria-hidden="true" />Download: {KIND_LABEL[kindOf(r.kind)]}</>
                        : (r.credits > 0 ? 'Credits given' : 'Credits removed')}
                    </td>
                    <td className="meta">{r.type === 'download' ? (describeQuery(r.query) || 'All people') : r.note || '–'}</td>
                    <td className={'num' + (r.credits > 0 ? ' plus' : '')}>{signed(r.credits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.activity.length >= 500 && <div className="meta">Showing the latest entries. Pick a shorter time to see older ones.</div>}
        </div>
      )}

      {tab === 'ask' && (
        <>
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
                      <td className="num">{r.granted == null ? '–' : signed(r.granted)}</td>
                      <td><span className={'pill' + STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0] || r.status}</span>{r.admin_note && <div className="meta">{r.admin_note}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
