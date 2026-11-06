// Runs once when the Next.js server starts: opens the database and fills the
// in-memory caches (totals, filter lists, unfiltered counts), so the first
// visitor gets instant results.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  const t = Date.now();
  try {
    const { hasPeople, oldSqliteExists } = await import('./lib/db.js');
    if (!(await hasPeople())) {
      const hint = oldSqliteExists() ? ' Your old SQLite data can be copied with "npm run migrate-sqlite".' : '';
      console.log(`[lead-finder] The database has no people yet. Run "npm run seed" or "npm run import -- file.csv", or upload a CSV in Admin > Data.${hint}`);
      return;
    }
    const { getBaseStats, getFilters, getFacets } = await import('./lib/people.js');
    const stats = await getBaseStats();
    await Promise.all([getFilters(), getFacets(new URLSearchParams(), null)]);
    console.log(`[lead-finder] ${stats.totalPeople.toLocaleString('en-IN')} people ready, caches warmed in ${Date.now() - t} ms`);
  } catch (e) {
    console.error('[lead-finder] Could not open the database:', e.message);
  }
}
