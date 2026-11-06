import AuthPage from '@/components/AuthPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Log in · Lead Finder' };

export default function LoginPage({ searchParams }) {
  return <AuthPage mode="login" searchParams={searchParams} />;
}
