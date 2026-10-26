import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  createClaimAction,
  deleteDraftAction,
  deletePaymentAction,
  issueInvoiceAction,
  recordPaymentAction,
  reviewPaymentAction,
  sendInvoiceAction,
  voidInvoiceAction,
} from '@/app/actions/billing';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { ClaimStatusBadge, InvoiceStatusBadge, Pill } from '@/components/ui/Badges';
import { Field, Select } from '@/components/ui/Field';
import { getInvoice, getInvoiceItems, listClaims, listPayments, PAYMENT_METHOD_LABELS } from '@/lib/billing';
import { sql } from '@/lib/db';
import { formatDate, formatIDR, todayISO } from '@/lib/format';
import { requirePermission } from '@/lib/session';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('finance');
  const invoice = await getInvoice(Number((await params).id));
  if (!invoice) notFound();
  const [items, payments, claims, fam] = await Promise.all([
    getInvoiceItems(invoice.id),
    listPayments({ invoiceId: invoice.id }),
    listClaims({ invoiceId: invoice.id }),
    sql<{ billing_email: string | null }>`SELECT billing_email FROM families WHERE id = ${invoice.family_id}`,
  ]);
  const open = invoice.status === 'issued' || invoice.status === 'partially_paid';
  const openClaim = claims.find((c) => c.status !== 'rejected');

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow={invoice.account_name}
        title={`Invoice ${invoice.invoice_number}`}
        back={{ href: '/dashboard/invoices', label: 'Invoices' }}
        actions={
          <>
            <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer" className="btn-ghost">View PDF</a>
            {invoice.status !== 'void' ? <Link href={`/dashboard/invoices/${invoice.id}/edit`} className="btn-ghost">Edit</Link> : null}
            {invoice.status === 'draft' ? (
              <ActionForm action={issueInvoiceAction} submitLabel="Issue invoice" submitClassName="btn-clay" inline>
                <input type="hidden" name="id" value={invoice.id} />
              </ActionForm>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <InvoiceStatusBadge status={invoice.status} daysOverdue={invoice.days_overdue} />
            <span className="text-sm text-ink-soft">
              Billed to <strong className="text-ink">{invoice.billed_to_name}</strong> ·{' '}
              <Link href={`/dashboard/families/${invoice.family_id}`} className="text-teal hover:underline">{invoice.account_name}</Link> · issued{' '}
              {formatDate(invoice.issue_date)} · due {formatDate(invoice.due_date)}
              {invoice.sent_at ? ` · emailed ${formatDate(invoice.sent_at)}` : ''}
            </span>
          </div>
          {invoice.void_reason ? <p className="mb-4 rounded-xl bg-stone-100 px-3 py-2 text-sm">Voided: {invoice.void_reason}</p> : null}
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Description</th><th>Patient</th><th className="text-right">Qty</th><th className="text-right">Unit</th><th className="text-right">Amount</th></tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.description} {it.insurance_covered ? <Pill tone="teal">Insured</Pill> : null}</td>
                    <td>{it.patient_id ? <Link href={`/dashboard/patients/${it.patient_id}`} className="text-teal hover:underline">{it.patient_name}</Link> : <span className="text-ink-soft">Family</span>}</td>
                    <td className="text-right">{Number(it.quantity)}</td>
                    <td className="text-right">{formatIDR(it.unit_price)}</td>
                    <td className="text-right">{formatIDR(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-4 max-w-sm space-y-1 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatIDR(invoice.subtotal)}</dd></div>
            {invoice.discount ? <div className="flex justify-between"><dt>Discount</dt><dd>− {formatIDR(invoice.discount)}</dd></div> : null}
            {invoice.tax ? <div className="flex justify-between"><dt>Tax</dt><dd>{formatIDR(invoice.tax)}</dd></div> : null}
            <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total</dt><dd>{formatIDR(invoice.total)}</dd></div>
          </dl>
          {invoice.notes ? <p className="mt-4 whitespace-pre-line rounded-xl bg-paper p-3 text-sm">{invoice.notes}</p> : null}
        </section>

        <aside className="space-y-6">
          <section className="card">
            <h2 className="card-title mb-3">Balances</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <div className="flex justify-between"><dt>Family share</dt><dd>{formatIDR(invoice.patient_portion)}</dd></div>
                <div className="flex justify-between text-ink-soft"><dt>Paid</dt><dd>{formatIDR(invoice.patient_paid)}</dd></div>
                <div className="flex justify-between font-headline text-lg font-extrabold text-pulse"><dt>Family owes</dt><dd>{formatIDR(invoice.status === 'void' ? 0 : invoice.patient_balance)}</dd></div>
              </div>
              {invoice.insurer_id ? (
                <div className="border-t border-line pt-3">
                  <div className="flex justify-between"><dt>{invoice.insurer_name} share</dt><dd>{formatIDR(invoice.insurer_portion)}</dd></div>
                  <div className="flex justify-between text-ink-soft"><dt>Paid</dt><dd>{formatIDR(invoice.insurer_paid)}</dd></div>
                  <div className="flex justify-between font-semibold text-teal"><dt>Insurer owes</dt><dd>{formatIDR(invoice.status === 'void' ? 0 : invoice.insurer_balance)}</dd></div>
                </div>
              ) : null}
            </dl>
          </section>

          {invoice.insurer_id && invoice.insurer_portion > 0 && invoice.status !== 'draft' && invoice.status !== 'void' ? (
            <section className="card">
              <h2 className="card-title mb-3">Insurance claim</h2>
              {claims.map((c) => (
                <Link key={c.id} href={`/dashboard/insurance/${c.id}`} className="mb-2 flex items-center justify-between rounded-xl bg-paper px-3 py-2 text-sm hover:bg-teal-soft">
                  <span>{c.claim_reference ?? `Claim #${c.id}`} · {formatIDR(c.amount_claimed)}</span>
                  <ClaimStatusBadge status={c.status} />
                </Link>
              ))}
              {!openClaim ? (
                <ActionForm action={createClaimAction} submitLabel="Start insurance claim" submitClassName="btn-primary btn-sm">
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                </ActionForm>
              ) : null}
            </section>
          ) : null}

          {invoice.status !== 'draft' && invoice.status !== 'void' ? (
            <section className="card">
              <h2 className="card-title mb-3">Email invoice</h2>
              <ActionForm action={sendInvoiceAction} submitLabel="Send with PDF" submitClassName="btn-ghost btn-sm">
                <input type="hidden" name="id" value={invoice.id} />
                <Field label="To" name="email" type="email" defaultValue={fam[0]?.billing_email} required />
              </ActionForm>
            </section>
          ) : null}
        </aside>
      </div>

      <section className="card mt-6">
        <h2 className="card-title mb-3">Payments</h2>
        {payments.length === 0 ? (
          <p className="mb-4 text-sm text-ink-soft">No payments yet.</p>
        ) : (
          <div className="mb-6 overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>From</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.paid_at)}</td>
                    <td>{p.payer_type === 'insurer' ? invoice.insurer_name : 'Family'}{p.submitted_by_patient ? <span className="block text-xs text-ink-soft">via portal</span> : null}</td>
                    <td>{PAYMENT_METHOD_LABELS[p.method]}{p.bank_transaction_id ? <span className="block text-xs text-ink-soft">bank-matched</span> : null}</td>
                    <td>
                      {p.reference ?? '—'}
                      {p.proof_file_id ? <a href={`/api/files/${p.proof_file_id}`} target="_blank" rel="noreferrer" className="block text-xs text-teal underline">Receipt</a> : null}
                    </td>
                    <td className="text-right font-semibold">{formatIDR(p.amount)}</td>
                    <td>{p.status === 'confirmed' ? <Pill tone="teal">Confirmed</Pill> : p.status === 'pending_review' ? <Pill tone="amber">To review</Pill> : <Pill tone="red">Rejected</Pill>}</td>
                    <td className="space-x-1 whitespace-nowrap text-right">
                      {p.status === 'pending_review' ? (
                        <>
                          <ActionForm action={reviewPaymentAction} submitLabel="Confirm" submitClassName="btn-primary btn-sm" inline>
                            <input type="hidden" name="payment_id" value={p.id} />
                            <input type="hidden" name="decision" value="confirm" />
                          </ActionForm>
                          <ActionForm action={reviewPaymentAction} submitLabel="Reject" submitClassName="btn-ghost btn-sm" inline>
                            <input type="hidden" name="payment_id" value={p.id} />
                            <input type="hidden" name="decision" value="reject" />
                          </ActionForm>
                        </>
                      ) : (
                        <ActionForm action={deletePaymentAction} submitLabel="Remove" submitClassName="btn-ghost btn-sm" inline confirm="Remove this payment? The invoice balance goes back up.">
                          <input type="hidden" name="payment_id" value={p.id} />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {open ? (
          <div className="rounded-2xl bg-paper p-4">
            <h3 className="mb-3 font-headline text-lg font-extrabold text-pulse">Record a payment</h3>
            <ActionForm action={recordPaymentAction} submitLabel="Record payment" submitClassName="btn-primary" resetOnSuccess>
              <input type="hidden" name="invoice_id" value={invoice.id} />
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Select
                  label="Paid by"
                  name="payer_type"
                  defaultValue="patient"
                  options={[{ value: 'patient', label: 'Family' }, ...(invoice.insurer_id ? [{ value: 'insurer', label: invoice.insurer_name ?? 'Insurer' }] : [])]}
                />
                <Field label="Amount (Rp)" name="amount" type="number" min="1" step="1" defaultValue={invoice.patient_balance > 0 ? invoice.patient_balance : invoice.insurer_balance} required />
                <Select label="Method" name="method" defaultValue="cash" options={Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))} />
                <Field label="Date" name="paid_at" type="date" defaultValue={todayISO()} required />
                <Field label="Reference" name="reference" placeholder="Receipt / approval no." />
                <div>
                  <label className="label" htmlFor="proof">Receipt (optional)</label>
                  <input className="input py-2 text-xs" id="proof" name="proof" type="file" accept="image/*,application/pdf" />
                </div>
              </div>
            </ActionForm>
          </div>
        ) : null}
      </section>

      {invoice.status !== 'void' ? (
        <details className="card mt-6">
          <summary className="cursor-pointer font-label text-xs font-bold uppercase tracking-wider text-ink-soft">Void or delete</summary>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {invoice.status === 'draft' ? (
              <ActionForm action={deleteDraftAction} submitLabel="Delete draft" submitClassName="btn-danger" confirm="Delete this draft invoice permanently?">
                <input type="hidden" name="id" value={invoice.id} />
                <p className="text-sm text-ink-soft">Drafts were never seen by the family, so they can be deleted outright.</p>
              </ActionForm>
            ) : (
              <ActionForm action={voidInvoiceAction} submitLabel="Void invoice" submitClassName="btn-danger" confirm="Void this invoice? It stays on record but no longer counts towards the balance.">
                <input type="hidden" name="id" value={invoice.id} />
                <Field label="Reason" name="reason" placeholder="e.g. Billed in error" required />
              </ActionForm>
            )}
          </div>
        </details>
      ) : null}
    </div>
  );
}
