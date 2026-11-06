// Server part of /login and /signup: signed-in people go straight in; the rest see the form
import { redirect } from 'next/navigation';
import { getUser, signupAllowed } from '@/lib/auth';
import { googleEnabled } from '@/lib/google';
import { safeNext } from '@/lib/next-url';
import { getBaseStats } from '@/lib/people';
import AuthCard from './AuthCard';

export default async function AuthPage({ mode, searchParams }) {
  const user = await getUser();
  if (user) redirect(user.role === 'admin' ? '/admin' : '/');
  const { next, error } = await searchParams;
  const nextUrl = safeNext(next) || undefined;
  if (mode === 'signup' && !signupAllowed()) redirect('/login' + (nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : ''));
  const totalPeople = await getBaseStats().then((s) => s.totalPeople, () => null);
  return (
    <AuthCard mode={mode} next={nextUrl} error={typeof error === 'string' ? error.slice(0, 200) : ''}
      googleOn={googleEnabled()} signupOn={signupAllowed()} totalPeople={totalPeople} />
  );
}
