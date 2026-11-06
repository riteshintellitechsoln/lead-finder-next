// Admin dashboard (Server Component: reads the database directly)
import Link from 'next/link';
import { adminStats } from '@/lib/admin';
import { fmt, formatDateTime } from '@/lib/format';
import Num from '@/components/Num';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const s = await adminStats();
  const maxCity = s.topCities[0]?.count || 1;

  return (
    <section className="view">
      <div className="stats">
        <div className="card stat"><div className="k">People in database</div><div className="v"><Num n={s.totalPeople} /></div><div className="meta"><Num n={s.withEmail} /> with email</div></div>
        <div className="card stat"><div className="k">Companies</div><div className="v"><Num n={s.totalCompanies} /></div><div className="meta">Unique company names</div></div>
        <div className="card stat"><div className="k">Users</div><div className="v"><Num n={s.users} /></div><div className="meta">{fmt(s.newUsers7)} joined in the last 7 days</div></div>
        <div className="card stat"><div className="k">Saved searches</div><div className="v"><Num n={s.savedSearches} /></div><div className="meta">Across all users</div></div>
        <Link className="card stat" href="/admin/credits"><div className="k">Credit requests</div><div className="v"><Num n={s.pendingCredits} /></div><div className="meta">waiting for you</div></Link>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Newest users <Link className="link" href="/admin/users">All users</Link></h3>
          <div className="list">
            {!s.recentUsers.length && <div className="meta">No users have signed up yet.</div>}
            {s.recentUsers.map((u) => (
              <div className="li" key={u.id}>
                <div className="grow"><div className="nm">{u.name || u.email}</div><div className="meta">{u.email}</div></div>
                {u.blocked ? <span className="pill due">Blocked</span> : <span className="meta">{formatDateTime(u.created_at)}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Top cities <Link className="link" href="/admin/data">Manage data</Link></h3>
          <div className="bars">
            {!s.topCities.length && <div className="meta">No data yet. Upload a CSV in Data.</div>}
            {s.topCities.map((c) => (
              <div className="barrow" key={c.value}>
                <span>{c.value}</span>
                <div className="track"><i style={{ width: `${(c.count / maxCity) * 100}%` }} /></div>
                <span className="num"><Num n={c.count} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
