'use client';
// "Upload countries": a CSV / TXT of country names is read in the browser and each
// name that matches a known country is ticked in the Country filter. Countries are
// one short fixed list, so nothing has to be stored on the server (unlike ListFilter).
import { useRef } from 'react';
import { MAX_VALUES } from '@/lib/filters';
import { fmt } from '@/lib/format';
import { useToast } from '../Toast';

const key = (v) => v.replace(/\s+/g, ' ').trim().toLowerCase();
const HEADER = /^(person|contact|company)?\s*country(\s*name)?$/i;

// One CSV line -> cells (quotes "..." may hold commas)
function cells(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Country names in a file: the "Country" column when there is one, else every cell. */
export function countriesIn(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = cells(lines[0]);
  const col = head.findIndex((h) => HEADER.test(h));
  if (col >= 0) return lines.slice(1).map((l) => cells(l)[col] || '').filter(Boolean);
  return lines.flatMap(cells).filter(Boolean);
}

export default function CountryUpload({ known, selected, addValues }) {
  const toast = useToast();
  const fileRef = useRef();

  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) return toast('Excel files: use File > Save As > CSV UTF-8, then upload the CSV');
    if (file.size > 5 * 1048576) return toast('Country file is too big (max 5 MB)');
    const byKey = new Map(known.map((c) => [key(c), c]));
    const found = new Map();
    const unknown = new Set();
    for (const raw of countriesIn(await file.text())) {
      const hit = byKey.get(key(raw));
      if (hit) found.set(hit, true); else if (!HEADER.test(raw)) unknown.add(raw);
    }
    const have = new Set(selected.map(key));
    const fresh = [...found.keys()].filter((c) => !have.has(key(c)));
    const room = Math.max(0, MAX_VALUES - selected.length);
    const add = fresh.slice(0, room);
    if (add.length) addValues('country', add);
    const parts = [add.length ? `Added ${fmt(add.length)} ${add.length === 1 ? 'country' : 'countries'}` : 'No new countries added'];
    if (fresh.length > add.length) parts.push(`${fmt(fresh.length - add.length)} skipped (max ${MAX_VALUES})`);
    if (unknown.size) {
      const sample = [...unknown].slice(0, 3).join(', ');
      parts.push(`${fmt(unknown.size)} not recognised: ${sample}${unknown.size > 3 ? '…' : ''}`);
    }
    toast(parts.join(' · '));
  }

  return (
    <div className="lfup">
      <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={onFile} />
      <button className="link" type="button" onClick={() => fileRef.current.click()}>⇪ Upload countries (CSV / TXT)</button>
      <span className="meta">One per line, or a Country column</span>
    </div>
  );
}
