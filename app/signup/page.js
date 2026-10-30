import { redirect } from 'next/navigation';
import { getUser, signupAllowed } from '@/lib/auth';
import AuthCard from '@/components/AuthCard';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign up · Lead Finder' };

export default async function SignupPage({ searchParams }) {
  const user = await getUser();
  if (user) redirect(user.role === 'admin' ? '/admin' : '/');
  const { next } = await searchParams;
  if (!signupAllowed()) redirect('/login' + (typeof next === 'string' ? `?next=${encodeURIComponent(next)}` : ''));
  return (
    <AuthCard title="Create your account" subtitle="Free to join. Your saved leads and tasks are kept in your account.">
      <LoginForm mode="signup" next={typeof next === 'string' ? next : undefined} />
    </AuthCard>
  );
}
