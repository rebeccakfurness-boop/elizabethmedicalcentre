import Link from 'next/link';
import { notFound } from 'next/navigation';
import { recordPaymentAction, shiftShortfallAction, updateClaimAction } from '@/app/actions/billing';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { ClaimStatusBadge } from '@/components/ui/Badges';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { CLAIM_STATUS_LABELS, getClaim, getInvoice, getInvoiceItems } from '@/lib/billing';
import { formatDate, formatIDR, todayISO } from '@/lib/format';
import { getPatient } from '@/lib/patients';
import { requirePermission } from '@/lib/session';

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('finance');
  const claim = await getClaim(Number((await params).id));
  if (!claim) notFound();
  const [invoice, items, patient] = await Promise.all([getInvoice(claim.invoice_id), getInvoiceItems(claim.invoice_id), claim.patient_id ? getPatient(claim.patient_id) : null]);
  if (!invoice) notFound();
  const covered = items.filter((i) => i.insurance_covered);
  const decided = claim.status === 'rejected' || claim.status === 'partially_approved';
  const shortfall = invoice.insurer_balance > 0 && (claim.status === 'rejected' || (claim.amount_approved != null && claim.amount_approved < invoice.insurer_portion));

  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow={`${claim.insurer_name} · ${invoice.invoice_number}`} title={`Claim ${claim.claim_reference ?? '#' + claim.id}`} back={{ href: '/dashboard/insurance', label: 'Insurance claims' }} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <ClaimStatusBadge status={claim.status} />
            <span className="text-sm text-ink-soft">
              {patient ? <>Patient <Link href={`/dashboard/patients/${patient.id}`} className="text-teal hover:underline">{patient.first_name} {patient.last_name}</Link> · </> : null}
              Invoice <Link href={`/dashboard/invoices/${invoice.id}`} className="text-teal hover:underline">{invoice.invoice_number}</Link> · {formatDate(invoice.issue_date)}
            </span>
          </div>
          <h2 className="card-title mb-2">Claimed items</h2>
          <ul className="mb-4 divide-y divide-line text-sm">
            {covered.map((i) => (
              <li key={i.id} className="flex justify-between py-2"><span>{i.description}{i.patient_name ? ` · ${i.patient_name}` : ''}</span><span>{formatIDR(i.amount)}</span></li>
            ))}
          </ul>
          <ActionForm action={updateClaimAction} submitLabel="Save claim">
            <input type="hidden" name="id" value={claim.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Status" name="status" defaultValue={claim.status} options={Object.entries(CLAIM_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
              <Field label="Insurer claim reference" name="claim_reference" defaultValue={claim.claim_reference} />
              <Field label="Policy number" name="policy_number" defaultValue={claim.policy_number ?? patient?.insurance_policy_number} />
              <Field label="Amount approved (Rp)" name="amount_approved" type="number" defaultValue={claim.amount_approved} hint="Needed when approved or partly approved" />
              <Field label="Submitted on" name="submitted_at" type="date" defaultValue={claim.submitted_at} />
              <Field label="Decision on" name="decided_at" type="date" defaultValue={claim.decided_at} />
            </div>
            <TextArea label="Notes" name="notes" defaultValue={claim.notes} />
          </ActionForm>
        </section>

        <aside className="space-y-6">
          <section className="card">
            <h2 className="card-title mb-3">Amounts</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt>Claimed</dt><dd>{formatIDR(claim.amount_claimed)}</dd></div>
              <div className="flex justify-between"><dt>Approved</dt><dd>{claim.amount_approved != null ? formatIDR(claim.amount_approved) : '—'}</dd></div>
              <div className="flex justify-between"><dt>Received</dt><dd>{formatIDR(claim.insurer_paid)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1 font-semibold text-teal"><dt>Insurer still owes</dt><dd>{formatIDR(invoice.insurer_balance)}</dd></div>
            </dl>
          </section>

          {invoice.insurer_balance > 0 && claim.status !== 'rejected' ? (
            <section className="card">
              <h2 className="card-title mb-3">Record insurer payment</h2>
              <ActionForm action={recordPaymentAction} submitLabel="Record payment" resetOnSuccess>
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <input type="hidden" name="payer_type" value="insurer" />
                <input type="hidden" name="method" value="insurance" />
                <Field label="Amount (Rp)" name="amount" type="number" defaultValue={Math.min(invoice.insurer_balance, claim.amount_approved ?? invoice.insurer_balance)} required />
                <Field label="Date received" name="paid_at" type="date" defaultValue={todayISO()} />
                <Field label="Remittance reference" name="reference" />
              </ActionForm>
              <p className="mt-3 text-xs text-ink-soft">Insurer payments that arrive by bank transfer can also be matched from the bank statement.</p>
            </section>
          ) : null}

          {shortfall || decided ? (
            <section className="card">
              <h2 className="card-title mb-3">Shortfall</h2>
              <p className="mb-3 text-sm text-ink-soft">
                If the insurer won&rsquo;t pay the full amount, move the difference onto the family&rsquo;s balance so it shows in their portal.
              </p>
              <ActionForm action={shiftShortfallAction} submitLabel="Move shortfall to family" submitClassName="btn-clay btn-sm" confirm="Move the unpaid insurer amount onto the family's bill?">
                <input type="hidden" name="id" value={claim.id} />
              </ActionForm>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
