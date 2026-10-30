// People search. Filter options come from the server; the table itself is a
// client component that fetches /api/people as filters change.
import { Suspense } from 'react';
import { getFilters } from '@/lib/people';
import PeopleSearch from '@/components/PeopleSearch';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'People · Lead Finder' };

export default function PeoplePage() {
  return (
    <Suspense fallback={<section className="view"><div className="meta">Loading…</div></section>}>
      <PeopleSearch filters={getFilters()} />
    </Suspense>
  );
}
