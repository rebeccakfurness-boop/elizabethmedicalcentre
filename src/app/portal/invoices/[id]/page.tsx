import Link from 'next/link';
import { notFound } from 'next/navigation';
import { submitPaymentProof } from '@/app/actions/portal';
import { ActionForm } from '@/components/ui/ActionForm';
import { InvoiceStatusBadge, Pill } from '@/components/ui/Badges';
import { Field, Select } from '@/components/ui/Field';
import { getClinicSettings, getInvoice, getInvoiceItems, listPayments, PAYMENT_METHOD_LABELS } from '@/lib/billing';
import { formatDate, formatIDR, todayISO } from '@/lib/format';
import { requirePatient } from '@/lib/session';

export default async function PortalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePatient();
  const invoice = await getInvoice(Number((await params).id));
  if (!invoice || invoice.family_id !== user.familyId || invoice.status === 'draft') notFound();
  const [items, payments, clinic] = await Promise.all([getInvoiceItems(invoice.id), listPayments({ invoiceId: invoice.id }), getClinicSettings()]);
  const patientPayments = payments.filter((p) => p.payer_type === 'patient');
  const pending = patientPayments.filter((p) => p.status === 'pending_review').reduce((s, p) => s + p.amount, 0);
  const toPay = Math.max(0, invoice.patient_balance - pending);
  const open = invoice.status === 'issued' || invoice.status === 'partially_paid';

  return (
    <div className="space-y-6">
      <Link href="/portal" className="font-label text-xs font-bold uppercase tracking-[0.12em] text-ink-soft hover:text-teal">← Back</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="card-title">Invoice</p>
          <h1 className="page-title mt-1">{invoice.invoice_number}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <InvoiceStatusBadge status={invoice.status} daysOverdue={invoice.days_overdue} /> Issued {formatDate(invoice.issue_date)} · due {formatDate(invoice.due_date)}
          </p>
        </div>
        <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer" className="btn-ghost">Download PDF</a>
      </div>

      <section className="card">
        <ul className="divide-y divide-line text-sm">
          {items.map((it) => (
            <li key={it.id} className="flex justify-between gap-4 py-2">
              <span>
                {it.description}
                <span className="block text-xs text-ink-soft">{[it.patient_name, Number(it.quantity) !== 1 ? `${Number(it.quantity)} × ${formatIDR(it.unit_price)}` : null, it.insurance_covered ? 'claimed from insurance' : null].filter(Boolean).join(' · ')}</span>
              </span>
              <span>{formatIDR(it.amount)}</span>
            </li>
          ))}
        </ul>
        <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
          {invoice.discount ? <div className="flex justify-between"><dt>Discount</dt><dd>− {formatIDR(invoice.discount)}</dd></div> : null}
          {invoice.tax ? <div className="flex justify-between"><dt>Tax</dt><dd>{formatIDR(invoice.tax)}</dd></div> : null}
          <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{formatIDR(invoice.total)}</dd></div>
          {invoice.insurer_portion > 0 ? <div className="flex justify-between text-teal"><dt>Billed to {invoice.insurer_name}</dt><dd>− {formatIDR(invoice.insurer_portion)}</dd></div> : null}
          {invoice.patient_paid > 0 ? <div className="flex justify-between"><dt>You&rsquo;ve paid</dt><dd>− {formatIDR(invoice.patient_paid)}</dd></div> : null}
          <div className="flex justify-between border-t border-line pt-2 font-headline text-xl font-extrabold text-pulse"><dt>To pay</dt><dd>{formatIDR(Math.max(0, invoice.patient_balance))}</dd></div>
        </dl>
      </section>

      {open && invoice.patient_balance > 0 ? (
        <section className="card border-clay/40">
          <h2 className="font-headline text-xl font-extrabold text-pulse">Pay this invoice</h2>
          {pending > 0 ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">We&rsquo;re checking a payment of {formatIDR(pending)} you sent. {toPay > 0 ? `${formatIDR(toPay)} is still to pay.` : ''}</p> : null}
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <div className="rounded-2xl bg-paper p-4">
                <p className="card-title mb-2">1 · Bank transfer</p>
                {clinic.bank_account_number ? (
                  <dl className="space-y-1">
                    <div className="flex justify-between gap-2"><dt className="text-ink-soft">Bank</dt><dd className="font-semibold">{clinic.bank_name}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-ink-soft">Account name</dt><dd className="font-semibold">{clinic.bank_account_name}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-ink-soft">Account no.</dt><dd className="font-mono font-semibold">{clinic.bank_account_number}</dd></div>
                    {clinic.bank_swift ? <div className="flex justify-between gap-2"><dt className="text-ink-soft">SWIFT</dt><dd className="font-mono">{clinic.bank_swift}</dd></div> : null}
                    <div className="flex justify-between gap-2"><dt className="text-ink-soft">Reference</dt><dd className="font-mono font-semibold">{invoice.invoice_number}</dd></div>
                  </dl>
                ) : (
                  <p>Bank details will be shown here soon. In the meantime please pay at reception.</p>
                )}
              </div>
              <div className="rounded-2xl bg-paper p-4">
                <p className="card-title mb-2">Or at reception</p>
                <p>Cash, card and QRIS are accepted at the front desk.</p>
              </div>
            </div>
            {toPay > 0 ? (
              <div>
                <p className="card-title mb-2">2 · Send us your receipt</p>
                <ActionForm action={submitPaymentProof} submitLabel="Send receipt" submitClassName="btn-clay" resetOnSuccess>
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Amount paid (Rp)" name="amount" type="number" min="1" defaultValue={toPay} required />
                    <Field label="Date paid" name="paid_at" type="date" defaultValue={todayISO()} required />
                    <Select label="Paid by" name="method" options={[{ value: 'bank_transfer', label: 'Bank transfer' }, { value: 'qris', label: 'QRIS' }]} />
                    <Field label="Transfer reference" name="reference" placeholder="Optional" />
                  </div>
                  <div>
                    <label className="label" htmlFor="proof">Receipt or screenshot *</label>
                    <input className="input py-2 text-sm" id="proof" name="proof" type="file" accept="image/*,application/pdf" required />
                  </div>
                </ActionForm>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {patientPayments.length ? (
        <section className="card">
          <h2 className="card-title mb-3">Your payments</h2>
          <ul className="divide-y divide-line text-sm">
            {patientPayments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{formatDate(p.paid_at)} · {PAYMENT_METHOD_LABELS[p.method]}</span>
                <span className="flex items-center gap-2">
                  {formatIDR(p.amount)}
                  {p.status === 'confirmed' ? <Pill tone="teal">Received</Pill> : p.status === 'pending_review' ? <Pill tone="amber">Checking</Pill> : <Pill tone="red">Not received</Pill>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
