'use client';
// Banner for guests: what they add here is only kept until a page refresh
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from './Session';

export default function GuestNote({ what }) {
  const { guest } = useSession();
  const next = encodeURIComponent(usePathname());
  if (!guest) return null;
  return (
    <div className="guestnote">
      <span><b>You are not signed in.</b> {what} you add are kept only until you refresh the page. Sign in and they are saved in your account.</span>
      <Link className="btn" href={`/login?next=${next}`}>Sign in</Link>
      <Link className="btn primary" href={`/signup?next=${next}`}>Sign up</Link>
    </div>
  );
}
