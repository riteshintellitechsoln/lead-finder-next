'use client';
// Checkbox list with live counts. With `searchable`, typing asks the server for
// matching options (with counts) instead of filtering in the browser, so it
// works with 50,000 different cities too. `localSearch` filters the given
// options in the browser instead (pages without live counts).
import { useEffect, useState } from 'react';
import { useFetch } from '@/lib/api';
import { fmt } from '@/lib/format';
import Num from '../Num';

export default function FacetChecks({ k, facet = k, items, selected, onToggle, filterQs = '', searchable, localSearch, limit: minLimit = 8, placeholder, exclude }) {
  const [fq, setFq] = useState('');
  const [more, setMore] = useState(false);
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(fq.trim()), 250);
    return () => clearTimeout(t);
  }, [fq]);
  const searchUrl = searchable && debounced ? `/api/people/facets?${filterQs}&facet=${facet}&fq=${encodeURIComponent(debounced)}` : null;
  const search = useFetch(searchUrl);
  const typed = localSearch ? debounced.toLowerCase() : '';
  const base = (searchUrl ? search.data?.facets?.[facet] : items) || [];
  const list = typed ? base.filter((o) => String(o.label ?? o.value).toLowerCase().includes(typed)) : base;
  const filtering = Boolean(searchUrl || typed);
  const sel = new Set(selected.map((s) => s.toLowerCase()));
  const limit = Math.max(minLimit, selected.length);
  const shown = more || filtering ? list : list.slice(0, limit);
  // Selected values with no matches are not in the list; keep them visible
  const missing = filtering ? [] : selected.filter((s) => !list.some((o) => o.value.toLowerCase() === s.toLowerCase()));
  // Typed a value that is not an option: offer to add it as a filter value anyway
  const typedValue = fq.replace(/\s+/g, ' ').trim();
  const lowTyped = typedValue.toLowerCase();
  const canAdd = (searchable || localSearch) && typedValue && !(searchUrl && !search.data)
    && !sel.has(lowTyped) && ![...base, ...list].some((o) => String(o.value).toLowerCase() === lowTyped);
  const add = () => { onToggle(k, typedValue); setFq(''); setDebounced(''); };

  return (
    <>
      {(searchable || localSearch) && (
        <input className="txt" type="search" placeholder={placeholder || `Search ${k}…`} aria-label={placeholder || `Search ${k}`} value={fq}
          onChange={(e) => setFq(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canAdd) { e.preventDefault(); add(); } }} />
      )}
      <div className={'checks' + (exclude ? ' exmode' : '')}>
        {missing.map((v) => (
          <label key={'m' + v}><input type="checkbox" checked onChange={() => onToggle(k, v)} /> {v}<span className="c">0</span></label>
        ))}
        {searchUrl && search.loading && !search.data && <span className="meta">Searching…</span>}
        {canAdd && (
          <button type="button" className="optbtn" onClick={add} title="Not in the list: add it as a filter value">
            + Add “{typedValue}”
          </button>
        )}
        {filtering && !(searchUrl && !search.data) && !list.length && !canAdd && <span className="meta">No match</span>}
        {!filtering && !list.length && <span className="meta">No values</span>}
        {shown.map((o) => (
          <label key={o.value}>
            <input type="checkbox" checked={sel.has(o.value.toLowerCase())} onChange={() => onToggle(k, o.value)} />{' '}
            <span className="ov">{o.label ?? o.value}</span>
            <span className="c">{o.count === undefined ? '…' : o.count === null ? '' : <Num n={o.count} />}</span>
          </label>
        ))}
      </div>
      {!filtering && list.length > limit && (
        <button className="link" type="button" onClick={() => setMore(!more)}>{more ? 'Show less' : `Show all ${fmt(list.length)}${list.length === 100 ? '+' : ''}`}</button>
      )}
    </>
  );
}
