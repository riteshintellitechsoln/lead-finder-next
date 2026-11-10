// People filters, shared by the browser and the server. Filters always live in
// the URL query string (bookmarkable, Back works), e.g.
//   /people?personTitles=HR+Manager&city=Pune&employees=51-200&hasEmail=true&sortBy=name
// Multi-value filters repeat the key. Unknown keys are ignored.
// Big lists (a file with 4 lakh company names) do not fit in a URL: they are
// uploaded once (POST /api/lists) and the URL carries the list id, e.g. companyList=k3x9...

import { FUNCTIONS, SIZE_KEYS } from './options.js';

export { SIZE_KEYS };
export const REVENUE_KEYS = ['0-1M', '1M-10M', '10M-50M', '50M-100M', '100M-500M', '500M-1B', '1B+'];
export const EMAIL_STATUSES = ['Verified', 'Catch-all', 'Guessed', 'Unverified', 'Invalid'];
export const DEPARTMENTS = FUNCTIONS; // shown as "Function"
export const SORTS = ['name', 'title', 'company', 'city', 'seniority', 'employees', 'revenue', 'verified', 'updated'];
export const PAGE_SIZES = [10, 25, 50, 100];
export const MAX_VALUES = 100; // per multi-value filter in the URL; more -> upload as a list
export const MAX_LISTS = 5; // uploaded lists per include / exclude box
const MAX_TEXT = 200;

// Include / exclude boxes that take typed values, pasted values and uploaded files.
//   inc / exc: typed values (repeated URL key)   list / notList: uploaded list ids
export const LIST_FIELDS = {
  title: { inc: 'personTitles', exc: 'personNotTitles', list: 'titleList', notList: 'titleNotList', label: 'Job title' },
  company: { inc: 'company', exc: 'companyNot', list: 'companyList', notList: 'companyNotList', label: 'Company' },
  domain: { inc: 'domain', exc: 'domainNot', list: 'domainList', notList: 'domainNotList', label: 'Domain' },
  email: { inc: 'email', exc: 'emailNot', list: 'emailList', notList: 'emailNotList', label: 'Email' },
  zip: { inc: 'zip', exc: 'zipNot', list: 'zipList', notList: 'zipNotList', label: 'Zip code' },
};
export const LIST_KINDS = Object.keys(LIST_FIELDS);

// Values picked from a list of options (checkboxes)
const PICK = ['department', 'seniority', 'industry', 'country', 'state', 'county', 'city', 'employees', 'revenue', 'emailStatus', 'tech', 'techNot'];
export const MULTI = [...LIST_KINDS.flatMap((k) => [LIST_FIELDS[k].inc, LIST_FIELDS[k].exc]), ...PICK];
export const LISTS = LIST_KINDS.flatMap((k) => [LIST_FIELDS[k].list, LIST_FIELDS[k].notList]);
const BOOL = ['hasEmail', 'hasPhone', 'hasDirect'];
const DATES = ['verifiedFrom', 'verifiedTo'];
const TEXT = ['q', ...BOOL, ...DATES];

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
const LIST_ID = /^[a-z0-9]{10,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A typed value -> the form it is stored and matched in */
export function normalizeValue(kind, v) {
  const s = clean(v);
  if (kind === 'email') return s.toLowerCase();
  if (kind === 'domain') return s.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  if (kind === 'zip') return s.replace(/\s+/g, '').toUpperCase();
  return s;
}

// "CEO, CTO\nFounder" -> ['CEO', 'CTO', 'Founder']. Company names may contain
// commas ("Tata Sons, Ltd"), so for them only new lines, ";" and tabs separate.
export function splitValues(kind, text) {
  const sep = kind === 'company' ? /[\r\n;\t]+/ : /[\r\n,;\t]+/;
  const seen = new Set();
  const out = [];
  for (const raw of String(text || '').split(sep)) {
    const v = normalizeValue(kind, raw);
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

const KIND_OF = Object.fromEntries(LIST_KINDS.flatMap((k) => [[LIST_FIELDS[k].inc, k], [LIST_FIELDS[k].exc, k]]));

export function emptyFilters() {
  const f = {};
  for (const k of TEXT) f[k] = '';
  for (const k of [...MULTI, ...LISTS]) f[k] = [];
  return f;
}

/** URLSearchParams -> normalized filters */
export function parseFilters(sp) {
  const f = emptyFilters();
  for (const k of TEXT) f[k] = clean(sp.get(k));
  for (const k of MULTI) {
    const seen = new Set();
    for (const raw of sp.getAll(k)) {
      const v = KIND_OF[k] ? normalizeValue(KIND_OF[k], raw) : clean(raw);
      if (v && !seen.has(v.toLowerCase())) {
        seen.add(v.toLowerCase());
        f[k].push(v);
      }
    }
    f[k] = f[k].slice(0, MAX_VALUES);
  }
  for (const k of LISTS) f[k] = [...new Set(sp.getAll(k).filter((v) => LIST_ID.test(v)))].slice(0, MAX_LISTS);
  for (const k of BOOL) if (f[k] !== 'true' && f[k] !== 'false') f[k] = '';
  for (const k of DATES) if (!DATE.test(f[k])) f[k] = '';
  f.employees = f.employees.filter((s) => SIZE_KEYS.includes(s));
  f.revenue = f.revenue.filter((s) => REVENUE_KEYS.includes(s));
  return f;
}

/** URLSearchParams -> sort / paging */
export function parseView(sp) {
  const sortBy = SORTS.includes(sp.get('sortBy')) ? sp.get('sortBy') : '';
  const sortDir = sp.get('sortDir') === 'desc' ? 'desc' : 'asc';
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(sp.get('pageSize'))) || 25));
  const page = Math.max(1, Math.min(1e6, Math.floor(Number(sp.get('page'))) || 1));
  return { sortBy, sortDir, pageSize, page };
}

