'use client';
// Filters live in the URL (?industry=Software&tech=AWS...). This hook reads them
// and changes them with history.pushState, so Next.js updates useSearchParams
// without a server round trip, and Back / Forward work.
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { LISTS, MULTI } from '@/lib/filters';

export const VIEW_KEYS = ['page', 'pageSize', 'sortBy', 'sortDir', 'sort'];
const SINGLE = ['q', 'hasEmail', 'hasPhone', 'hasDirect', 'verifiedFrom', 'verifiedTo'];
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function useUrlFilters(basePath) {
  const sp = useSearchParams();
  const spStr = sp.toString();

  const state = useMemo(() => {
    const p = new URLSearchParams(spStr);
    const s = {};
    for (const k of SINGLE) s[k] = p.get(k) || '';
    for (const k of [...MULTI, ...LISTS]) s[k] = p.getAll(k);
    s.sortBy = p.get('sortBy') || '';
    s.sortDir = p.get('sortDir') === 'desc' ? 'desc' : 'asc';
    s.sort = p.get('sort') || '';
    s.pageSize = Number(p.get('pageSize')) || 25;
    s.page = Number(p.get('page')) || 1;
    return s;
  }, [spStr]);

  // Filters only (no page / sort): live counts depend on these alone
  const filterQs = useMemo(() => {
    const p = new URLSearchParams(spStr);
    VIEW_KEYS.forEach((k) => p.delete(k));
    return p.toString();
  }, [spStr]);

  function update(mutate, { keepPage = false } = {}) {
    const p = new URLSearchParams(window.location.search);
    mutate(p);
    if (!keepPage) p.delete('page');
    const qs = p.toString();
    window.history.pushState(null, '', qs ? `${basePath}?${qs}` : basePath);
  }
  const setMulti = (p, key, values) => {
    p.delete(key);
    values.forEach((v) => p.append(key, v));
  };
  const toggle = (key, value) => update((p) => {
    const cur = p.getAll(key);
    const hit = cur.find((v) => same(v, value));
    setMulti(p, key, hit ? cur.filter((v) => v !== hit) : [...cur, value]);
  });
  const addValues = (key, values) => update((p) => {
    for (const v of values) if (!p.getAll(key).some((x) => same(x, v))) p.append(key, v);
  });
  const removeValue = (key, value) => update((p) => setMulti(p, key, p.getAll(key).filter((v) => !same(v, value))));
  const setSingle = (key, value) => update((p) => (value ? p.set(key, value) : p.delete(key)));
  const clearAll = () => update((p) => [...new Set(p.keys())].filter((k) => !VIEW_KEYS.includes(k)).forEach((k) => p.delete(k)));

  return { spStr, state, filterQs, update, toggle, addValues, removeValue, setSingle, clearAll, SINGLE };
}
