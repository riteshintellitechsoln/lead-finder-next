import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import AuthCard from '@/components/AuthCard';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in · Lead Finder' };

export default async function LoginPage({ searchParams }) {
  const user = await getUser();
  if (user) redirect(user.role === 'admin' ? '/admin' : '/');
  const { next } = await searchParams;
  return (
    <AuthCard title="Sign in" subtitle="Your saved leads and tasks stay in your account.">
      <LoginForm mode="login" next={typeof next === 'string' ? next : undefined} />
    </AuthCard>
  );
}
