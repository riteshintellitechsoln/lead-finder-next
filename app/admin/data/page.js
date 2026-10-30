// Admin > Data: upload a CSV and add / edit / delete people.
import { Suspense } from 'react';
import DataManager from '@/components/admin/DataManager';

export default function AdminDataPage() {
  return (
    <Suspense fallback={<section className="view"><div className="meta">Loading…</div></section>}>
      <DataManager />
    </Suspense>
  );
}
