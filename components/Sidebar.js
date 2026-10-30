'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fmt } from '@/lib/format';
import { useSession } from './Session';
import Num from './Num';

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
  data: (
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="2.5" />
      <path d="M4 5.5v13c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-13M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7" />
    </>
  ),
  logout: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
};

const MENUS = {
  shop: [
    { href: '/', icon: 'home', label: 'Home' },
    { group: 'Prospect' },
    { href: '/people', icon: 'people', label: 'People' },
    { href: '/companies', icon: 'companies', label: 'Companies' },
    { href: '/saved', icon: 'saved', label: 'Saved leads', badge: 'saved' },
    { group: 'Engage' },
    { href: '/tasks', icon: 'tasks', label: 'Tasks', badge: 'tasksDue' },
    { href: '/profile', icon: 'profile', label: 'My profile', signedIn: true },
  ],
  admin: [
    { href: '/admin', icon: 'home', label: 'Dashboard' },
    { group: 'Manage' },
    { href: '/admin/users', icon: 'people', label: 'Users' },
    { href: '/admin/data', icon: 'data', label: 'Data' },
    { group: 'Account' },
    { href: '/admin/profile', icon: 'profile', label: 'My profile' },
  ],
};

function NavLink({ href, icon, label, badge, active }) {
  return (
    <Link href={href} className={'nav-btn' + (active ? ' on' : '')}>
      <svg viewBox="0 0 24 24">{icons[icon]}</svg>
      {label}
      {badge ? <span className="badge">{fmt(badge)}</span> : null}
    </Link>
  );
}

export default function Sidebar({ variant = 'shop', user }) {
  const path = usePathname();
  const session = useSession();
  const [serverStats, setStats] = useState(null);
  const [error, setError] = useState(false);
  const admin = variant === 'admin';
  // A guest's badge counts come from their in-memory lists
  const stats = serverStats && !user ? { ...serverStats, ...session.guestCounts } : serverStats;

  useEffect(() => {
    const load = () =>
      fetch(admin ? '/api/admin/stats' : '/api/stats')
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((s) => { setStats(s); setError(false); })
        .catch(() => setError(true));
    load();
    window.addEventListener('stats-changed', load);
    return () => window.removeEventListener('stats-changed', load);
  }, [path, admin]);

  const home = admin ? '/admin' : '/';
  const is = (p) => (p === home ? path === home : path.startsWith(p));

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  return (
    <nav aria-label="Main">
      <div className="brand">
        <div className="mark">
          <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" />
          </svg>
        </div>
        <span>Lead Finder{admin && <small>Admin</small>}</span>
      </div>
      {MENUS[variant].filter((m) => !m.signedIn || user).map((m) =>
        m.group ? (
          <div className="group" key={m.group}>{m.group}</div>
        ) : (
          <NavLink key={m.href} {...m} badge={m.badge ? stats?.[m.badge] : null} active={is(m.href)} />
        )
      )}
      <div className={'dbinfo' + (error ? ' err' : '')}>
        {error ? (
          'Server not reachable. Run npm run dev.'
        ) : (
          <>
            Database
            <br />
            <b>{stats ? <Num n={stats.totalPeople} /> : '…'}</b> people
          </>
        )}
      </div>
      {user ? (
        <div className="who">
          <Link className="grow" href={admin ? '/admin/profile' : '/profile'} title="My profile">
            <b>{user.name || 'Account'}</b>
            <span>{user.email}</span>
          </Link>
          <button className="nav-btn" type="button" onClick={logout} title="Log out" aria-label="Log out">
            <svg viewBox="0 0 24 24">{icons.logout}</svg>
          </button>
        </div>
      ) : (
        <div className="who guest">
          <span>Browsing as guest. Saved items clear on refresh.</span>
          <Link className="btn primary" href={`/signup?next=${encodeURIComponent(path)}`}>Sign up</Link>
        </div>
      )}
    </nav>
  );
}
