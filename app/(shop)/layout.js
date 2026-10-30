// Shell for the shop. Open to everyone (guests too); the admin is sent to /admin.
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ShopLayout({ children }) {
  const user = await getUser();
  if (user?.role === 'admin') redirect('/admin');
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
