// Download credits (users): balance, ask the admin for credits, history
import CreditsPage from '@/components/Credits';
import { pageUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Credits · Lead Finder' };

export default async function Page() {
  await pageUser('user', '/credits');
  return <CreditsPage />;
}
