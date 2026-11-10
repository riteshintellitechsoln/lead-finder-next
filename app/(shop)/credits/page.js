// Download credits (users): credit usage, usage details, ask the admin for credits
import { Suspense } from 'react';
import CreditsPage from '@/components/Credits';
import { pageUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Credits · Lead Finder' };

export default async function Page() {
  await pageUser('user', '/credits');
  return <Suspense fallback={<section className="view"><div className="card meta">Loading…</div></section>}><CreditsPage /></Suspense>;
}
