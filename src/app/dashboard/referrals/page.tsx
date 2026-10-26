import Link from 'next/link';
import { ReferralStatusBadge } from '@/components/clinical/Referrals';
import { EmptyState, PageHeader } from '@/components/dashboard/PageHeader';
import { formatClinicTime } from '@/lib/format';
import { listReferrals } from '@/lib/referrals';
import { requireClinical } from '@/lib/session';
import { REFERRAL_TEMPLATES_BY_SLUG, URGENCY_LABELS } from '@/clinical/referrals';

export default async function ReferralsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireClinical();
  const { show = 'open' } = await searchParams;
  const referrals = await listReferrals(show === 'all' ? undefined : 'open');
  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Clinical"
        title="Referrals"
        actions={<Link href="/dashboard/referrals/contacts" className="btn-ghost btn-sm">Referral directory</Link>}
      />
      <p className="mb-4 max-w-3xl text-sm text-ink-soft">
        Write a referral from a visit or the patient card. The letter is filled in from the notes, observations and results; you check it, sign it, and email the PDF (with notes and results attached) or print it.
      </p>
      <nav className="mb-4 flex gap-2 text-sm">
        <Link href="/dashboard/referrals" className={show !== 'all' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}>Open</Link>
        <Link href="/dashboard/referrals?show=all" className={show === 'all' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}>All</Link>
      </nav>
      {referrals.length ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="table">
            <thead><tr><th>Patient</th><th>Referral</th><th>To</th><th>Urgency</th><th>Updated</th><th>Status</th></tr></thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/dashboard/referrals/${r.id}`} className="font-semibold text-teal hover:underline">{r.first_name} {r.last_name}</Link><span className="block text-xs text-ink-soft">{r.mrn}</span></td>
                  <td className="text-sm">{REFERRAL_TEMPLATES_BY_SLUG.get(r.template)?.title}<span className="block text-xs text-ink-soft">{r.reason}</span></td>
                  <td className="text-sm">{r.recipient_organisation ?? r.recipient_name ?? '—'}</td>
                  <td className={`text-sm ${r.urgency === 'emergency' || r.urgency === 'urgent' ? 'font-bold text-red-700' : ''}`}>{URGENCY_LABELS[r.urgency].label}</td>
                  <td className="whitespace-nowrap text-xs">{formatClinicTime(r.updated_at)}</td>
                  <td><ReferralStatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>No referrals {show === 'all' ? 'yet' : 'in progress'}.</EmptyState>
      )}
    </div>
  );
}
