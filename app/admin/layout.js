// Shell for the admin panel. Only users with role 'admin' get past this.
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import IdleLogout from '@/components/IdleLogout';
import { IDLE_MESSAGE, IDLE_MINUTES, pageUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · Lead Finder' };

export default async function AdminLayout({ children }) {
  const user = await pageUser('admin');
  return (
    <div className="shell admin">
      <Sidebar variant="admin" user={user} />
      <div className="main">
        <TopBar admin />
        {children}
        <IdleLogout minutes={IDLE_MINUTES} message={IDLE_MESSAGE} />
      </div>
    </div>
  );
}
