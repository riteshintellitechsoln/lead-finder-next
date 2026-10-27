'use client';
import { usePathname, useRouter } from 'next/navigation';

const TITLES = { '/': 'Home', '/people': 'People', '/companies': 'Companies', '/saved': 'Saved leads', '/tasks': 'Tasks' };

export default function TopBar() {
  const path = usePathname();
  const router = useRouter();

  function onKeyDown(e) {
    const v = e.target.value.trim();
    if (e.key === 'Enter') router.push(v ? `/people?q=${encodeURIComponent(v)}` : '/people');
  }

  return (
    <div className="top">
      <h1>{TITLES[path] || 'Lead Finder'}</h1>
      <div className="gsearch">
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input id="globalSearch" placeholder="Search people or companies, press Enter" autoComplete="off" onKeyDown={onKeyDown} />
      </div>
    </div>
  );
}
