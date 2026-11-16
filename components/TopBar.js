'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { initials } from '@/lib/format';
import { useSession } from './Session';

const TITLES = {
  '/': 'Home', '/people': 'People', '/companies': 'Companies', '/saved': 'Saved searches', '/tasks': 'Tasks',
  '/profile': 'My profile', '/credits': 'Credits',
  '/admin': 'Admin dashboard', '/admin/users': 'Users', '/admin/saves': "Users' saves", '/admin/credits': 'Credit requests', '/admin/data': 'Data', '/admin/profile': 'My profile',
};

export default function TopBar({ admin = false }) {
  const path = usePathname();
  const router = useRouter();
  const { user } = useSession();
  // In the admin panel the search box finds people to edit; everywhere else it searches people
  const base = admin && path.startsWith('/admin') ? '/admin/data' : '/people';
  const next = encodeURIComponent(path);

  function onKeyDown(e) {
    const v = e.target.value.trim();
    if (e.key === 'Enter') router.push(v ? `${base}?q=${encodeURIComponent(v)}` : base);
  }

  return (
    <div className="top">
      <h1>{TITLES[path] || (path.startsWith('/admin/users/') ? 'User details' : path.startsWith('/admin/data/uploads/') ? 'Upload details' : 'Lead Finder')}</h1>
      <div className="gsearch">
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input id="globalSearch" placeholder="Search people or companies, press Enter" autoComplete="off" onKeyDown={onKeyDown} />
      </div>
      <div className="authbtns">
        {user ? (
          <Link className="me" href={admin ? '/admin/profile' : '/profile'} title="My profile">
            <span className="av">{initials(user.name || user.email)}</span>
            <span className="nm">{user.name || user.email}</span>
          </Link>
        ) : (
          <>
            <Link className="btn" href={`/login?next=${next}`}>Sign in</Link>
            <Link className="btn primary" href={`/signup?next=${next}`}>Sign up</Link>
          </>
        )}
      </div>
    </div>
  );
}
