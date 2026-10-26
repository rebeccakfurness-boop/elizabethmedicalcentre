import Link from 'next/link';
import { PageHeader, StatTile } from '@/components/dashboard/PageHeader';
import { can, isClinical, ROLE_LABELS } from '@/lib/auth';
import { getFinanceSummary } from '@/lib/billing';
import { sql } from '@/lib/db';
import { formatIDR } from '@/lib/format';
import { countLabsToReview } from '@/lib/labs';
import { requireStaff } from '@/lib/session';

export default async function DashboardHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireStaff();
  const { denied } = await searchParams;
  const [counts] = await sql<{ patients: number; families: number; new_this_month: number }>`
    SELECT (SELECT COUNT(*)::int FROM patients WHERE status = 'active') AS patients,
           (SELECT COUNT(*)::int FROM families) AS families,
           (SELECT COUNT(*)::int FROM patients WHERE created_at >= date_trunc('month', now())) AS new_this_month
  `;
  const finance = can(user.role, 'finance') ? await getFinanceSummary() : null;
  const labs = isClinical(user.clinicalRole) ? await countLabsToReview() : null;
  const [clinic] = await sql<{ in_clinic: number; waiting: number; urgent: number; seen_today: number }>`
    SELECT COUNT(*) FILTER (WHERE status IN ('waiting', 'triaged', 'in_consultation'))::int AS in_clinic,
           COUNT(*) FILTER (WHERE status IN ('waiting', 'triaged'))::int AS waiting,
           COUNT(*) FILTER (WHERE status IN ('waiting', 'triaged') AND triage_category IN ('red', 'orange'))::int AS urgent,
           COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= (now() AT TIME ZONE 'Asia/Makassar')::date AT TIME ZONE 'Asia/Makassar')::int AS seen_today
    FROM encounters WHERE status IN ('waiting', 'triaged', 'in_consultation') OR completed_at >= now() - interval '1 day'`;

  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow={ROLE_LABELS[user.role]} title={`Welcome, ${user.name.split(' ')[0]}`} />
      {denied ? <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Your account doesn’t have access to that page.</p> : null}

      <form action="/dashboard/patients" className="mb-8 flex max-w-xl gap-2">
        <input className="input" name="q" placeholder="Find a patient by name, MRN, phone or email" aria-label="Find a patient" />
        <button className="btn-primary">Search</button>
      </form>

      <h2 className="card-title mb-3">Clinic today</h2>
      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="In the clinic" value={clinic.in_clinic} href="/dashboard/clinic" />
        <StatTile label="Waiting to be seen" value={clinic.waiting} href="/dashboard/clinic" />
        <StatTile label="Very urgent or emergency waiting" value={clinic.urgent} tone={clinic.urgent ? 'alert' : 'good'} href="/dashboard/clinic" />
        <StatTile label="Seen today" value={clinic.seen_today} />
        {labs ? (
          <StatTile
            label="Results to review"
            value={labs.to_review}
            note={labs.critical ? `${labs.critical} with critical values` : undefined}
            tone={labs.critical ? 'alert' : labs.to_review ? 'default' : 'good'}
            href="/dashboard/labs"
          />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Active patients" value={counts.patients} href="/dashboard/patients" />
        <StatTile label="Family accounts" value={counts.families} href="/dashboard/families" />
        <StatTile label="New patients this month" value={counts.new_this_month} />
      </div>

      {finance ? (
        <>
          <h2 className="card-title mb-3 mt-10">Billing</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Owed by patients" value={formatIDR(finance.outstanding_patient)} href="/dashboard/invoices?status=outstanding" />
            <StatTile label="Owed by insurers" value={formatIDR(finance.outstanding_insurer)} href="/dashboard/insurance" />
            <StatTile
              label="Overdue invoices"
              value={finance.overdue_count}
              note={finance.overdue_count ? formatIDR(finance.overdue_amount) : undefined}
              tone={finance.overdue_count ? 'alert' : 'good'}
              href="/dashboard/invoices?status=overdue"
            />
            <StatTile label="Payments to review" value={finance.pending_review} tone={finance.pending_review ? 'alert' : 'good'} href="/dashboard/payments?status=pending_review" />
            <StatTile label="Open insurance claims" value={finance.open_claims} href="/dashboard/insurance" />
            <StatTile label="Bills to pay" value={finance.unpaid_bills} note={finance.unpaid_bills ? formatIDR(finance.unpaid_bills_amount) : undefined} href="/dashboard/budget/bills" />
            <StatTile label="Unmatched bank lines" value={finance.unmatched_txns} tone={finance.unmatched_txns ? 'alert' : 'good'} href="/dashboard/budget/bank" />
            <div className="card flex flex-col justify-center gap-2">
              <Link href="/dashboard/invoices/new" className="btn-clay">+ New invoice</Link>
              <Link href="/dashboard/patients/new" className="btn-ghost">+ New patient</Link>
            </div>
          </div>
        </>
      ) : can(user.role, 'managePatients') ? (
        <div className="mt-8">
          <Link href="/dashboard/patients/new" className="btn-clay">+ New patient</Link>
        </div>
      ) : null}
    </div>
  );
}
