// Shell for the shop. Signed-in customers only (proxy.js sends others to /login); the admin is sent to /admin.
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import IdleLogout from '@/components/IdleLogout';
import { IDLE_MESSAGE, IDLE_MINUTES, pageUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ShopLayout({ children }) {
  const user = await pageUser('user');
  return (
    <div className="shell">
      <Sidebar variant="shop" user={user} />
      <div className="main">
        <TopBar />
        {children}
        <IdleLogout minutes={IDLE_MINUTES} message={IDLE_MESSAGE} />
      </div>
    </div>
  );
}
