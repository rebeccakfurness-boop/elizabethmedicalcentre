import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/dashboard/PageHeader';
import { InvoiceStatusBadge, Pill } from '@/components/ui/Badges';
import { listInvoices } from '@/lib/billing';
import { formatDate, formatIDR } from '@/lib/format';
import { requirePermission } from '@/lib/session';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'review', label: 'Payment to review' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'draft', label: 'Drafts' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requirePermission('finance');
  const { status = 'all', q = '' } = await searchParams;
  const invoices = await listInvoices({ status, q });
  const outstanding = invoices.filter((i) => i.status === 'issued' || i.status === 'partially_paid');

  return (
    <div className="max-w-7xl">
      <PageHeader eyebrow="Billing" title="Invoices" actions={<Link href="/dashboard/invoices/new" className="btn-clay">+ New invoice</Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/dashboard/invoices?status=${f.value}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={`rounded-full px-3.5 py-1.5 font-label text-xs font-bold ${status === f.value ? 'bg-teal text-cream' : 'border border-line bg-white text-ink-soft hover:border-teal'}`}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <form className="mb-5 flex gap-2">
        <input type="hidden" name="status" value={status} />
        <input className="input max-w-md" name="q" defaultValue={q} placeholder="Invoice number, name or family" aria-label="Search invoices" />
        <button className="btn-primary">Search</button>
      </form>
      {outstanding.length ? (
        <p className="mb-3 text-sm text-ink-soft">
          Showing {invoices.length} invoices · outstanding from families{' '}
          <strong>{formatIDR(outstanding.reduce((s, i) => s + i.patient_balance, 0))}</strong>, from insurers{' '}
          <strong>{formatIDR(outstanding.reduce((s, i) => s + i.insurer_balance, 0))}</strong>
        </p>
      ) : null}
      {invoices.length === 0 ? (
        <EmptyState>No invoices here yet.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Billed to</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th className="text-right">Family owes</th>
                <th className="text-right">Insurer owes</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const open = i.status !== 'draft' && i.status !== 'void';
                return (
                  <tr key={i.id} className="hover:bg-paper">
                    <td>
                      <Link href={`/dashboard/invoices/${i.id}`} className="font-semibold text-teal hover:underline">{i.invoice_number}</Link>
                      {i.pending_review ? <span className="ml-2"><Pill tone="amber">Review</Pill></span> : null}
                    </td>
                    <td>
                      {i.billed_to_name}
                      <Link href={`/dashboard/families/${i.family_id}`} className="block text-xs text-ink-soft hover:underline">{i.account_name}</Link>
                    </td>
                    <td>{formatDate(i.issue_date)}</td>
                    <td>{formatDate(i.due_date)}</td>
                    <td><InvoiceStatusBadge status={i.status} daysOverdue={i.days_overdue} /></td>
                    <td className="text-right">{formatIDR(i.total)}</td>
                    <td className="text-right">{open ? formatIDR(i.patient_balance) : '—'}</td>
                    <td className="text-right">{open && i.insurer_id ? <span title={i.insurer_name ?? ''}>{formatIDR(i.insurer_balance)}</span> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
