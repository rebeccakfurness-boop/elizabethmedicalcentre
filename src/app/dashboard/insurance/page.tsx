import Link from 'next/link';
import { saveInsurer } from '@/app/actions/billing';
import { EmptyState, PageHeader, StatTile } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { ClaimStatusBadge, Pill } from '@/components/ui/Badges';
import { Field, Select } from '@/components/ui/Field';
import { CLAIM_STATUS_LABELS, listClaims, listInvoices } from '@/lib/billing';
import { formatDate, formatIDR } from '@/lib/format';
import { getInsurers } from '@/lib/patients';
import { requirePermission } from '@/lib/session';

export default async function InsurancePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission('finance');
  const { status = 'open' } = await searchParams;
  const [claims, insurers, insuredInvoices] = await Promise.all([listClaims({ status }), getInsurers(false), listInvoices({ status: 'insurance' })]);
  const unclaimed = insuredInvoices.filter((i) => i.insurer_balance > 0 && (i.status === 'issued' || i.status === 'partially_paid'));
  const owedByInsurer = new Map<string, number>();
  for (const i of unclaimed) owedByInsurer.set(i.insurer_name ?? '?', (owedByInsurer.get(i.insurer_name ?? '?') ?? 0) + i.insurer_balance);

  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow="Billing" title="Insurance claims" />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Owed by insurers" value={formatIDR(unclaimed.reduce((s, i) => s + i.insurer_balance, 0))} />
        <StatTile label="Open claims" value={claims.filter((c) => !['paid', 'rejected'].includes(c.status)).length} />
        <StatTile label="Insurers on file" value={insurers.filter((i) => i.is_active).length} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[{ value: 'open', label: 'Open' }, ...Object.entries(CLAIM_STATUS_LABELS).map(([value, label]) => ({ value, label })), { value: 'all', label: 'All' }].map((f) => (
          <Link key={f.value} href={`/dashboard/insurance?status=${f.value}`} className={`rounded-full px-3.5 py-1.5 font-label text-xs font-bold ${status === f.value ? 'bg-teal text-cream' : 'border border-line bg-white text-ink-soft hover:border-teal'}`}>
            {f.label}
          </Link>
        ))}
      </div>

      <section className="card mb-6">
        {claims.length === 0 ? (
          <EmptyState>No claims with this status. Start a claim from any invoice that has an insurer on it.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Claim</th><th>Patient</th><th>Insurer</th><th>Submitted</th><th className="text-right">Claimed</th><th className="text-right">Approved</th><th className="text-right">Received</th><th>Status</th></tr></thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id} className="hover:bg-paper">
                    <td><Link href={`/dashboard/insurance/${c.id}`} className="font-semibold text-teal hover:underline">{c.claim_reference ?? `#${c.id}`}</Link><span className="block text-xs text-ink-soft">{c.invoice_number}</span></td>
                    <td>{c.patient_name ?? '—'}</td>
                    <td>{c.insurer_name}</td>
                    <td>{formatDate(c.submitted_at)}</td>
                    <td className="text-right">{formatIDR(c.amount_claimed)}</td>
                    <td className="text-right">{c.amount_approved != null ? formatIDR(c.amount_approved) : '—'}</td>
                    <td className="text-right">{formatIDR(c.insurer_paid)}</td>
                    <td><ClaimStatusBadge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="card-title mb-3">Insurers</h2>
          <ul className="mb-5 divide-y divide-line">
            {insurers.map((i) => (
              <li key={i.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer items-center justify-between">
                    <span className="font-semibold">{i.name} {i.is_active ? null : <Pill>Inactive</Pill>}</span>
                    <span className="text-sm text-ink-soft">{owedByInsurer.get(i.name) ? `owes ${formatIDR(owedByInsurer.get(i.name))}` : `${i.payment_terms_days}-day terms`}</span>
                  </summary>
                  <div className="mt-3">
                    <ActionForm action={saveInsurer} submitLabel="Save insurer" submitClassName="btn-ghost btn-sm">
                      <input type="hidden" name="id" value={i.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Name" name="name" defaultValue={i.name} required />
                        <Field label="Contact person" name="contact_name" defaultValue={i.contact_name} />
                        <Field label="Claims email" name="contact_email" type="email" defaultValue={i.contact_email} />
                        <Field label="Phone" name="phone" defaultValue={i.phone} />
                        <Field label="Payment terms (days)" name="payment_terms_days" type="number" defaultValue={i.payment_terms_days} />
                        <Select label="Status" name="is_active" defaultValue={String(i.is_active)} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} />
                      </div>
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
          <h3 className="card-title mb-3">Add an insurer</h3>
          <ActionForm action={saveInsurer} submitLabel="Add insurer" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" name="name" placeholder="e.g. Allianz, AXA, Cigna, BPJS" required />
              <Field label="Claims email" name="contact_email" type="email" />
              <Field label="Contact person" name="contact_name" />
              <Field label="Payment terms (days)" name="payment_terms_days" type="number" defaultValue={30} />
            </div>
          </ActionForm>
        </section>

        <section className="card">
          <h2 className="card-title mb-3">Insured invoices without a claim</h2>
          {unclaimed.length === 0 ? (
            <p className="text-sm text-ink-soft">Every insured invoice has been claimed or paid.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {unclaimed.map((i) => (
                <li key={i.id} className="flex justify-between py-2">
                  <Link href={`/dashboard/invoices/${i.id}`} className="text-teal hover:underline">{i.invoice_number} · {i.billed_to_name}</Link>
                  <span>{i.insurer_name} · {formatIDR(i.insurer_balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
