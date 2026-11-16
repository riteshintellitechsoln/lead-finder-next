// Shell for People, Companies and Saved searches: used by customers and admins alike,
// each with their own menu. Same URLs for both (/people, /companies, /saved).
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import IdleLogout from '@/components/IdleLogout';
import { IDLE_MESSAGE, IDLE_MINUTES, pageUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function SearchLayout({ children }) {
  const user = await pageUser();
  const admin = user.role === 'admin';
  return (
    <div className={'shell' + (admin ? ' admin' : '')}>
      <Sidebar variant={admin ? 'admin' : 'shop'} user={user} />
      <div className="main">
        <TopBar admin={admin} />
        {children}
        <IdleLogout minutes={IDLE_MINUTES} message={IDLE_MESSAGE} />
      </div>
    </div>
  );
}
