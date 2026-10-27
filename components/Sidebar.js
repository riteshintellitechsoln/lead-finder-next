'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fmt } from '@/lib/format';

const icons = {
  home: <path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.7 3 2.4 3.5 5.2" />
    </>
  ),
  companies: <path d="M4 21V5l8-2v18M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2M2 21h20" />,
  saved: <path d="M6 3h12v18l-6-4-6 4z" />,
  tasks: (
    <>
      <path d="M9 11l3 3 8-8" />
      <path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11" />
    </>
  ),
};

function NavLink({ href, icon, label, badge, active }) {
  return (
    <Link href={href} className={'nav-btn' + (active ? ' on' : '')}>
      <svg viewBox="0 0 24 24">{icons[icon]}</svg>
      {label}
      {badge != null && <span className="badge">{fmt(badge)}</span>}
    </Link>
  );
}

export default function Sidebar() {
  const path = usePathname();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch('/api/stats')
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((s) => { setStats(s); setError(false); })
        .catch(() => setError(true));
    load();
    window.addEventListener('stats-changed', load);
    return () => window.removeEventListener('stats-changed', load);
  }, [path]);

  const is = (p) => (p === '/' ? path === '/' : path.startsWith(p));

  return (
    <nav aria-label="Main">
      <div className="brand">
        <div className="mark">
          <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" />
          </svg>
        </div>
        <span>Lead Finder</span>
      </div>
      <NavLink href="/" icon="home" label="Home" active={is('/')} />
      <div className="group">Prospect</div>
      <NavLink href="/people" icon="people" label="People" active={is('/people')} />
      <NavLink href="/companies" icon="companies" label="Companies" active={is('/companies')} />
      <NavLink href="/saved" icon="saved" label="Saved leads" badge={stats?.saved ?? 0} active={is('/saved')} />
      <div className="group">Engage</div>
      <NavLink href="/tasks" icon="tasks" label="Tasks" badge={stats?.tasksDue ?? 0} active={is('/tasks')} />
      <div className={'dbinfo' + (error ? ' err' : '')}>
        {error ? (
          'Server not reachable. Run npm run dev.'
        ) : (
          <>
            Database
            <br />
            <b>{stats ? fmt(stats.totalPeople) : '…'}</b> people
          </>
        )}
      </div>
    </nav>
  );
}
