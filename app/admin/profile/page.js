// My profile (admins). The admin layout already checks the role.
import Profile from '@/components/Profile';

export const metadata = { title: 'My profile · Admin · Lead Finder' };

export default function AdminProfilePage() {
  return <Profile admin />;
}
