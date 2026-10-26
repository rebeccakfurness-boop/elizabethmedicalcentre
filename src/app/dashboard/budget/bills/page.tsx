import Link from 'next/link';
import { createBill, payBill } from '@/app/actions/finance';
import { EmptyState } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { Pill } from '@/components/ui/Badges';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { getCategories, listBills } from '@/lib/budget';
import { formatDate, formatIDR, todayISO } from '@/lib/format';
import { requireBudgetUnlocked } from '@/lib/session';

const METHOD_OPTIONS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'qris', label: 'QRIS' },
  { value: 'other', label: 'Other' },
];

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requireBudgetUnlocked();
  const { filter = 'unpaid' } = await searchParams;
  const [bills, categories] = await Promise.all([listBills(filter), getCategories()]);
  const expenseCats = categories.filter((c) => c.kind === 'expense').map((c) => ({ value: c.id, label: c.name }));
  const totalDue = bills.filter((b) => b.status === 'unpaid').reduce((s, b) => s + b.amount, 0);

  return (
    <div>
      <p className="card-title">Budget tracker</p>
      <h1 className="page-title mb-6 mt-1">Bills to pay</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {[{ v: 'unpaid', l: 'To pay' }, { v: 'overdue', l: 'Overdue' }, { v: 'paid', l: 'Paid' }, { v: 'all', l: 'All' }].map((f) => (
              <Link key={f.v} href={`/dashboard/budget/bills?filter=${f.v}`} className={`rounded-full px-3.5 py-1.5 font-label text-xs font-bold ${filter === f.v ? 'bg-teal text-cream' : 'border border-line bg-white text-ink-soft hover:border-teal'}`}>{f.l}</Link>
            ))}
            {totalDue ? <span className="ml-auto text-sm text-ink-soft">Total to pay <strong className="text-pulse">{formatIDR(totalDue)}</strong></span> : null}
          </div>
          {bills.length === 0 ? (
            <EmptyState>No bills here.</EmptyState>
          ) : (
            <div className="space-y-3">
              {bills.map((b) => (
                <div key={b.id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/dashboard/budget/bills/${b.id}`} className="font-semibold text-teal hover:underline">{b.vendor}</Link>
                      <p className="text-xs text-ink-soft">
                        {b.bill_reference ? `${b.bill_reference} · ` : ''}{b.category_name ?? 'Uncategorised'} · {formatDate(b.issue_date)}
                        {b.file_id ? <> · <a href={`/api/files/${b.file_id}`} target="_blank" rel="noreferrer" className="text-teal underline">{b.file_name}</a></> : null}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-headline text-lg font-extrabold text-pulse">{formatIDR(b.amount)}</p>
                      {b.status === 'paid' ? (
                        <Pill tone="teal">Paid {formatDate(b.paid_at)}</Pill>
                      ) : b.status === 'void' ? (
                        <Pill>Void</Pill>
                      ) : b.days_overdue > 0 ? (
                        <Pill tone="red">{b.days_overdue}d overdue</Pill>
                      ) : (
                        <Pill tone="amber">{b.due_date ? `Due ${formatDate(b.due_date)}` : 'Unpaid'}</Pill>
                      )}
                    </div>
                  </div>
                  {b.status === 'unpaid' ? (
                    <div className="mt-3 border-t border-line pt-3">
                      <ActionForm action={payBill} submitLabel="Mark paid" submitClassName="btn-primary btn-sm" inline>
                        <input type="hidden" name="id" value={b.id} />
                        <input className="input w-auto py-1.5" type="date" name="paid_at" defaultValue={todayISO()} aria-label="Date paid" />
                        <select className="input w-auto py-1.5" name="payment_method" defaultValue="bank_transfer" aria-label="Payment method">
                          {METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </ActionForm>
                      <p className="mt-2 text-xs text-ink-soft">Paid by bank transfer? Matching it on the bank statement marks it paid for you.</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card h-fit">
          <h2 className="card-title mb-1">Upload a bill</h2>
          <p className="mb-4 text-sm text-ink-soft">Supplier invoices, rent, utilities, payroll. Attach the PDF or a photo.</p>
          <ActionForm action={createBill} submitLabel="Add bill" submitClassName="btn-clay" resetOnSuccess>
            <div>
              <label className="label" htmlFor="file">Bill (PDF or photo)</label>
              <input className="input py-2 text-xs" id="file" name="file" type="file" accept="image/*,application/pdf" />
            </div>
            <Field label="From (vendor)" name="vendor" required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (Rp)" name="amount" type="number" min="1" required />
              <Field label="Their reference" name="bill_reference" />
              <Field label="Bill date" name="issue_date" type="date" defaultValue={todayISO()} />
              <Field label="Due date" name="due_date" type="date" />
            </div>
            <Select label="Category" name="category_id" placeholder="Choose…" options={expenseCats} />
            <TextArea label="Notes" name="notes" rows={2} />
            <details className="rounded-xl bg-paper p-3">
              <summary className="cursor-pointer text-sm font-semibold">Already paid?</summary>
              <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="already_paid" className="h-4 w-4 accent-teal" /> Record as paid</label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Field label="Paid on" name="paid_at" type="date" defaultValue={todayISO()} />
                <Select label="Method" name="payment_method" options={METHOD_OPTIONS} />
              </div>
            </details>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
