import Link from 'next/link';
import { reviewPaymentAction } from '@/app/actions/billing';
import { EmptyState, PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { Pill } from '@/components/ui/Badges';
import { listPayments, PAYMENT_METHOD_LABELS } from '@/lib/billing';
import { formatDate, formatIDR } from '@/lib/format';
import { requirePermission } from '@/lib/session';

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission('finance');
  const { status } = await searchParams;
  const pending = await listPayments({ status: 'pending_review' });
  const payments = await listPayments({ status: status === 'pending_review' ? 'pending_review' : 'confirmed', limit: 200 });

  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow="Billing" title="Payments" />

      <section className="card mb-6">
        <h2 className="card-title mb-1">Payments reported by patients</h2>
        <p className="mb-4 text-sm text-ink-soft">
          Patients who pay by bank transfer upload their receipt in the portal. Check the money has arrived (or match it from a bank statement, which confirms it
          automatically), then confirm it here.
        </p>
        {pending.length === 0 ? (
          <EmptyState>Nothing to review.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Reported</th><th>Family</th><th>Invoice</th><th>Method</th><th>Receipt</th><th className="text-right">Amount</th><th></th></tr></thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.paid_at)}</td>
                    <td>{p.account_name}</td>
                    <td>{p.invoice_id ? <Link href={`/dashboard/invoices/${p.invoice_id}`} className="text-teal hover:underline">{p.invoice_number}</Link> : '—'}</td>
                    <td>{PAYMENT_METHOD_LABELS[p.method]}<span className="block text-xs text-ink-soft">{p.reference}</span></td>
                    <td>{p.proof_file_id ? <a href={`/api/files/${p.proof_file_id}`} target="_blank" rel="noreferrer" className="text-teal underline">View</a> : '—'}</td>
                    <td className="text-right font-semibold">{formatIDR(p.amount)}</td>
                    <td className="whitespace-nowrap text-right">
                      <ActionForm action={reviewPaymentAction} submitLabel="Confirm" submitClassName="btn-primary btn-sm" inline>
                        <input type="hidden" name="payment_id" value={p.id} />
                        <input type="hidden" name="decision" value="confirm" />
                      </ActionForm>{' '}
                      <ActionForm action={reviewPaymentAction} submitLabel="Reject" submitClassName="btn-ghost btn-sm" inline confirm="Reject this payment? The family will see it as not received.">
                        <input type="hidden" name="payment_id" value={p.id} />
                        <input type="hidden" name="decision" value="reject" />
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card-title mb-3">Received</h2>
        {payments.length === 0 ? (
          <EmptyState>No payments yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Date</th><th>From</th><th>Invoice / category</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.paid_at)}</td>
                    <td>{p.payer_type === 'insurer' ? <Pill tone="teal">Insurer</Pill> : p.payer_type === 'other' ? 'Other income' : p.account_name}</td>
                    <td>{p.invoice_id ? <Link href={`/dashboard/invoices/${p.invoice_id}`} className="text-teal hover:underline">{p.invoice_number}</Link> : p.category_name ?? '—'}</td>
                    <td>{PAYMENT_METHOD_LABELS[p.method]}</td>
                    <td className="max-w-xs truncate">{p.reference ?? '—'}</td>
                    <td className="text-right font-semibold">{formatIDR(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
