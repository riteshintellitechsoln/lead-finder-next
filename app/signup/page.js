import AuthPage from '@/components/AuthPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign up · Lead Finder' };

export default function SignupPage({ searchParams }) {
  return <AuthPage mode="signup" searchParams={searchParams} />;
}
