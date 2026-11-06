'use client';
// One include / exclude box (job titles, company names, domains, emails, zip codes).
//  * type a value and press Enter, or paste many at once ("CEO, CTO, Founder"
//    or one per line): each becomes its own chip
//  * Upload a CSV / TXT file of any size (4 lakh+ rows): it is stored on the
//    server (POST /api/lists) and the URL only keeps its id
// More than MAX_VALUES pasted values are uploaded as a list automatically.
import { useRef, useState } from 'react';
import { LIST_FIELDS, MAX_LISTS, MAX_VALUES, splitValues } from '@/lib/filters';
import { useFetch } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useToast } from '../Toast';
import { useSession } from '../Session';
import Num from '../Num';

export default function ListFilter({ kind, state, url, lists, onListCreated, placeholder, chipCount, suggest, suggestions, hint }) {
  const cfg = LIST_FIELDS[kind];
  const toast = useToast();
  const session = useSession();
  const fileRef = useRef();
  const [mode, setMode] = useState('inc');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const valueKey = mode === 'inc' ? cfg.inc : cfg.exc;
  const listKey = mode === 'inc' ? cfg.list : cfg.notList;
  const signedIn = Boolean(session.user);

  // Suggestions while typing (e.g. company names from /api/companies)
  const suggestUrl = suggest && text.trim().length >= 2 && !/[\n,;]/.test(text) ? suggest(text.trim()) : null;
  const sug = useFetch(suggestUrl, { debounce: 200 });
  const listId = `sug-${kind}`;

  async function upload(body, name, format) {
    if (!signedIn) return toast('Sign in to upload a file');
    if (state[listKey].length >= MAX_LISTS) return toast(`Up to ${MAX_LISTS} files per box. Remove one first.`);
    setBusy(true);
    try {
      const res = await fetch(`/api/lists?kind=${kind}&format=${format}&name=${encodeURIComponent(name)}`, { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
      onListCreated?.(data);
      url.addValues(listKey, [data.id]);
      toast(`${mode === 'inc' ? 'Including' : 'Excluding'} ${fmt(data.size)} values from ${data.name}`
        + (data.matched != null ? ` (${fmt(data.matched)} found in the data)` : ''));
    } catch (e) {
      toast(e.message);
    }
    setBusy(false);
  }

  function add(raw) {
    const values = splitValues(kind, raw);
    if (!values.length) return;
    setText('');
    if (state[valueKey].length + values.length > MAX_VALUES) {
      if (!signedIn) {
        url.addValues(valueKey, values.slice(0, Math.max(0, MAX_VALUES - state[valueKey].length)));
        return toast(`Added the first ${MAX_VALUES}. Sign in to use longer lists (any size).`);
      }
      // Too many for the URL: keep them on the server like an uploaded file
      return upload(new Blob([values.join('\n')], { type: 'text/plain' }), `Pasted ${cfg.label.toLowerCase()}s (${fmt(values.length)})`, 'lines');
    }
    url.addValues(valueKey, values);
  }

  function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) return toast('Excel files: use File > Save As > CSV UTF-8, then upload the CSV');
    upload(file, file.name, /\.csv$/i.test(file.name) ? 'csv' : 'lines');
  }

  const chips = (key, ex) => state[key].map((v) => (
    <span key={key + v} className={'chip' + (ex ? ' ex' : '')}>
      {v}
      {chipCount?.(v) !== undefined && <span className="cc"><Num n={chipCount(v)} /></span>}
      <button type="button" aria-label={`Remove ${v}`} onClick={() => url.removeValue(key, v)}>×</button>
    </span>
  ));
  const listChips = (key, ex) => state[key].map((id) => {
    const m = lists?.[id];
    return (
      <span key={id} className={'chip file' + (ex ? ' ex' : '')} title={m ? `${fmt(m.size)} values${m.matched != null ? `, ${fmt(m.matched)} found in the data` : ''}` : 'Uploaded list'}>
        <span aria-hidden="true">▤</span> {m?.name || 'Uploaded list'}
        {m && <span className="cc">{fmt(m.size)}</span>}
        <button type="button" aria-label="Remove list" onClick={() => url.removeValue(key, id)}>×</button>
      </span>
    );
  });
  const incN = state[cfg.inc].length + state[cfg.list].length;
  const excN = state[cfg.exc].length + state[cfg.notList].length;

  return (
    <div className="lf">
      <div className="seg" role="tablist" aria-label={`${cfg.label}: include or exclude`}>
        <button type="button" role="tab" aria-selected={mode === 'inc'} className={mode === 'inc' ? 'on' : ''} onClick={() => setMode('inc')}>
          Include{incN ? ` (${incN})` : ''}
        </button>
        <button type="button" role="tab" aria-selected={mode === 'exc'} className={mode === 'exc' ? 'on ex' : ''} onClick={() => setMode('exc')}>
          Exclude{excN ? ` (${excN})` : ''}
        </button>
      </div>
      <div className="lfin">
        <input className="txt" placeholder={placeholder} aria-label={`${cfg.label} to ${mode === 'inc' ? 'include' : 'exclude'}`}
          autoComplete="off" list={suggest || suggestions ? listId : undefined} value={text} disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text); } }}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (/[\r\n,;\t]/.test(t)) { e.preventDefault(); add(t); }
          }} />
        <button className="btn sm" type="button" disabled={busy || !text.trim()} onClick={() => add(text)}>Add</button>
      </div>
      {suggest && (
        <datalist id={listId}>{(sug.data?.content || []).map((c) => <option key={c.company} value={c.company} />)}</datalist>
      )}
      {!suggest && suggestions && <datalist id={listId}>{suggestions.map((t) => <option key={t} value={t} />)}</datalist>}
      <div className="lfup">
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={onFile} />
        <button className="link" type="button" disabled={busy} onClick={() => (signedIn ? fileRef.current.click() : toast('Sign in to upload a file'))}>
          {busy ? 'Uploading…' : `⇪ Upload CSV / TXT to ${mode === 'inc' ? 'include' : 'exclude'}`}
        </button>
        <span className="meta">{hint || 'Comma or one per line'}</span>
      </div>
      {(incN > 0 || excN > 0) && (
        <div className="chips">
          {chips(cfg.inc)}{listChips(cfg.list)}
          {chips(cfg.exc, true)}{listChips(cfg.notList, true)}
        </div>
      )}
    </div>
  );
}
