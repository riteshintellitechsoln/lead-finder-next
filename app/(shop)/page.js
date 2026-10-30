// Home dashboard. This is a Server Component: it reads the database directly
// on the server, so the page arrives already filled with data.
import Link from 'next/link';
import { getStats, getFilters, searchPeople } from '@/lib/people';
import { listTasks } from '@/lib/tasks';
import { getUser } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { Greeting, AskBox, SaveButton, HomeTasks, MyCount } from '@/components/HomeWidgets';
import PersonCell from '@/components/PersonCell';
import Num from '@/components/Num';

export const dynamic = 'force-dynamic';

const PRESETS = [
  ['HR Managers in Pune', 'personTitles=HR+Manager&city=Pune'],
  ['Talent Acquisition', 'personTitles=Talent+Acquisition'],
  ['Heads of HR in Bengaluru', 'personTitles=Head+of+HR&city=Bengaluru'],
  ['CTOs', 'personTitles=CTO'],
];

export default async function HomePage() {
  const user = await getUser(); // null for guests
  const stats = getStats(user);
  const filters = getFilters();
  const recommended = searchPeople(new URLSearchParams('personTitles=HR&personTitles=Talent&hasEmail=true&pageSize=5'), user).content;
  const tasks = (user ? listTasks(user.id) : []).filter((t) => !t.done).slice(0, 5);
  const topCities = filters.city.slice(0, 6);
  const maxCity = topCities[0]?.count || 1;

  return (
    <section className="view">
      <div className="hello">
        <div>
          <Greeting />
          <p>Here&apos;s what&apos;s happening with your prospecting today.</p>
        </div>
        <div className="acts">
          <Link className="btn" href="/companies">Find companies</Link>
          <Link className="btn primary" href="/people">Find people</Link>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><div className="k">People in database</div><div className="v"><Num n={stats.totalPeople} /></div><div className="meta"><Num n={stats.withEmail} /> with email</div></div>
        <div className="card stat"><div className="k">Companies</div><div className="v"><Num n={stats.totalCompanies} /></div><div className="meta">Unique company names</div></div>
        <div className="card stat"><div className="k">Saved leads</div><div className="v"><MyCount name="saved" value={stats.saved} /></div><div className="meta">{user ? 'Ready to download' : <Link className="link" href="/signup">Sign up to keep them</Link>}</div></div>
        <div className="card stat"><div className="k">Tasks due</div><div className="v"><MyCount name="tasksDue" value={stats.tasksDue} /></div><div className="meta">Today or overdue</div></div>
      </div>

      <div className="grid2">
        <div className="col">
          <div className="card">
            <h3>Who are you looking for?</h3>
            <AskBox cities={filters.city.map((c) => c.value)} />
            <div className="quick">
              {PRESETS.map(([label, qs]) => <Link key={label} href={`/people?${qs}`}>{label}</Link>)}
            </div>
          </div>
          <div className="card">
            <h3>Recommended for you <Link className="link" href="/people?personTitles=HR&personTitles=Talent&hasEmail=true">View all</Link></h3>
            <div className="list">
              {recommended.length === 0 && <div className="meta">No HR people found in your data.</div>}
              {recommended.map((p) => (
                <div className="li" key={p.id}>
                  <div className="grow"><PersonCell person={{ ...p, title: `${p.title} · ${p.company} · ${p.city}` }} /></div>
                  {p.saved ? <span className="pill ok">Saved</span> : <SaveButton id={p.id} />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col">
          <div className="card">
            <h3>Top cities</h3>
            <div className="bars">
              {topCities.length === 0 && <div className="meta">No data yet. Import your CSV first.</div>}
              {topCities.map((c) => (
                <div className="barrow" key={c.value}>
                  <Link href={`/people?city=${encodeURIComponent(c.value)}`}>{c.value}</Link>
                  <div className="track"><i style={{ width: `${(c.count / maxCity) * 100}%` }} /></div>
                  <span className="num"><Num n={c.count} /></span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>Upcoming tasks <Link className="link" href="/tasks">All tasks</Link></h3>
            <div className="list"><HomeTasks tasks={tasks} /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
