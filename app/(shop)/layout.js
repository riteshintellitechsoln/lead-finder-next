// Shell for the shop. Signed-in customers only (proxy.js sends others to /login); the admin is sent to /admin.
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { pageUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ShopLayout({ children }) {
  const user = await pageUser('user');
  return (
    <div className="shell">
      <Sidebar variant="shop" user={user} />
      <div className="main">
        <TopBar />
        {children}
      </div>
    </div>
  );
}
