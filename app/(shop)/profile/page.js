// My profile (users). Guests are sent to sign in first.
import Profile from '@/components/Profile';
import { pageUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My profile · Lead Finder' };

export default async function ProfilePage() {
  await pageUser('user', '/profile');
  return <Profile />;
}