/** Filters (+ optional view) -> query string without "?" */
export function toQuery(f, view = {}) {
  const sp = new URLSearchParams();
  for (const k of TEXT) if (f[k]) sp.set(k, f[k]);
  for (const k of [...MULTI, ...LISTS]) for (const v of f[k] || []) sp.append(k, v);
  if (view.sortBy) sp.set('sortBy', view.sortBy);
  if (view.sortBy && view.sortDir === 'desc') sp.set('sortDir', 'desc');
  if (view.pageSize && view.pageSize !== 25) sp.set('pageSize', String(view.pageSize));
  if (view.page > 1) sp.set('page', String(view.page));
  return sp.toString();
}

/** Same filters in any order -> same cache key */
export function filterKey(f) {
  const parts = [];
  for (const k of TEXT) if (f[k]) parts.push(`${k}=${f[k].toLowerCase()}`);
  for (const k of [...MULTI, ...LISTS]) if (f[k]?.length) parts.push(`${k}=${f[k].map((v) => v.toLowerCase()).sort().join('|')}`);
  return parts.join('&');
}

const OTHER_LABELS = {
  department: 'Function', seniority: 'Seniority', industry: 'Industry', country: 'Country', state: 'State', county: 'County', city: 'City',
  employees: 'Headcount', revenue: 'Revenue', emailStatus: 'Email status', tech: 'Technology', techNot: 'Not technology',
};

/** Saved query string -> readable text, e.g. "City: Pune · Job title file: 1" */
export function describeQuery(query) {
  const f = parseFilters(new URLSearchParams(query || ''));
  const parts = f.q ? [`Search: ${f.q}`] : [];
  for (const k of LIST_KINDS) {
    const { inc, exc, list, notList, label } = LIST_FIELDS[k];
    if (f[inc].length) parts.push(`${label}: ${f[inc].join(', ')}`);
    if (f[exc].length) parts.push(`Not ${label.toLowerCase()}: ${f[exc].join(', ')}`);
    if (f[list].length) parts.push(`${label} file: ${f[list].length}`);
    if (f[notList].length) parts.push(`Excluded ${label.toLowerCase()} file: ${f[notList].length}`);
  }
  for (const [k, label] of Object.entries(OTHER_LABELS)) if (f[k].length) parts.push(`${label}: ${f[k].join(', ')}`);
  if (f.hasEmail) parts.push(`Has email: ${f.hasEmail === 'true' ? 'yes' : 'no'}`);
  if (f.hasPhone) parts.push(`Has phone: ${f.hasPhone === 'true' ? 'yes' : 'no'}`);
  if (f.hasDirect) parts.push(`Has direct phone: ${f.hasDirect === 'true' ? 'yes' : 'no'}`);
  if (f.verifiedFrom) parts.push(`Updated from: ${f.verifiedFrom}`);
  if (f.verifiedTo) parts.push(`Updated up to: ${f.verifiedTo}`);
  // Choices from the download window
  const sp = new URLSearchParams(query || '');
  if (sp.get('dlCompanies')) parts.push(`Companies: ${sp.get('dlCompanies')}`);
  if (sp.get('dlPerCompany')) {
    const pick = { updated: 'most recently updated', verified: 'most recently verified' }[sp.get('dlPick')] || 'highest seniority';
    parts.push(`From each company: ${sp.get('dlPerCompany')} (${pick} first)`);
  }
  if (sp.get('dlUpdatedDays')) parts.push(`Updated in the last ${sp.get('dlUpdatedDays')} days`);
  if (sp.get('dlVerifiedDays')) parts.push(`Email verified in the last ${sp.get('dlVerifiedDays')} days`); // older downloads
  const roles = [...sp.getAll('dlSeniority'), ...sp.getAll('dlFunction'), ...sp.getAll('dlTitle')];
  if (roles.length) parts.push(`Roles: ${roles.join(', ')}`);
  return parts.join(' · ');
}

/** Where a download came from (downloads.kind) -> readable text */
export function downloadLabel(kind) {
  if (kind === 'selected-people') return 'Selected people';
  if (kind === 'saved-leads') return 'Saved leads';
  if (kind?.startsWith('saved-list-')) return 'Saved search';
  return 'People search';
}

export const activeCount = (f) => TEXT.filter((k) => f[k]).length + [...MULTI, ...LISTS].reduce((n, k) => n + (f[k]?.length || 0), 0);

// "HR Manager in Pune"   -> { title: 'HR Manager', city: 'Pune' }
// "Recruiter at Infosys" -> { title: 'Recruiter', company: 'Infosys' }
export function parseSearchPhrase(text) {
  const s = clean(text);
  let m = s.match(/^(.*\S)\s+(?:in|from|near)\s+(.+)$/i);
  if (m) return { title: m[1], city: m[2] };
  m = s.match(/^(.*\S)\s+at\s+(.+)$/i);
  if (m) return { title: m[1], company: m[2] };
  return { text: s };
}
