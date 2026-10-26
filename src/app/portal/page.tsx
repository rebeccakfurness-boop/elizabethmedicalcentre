import Link from 'next/link';
import { ClaimStatusBadge, InvoiceStatusBadge } from '@/components/ui/Badges';
import { listClaims, listInvoices } from '@/lib/billing';
import { ageFrom, formatDate, formatIDR, initials } from '@/lib/format';
import { getFamily, getFamilyMembers } from '@/lib/patients';
import { requirePatient } from '@/lib/session';

export default async function PortalHome() {
  const user = await requirePatient();
  const [family, members, invoicesAll, claims] = await Promise.all([
    getFamily(user.familyId),
    getFamilyMembers(user.familyId),
    listInvoices({ familyId: user.familyId }),
    listClaims({ familyId: user.familyId }),
  ]);
  const invoices = invoicesAll.filter((i) => i.status !== 'draft');
  const outstanding = invoices.filter((i) => (i.status === 'issued' || i.status === 'partially_paid') && i.patient_balance > 0);
  const balance = family?.balance ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="card-title">Patient portal</p>
        <h1 className="page-title mt-1">Hello, {user.name.split(' ')[0]}</h1>
      </div>

      <section className={`rounded-3xl p-6 sm:p-8 ${balance > 0 ? 'bg-pulse text-cream' : 'bg-teal-soft text-teal-deep'}`}>
        <p className="font-label text-xs font-bold uppercase tracking-[0.14em] opacity-80">Your balance</p>
        <p className="mt-1 font-headline text-4xl font-extrabold">{formatIDR(Math.max(0, balance))}</p>
        {balance > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href={`/portal/invoices/${outstanding[0]?.id}`} className="btn bg-cream text-pulse hover:bg-white">Pay now</Link>
            <span className="text-sm opacity-90">{outstanding.length} invoice{outstanding.length === 1 ? '' : 's'} to pay</span>
          </div>
        ) : (
          <p className="mt-2 text-sm">You&rsquo;re all paid up. Thank you!</p>
        )}
      </section>

      <section>
        <h2 className="card-title mb-3">Patient cards</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <Link key={m.id} href={`/portal/patients/${m.id}`} className="card flex items-center gap-4 transition hover:border-teal">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal font-headline text-lg font-extrabold text-cream" aria-hidden="true">{initials(m.first_name, m.last_name)}</span>
              <span>
                <span className="block font-semibold text-pulse">{m.first_name} {m.last_name}</span>
                <span className="block text-xs text-ink-soft">{m.mrn}{ageFrom(m.date_of_birth) != null ? ` · ${ageFrom(m.date_of_birth)} years` : ''} · {m.insurer_name ?? 'Self-pay'}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="card-title mb-3">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-ink-soft">No invoices yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {invoices.map((i) => (
              <li key={i.id}>
                <Link href={`/portal/invoices/${i.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-teal">
                  <span>
                    <span className="font-semibold">{i.invoice_number}</span>
                    <span className="ml-2 text-sm text-ink-soft">{formatDate(i.issue_date)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm">{i.status === 'paid' || i.status === 'void' ? formatIDR(i.total) : `${formatIDR(i.patient_balance)} to pay`}</span>
                    {i.pending_review ? <span className="pill bg-amber-100 text-amber-800">Checking payment</span> : <InvoiceStatusBadge status={i.status} daysOverdue={i.days_overdue} />}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {claims.length ? (
        <section className="card">
          <h2 className="card-title mb-3">Insurance claims</h2>
          <p className="mb-3 text-sm text-ink-soft">We bill your insurer directly for covered treatment. If they decline part of a claim, it will appear on your balance.</p>
          <ul className="divide-y divide-line text-sm">
            {claims.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{c.insurer_name} · {c.invoice_number}{c.patient_name ? ` · ${c.patient_name}` : ''}</span>
                <span className="flex items-center gap-3">{formatIDR(c.amount_claimed)} <ClaimStatusBadge status={c.status} /></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
