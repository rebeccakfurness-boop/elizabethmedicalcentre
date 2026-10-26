import Link from 'next/link';
import { LabStatusBadge } from '@/components/clinical/Labs';
import { EmptyState, PageHeader } from '@/components/dashboard/PageHeader';
import { formatClinicTime } from '@/lib/format';
import { getLabInbox, testNames, type LabOrderRow } from '@/lib/labs';
import { requireClinical } from '@/lib/session';

function OrderTable({ orders, when }: { orders: LabOrderRow[]; when: (o: LabOrderRow) => string | null }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="table">
        <thead><tr><th>Patient</th><th>Tests</th><th>Lab</th><th>When</th><th>Status</th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className={o.critical_count ? 'bg-red-50' : ''}>
              <td><Link href={`/dashboard/labs/${o.id}`} className="font-semibold text-teal hover:underline">{o.first_name} {o.last_name}</Link><span className="block text-xs text-ink-soft">{o.mrn}</span></td>
              <td className="max-w-xs text-sm">{testNames(o)}{o.urgency === 'urgent' ? <span className="ml-1 text-xs font-bold text-red-700">URGENT</span> : null}</td>
              <td className="text-sm">{o.lab_name ?? '—'}</td>
              <td className="whitespace-nowrap text-xs">{formatClinicTime(when(o))}</td>
              <td><LabStatusBadge order={o} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function LabsPage() {
  await requireClinical();
  const { toReview, awaiting, recent } = await getLabInbox();
  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow="Clinical" title="Blood tests" />
      <p className="mb-6 max-w-3xl text-sm text-ink-soft">
        Order tests from a visit or the patient card. When results come back, type them in or upload the lab report. A doctor then reviews them and chooses which results the patient can see in their portal.
      </p>
      <section className="mb-8">
        <h2 className="card-title mb-3">Results to review ({toReview.length})</h2>
        {toReview.length ? <OrderTable orders={toReview} when={(o) => o.resulted_at} /> : <EmptyState>No results waiting for review.</EmptyState>}
      </section>
      <section className="mb-8">
        <h2 className="card-title mb-3">Waiting for results ({awaiting.length})</h2>
        {awaiting.length ? <OrderTable orders={awaiting} when={(o) => o.created_at} /> : <EmptyState>Nothing outstanding.</EmptyState>}
      </section>
      <section>
        <h2 className="card-title mb-3">Recently reviewed</h2>
        {recent.length ? <OrderTable orders={recent} when={(o) => o.reviewed_at} /> : <EmptyState>None yet.</EmptyState>}
      </section>
    </div>
  );
}
