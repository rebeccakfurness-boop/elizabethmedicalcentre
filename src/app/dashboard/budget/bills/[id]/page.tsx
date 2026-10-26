import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setBillStatus, updateBill } from '@/app/actions/finance';
import { ActionForm } from '@/components/ui/ActionForm';
import { Pill } from '@/components/ui/Badges';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { getBill, getCategories } from '@/lib/budget';
import { formatDate, formatIDR } from '@/lib/format';
import { requireBudgetUnlocked } from '@/lib/session';

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  await requireBudgetUnlocked();
  const bill = await getBill(Number((await params).id));
  if (!bill) notFound();
  const categories = await getCategories();
  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/budget/bills" className="mb-2 inline-block font-label text-xs font-bold uppercase tracking-[0.12em] text-ink-soft hover:text-teal">← Bills</Link>
      <h1 className="page-title mb-2">{bill.vendor} · {formatIDR(bill.amount)}</h1>
      <p className="mb-6 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        {bill.status === 'paid' ? <Pill tone="teal">Paid {formatDate(bill.paid_at)} · {bill.payment_method}</Pill> : bill.status === 'void' ? <Pill>Void</Pill> : <Pill tone="amber">Unpaid</Pill>}
        {bill.bank_transaction_id ? <span>Matched to bank line #{bill.bank_transaction_id}</span> : null}
        {bill.file_id ? <a href={`/api/files/${bill.file_id}`} target="_blank" rel="noreferrer" className="text-teal underline">Open {bill.file_name}</a> : null}
      </p>
      <div className="card">
        <ActionForm action={updateBill} submitLabel="Save bill">
          <input type="hidden" name="id" value={bill.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vendor" name="vendor" defaultValue={bill.vendor} required />
            <Field label="Amount (Rp)" name="amount" type="number" defaultValue={bill.amount} required />
            <Field label="Their reference" name="bill_reference" defaultValue={bill.bill_reference} />
            <Select label="Category" name="category_id" defaultValue={bill.category_id} placeholder="Uncategorised" options={categories.filter((c) => c.kind === 'expense').map((c) => ({ value: c.id, label: c.name }))} />
            <Field label="Bill date" name="issue_date" type="date" defaultValue={bill.issue_date} />
            <Field label="Due date" name="due_date" type="date" defaultValue={bill.due_date} />
          </div>
          <TextArea label="Notes" name="notes" defaultValue={bill.notes} />
          <div>
            <label className="label" htmlFor="file">Replace attachment</label>
            <input className="input py-2 text-xs" id="file" name="file" type="file" accept="image/*,application/pdf" />
          </div>
        </ActionForm>
      </div>
      {bill.status !== 'void' ? (
        <div className="mt-4 flex gap-2">
          {bill.status === 'paid' ? (
            <ActionForm action={setBillStatus} submitLabel="Mark unpaid" submitClassName="btn-ghost btn-sm" inline>
              <input type="hidden" name="id" value={bill.id} />
              <input type="hidden" name="status" value="unpaid" />
            </ActionForm>
          ) : null}
          <ActionForm action={setBillStatus} submitLabel="Void bill" submitClassName="btn-danger btn-sm" inline confirm="Void this bill?">
            <input type="hidden" name="id" value={bill.id} />
            <input type="hidden" name="status" value="void" />
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
