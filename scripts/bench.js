// Benchmarks the same query code the API routes use, against data/leads.duckdb.
// Stop the website first (the database file can only be opened by one program).
//
//   npm run bench
import '../lib/env.js';
import { getBaseStats, getFacets, getFilters, searchCompanies, searchPeople, exportQuery } from '../lib/people.js';
import { streamRows } from '../lib/db.js';

const sp = (qs) => new URLSearchParams(qs);

async function time(label, fn, target) {
  const t = performance.now();
  const out = await fn();
  const ms = performance.now() - t;
  const ok = target ? (ms <= target ? 'OK  ' : 'SLOW') : '    ';
  console.log(`${ok} ${ms.toFixed(0).padStart(6)} ms  ${label}${out !== undefined ? `  -> ${out}` : ''}`);
}

const searches = [
  ['personTitles=hr manager&city=Pune', 'HR Manager in Pune'],
  ['city=Mumbai&seniority=Director&seniority=VP', 'Directors + VPs in Mumbai'],
  ['personTitles=engineer&personNotTitles=intern&employees=1001-5000&hasEmail=true', 'Engineers (not interns), 1001-5000, has email'],
  ['industry=Banking&city=Bengaluru&city=Hyderabad&sortBy=name', 'Banking in 2 cities, sorted by name'],
  ['q=sharma&city=Delhi', 'Name/company "sharma" in Delhi'],
  ['q=quantum', 'Name/company search "quantum"'],
  ['seniority=Owner+%2F+Partner&industry=Software+Development&sortBy=employees&sortDir=desc', 'Software owners / partners, by company size'],
  ['hasEmail=false&employees=10001%2B&sortBy=city', 'No email, 10,001+, sorted by city'],
];

console.log(`Lead Finder benchmark  (memory_limit=${process.env.DUCKDB_MEMORY_LIMIT || '1GB'})\n`);
await time('open database + totals (cold)', async () => (await getBaseStats()).totalPeople.toLocaleString('en-IN') + ' people');
await time('filter option lists (cold)', async () => `${(await getFilters()).city.length} cities`);
await time('live counts, no filters (cold)', async () => `${Object.keys((await getFacets(sp(''), null)).facets).length} groups`);

console.log('\nFiltered search: exact count + first page (target < 500 ms; cold = never searched before)');
for (const [qs, label] of searches) {
  await time(label, async () => `${(await searchPeople(sp(qs), null)).totalElements.toLocaleString('en-IN')} matches`, 500);
}
console.log('\nNext page of the same search (target < 100 ms)');
for (const [qs, label] of searches) {
  await time(`${label} (page 2)`, async () => `${(await searchPeople(sp(qs + '&page=2'), null)).content.length} rows`, 100);
}
await time('All people sorted by name, deepest page (row 50,000)', async () => `${(await searchPeople(sp('sortBy=name&page=2000'), null)).content.length} rows`);

console.log('\nLive counts for all filter groups (cold)');
for (const [qs, label] of searches.slice(0, 4)) {
  await time(label, async () => `${(await getFacets(sp(qs), null)).facets.city.length} cities`);
}

console.log('\nOther');
await time('companies page 1', async () => `${(await searchCompanies(sp(''))).totalElements} companies`);
await time('companies search "tech"', async () => `${(await searchCompanies(sp('q=tech'))).totalElements} companies`);
await time('export 100,000 rows (stream only)', async () => {
  const { sql, params } = await exportQuery(sp('city=Mumbai'), null);
  let n = 0;
  for await (const rows of streamRows(sql, params)) n += rows.length;
  return `${n} rows`;
});
const mem = process.memoryUsage();
console.log(`\nProcess memory: RSS ${(mem.rss / 1048576).toFixed(0)} MB`);
process.exit(0);
