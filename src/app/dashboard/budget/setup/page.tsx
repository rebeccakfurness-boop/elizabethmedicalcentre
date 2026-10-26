import { addCategory, archiveCategory, saveCategoryBudgets, saveOpeningBalance } from '@/app/actions/finance';
import { ActionForm } from '@/components/ui/ActionForm';
import { Pill } from '@/components/ui/Badges';
import { Field, Select } from '@/components/ui/Field';
import { getCashPosition, getCategories, getCategoryHistory } from '@/lib/budget';
import { formatDate, formatIDR } from '@/lib/format';
import { requireBudgetUnlocked } from '@/lib/session';

export default async function BudgetSetupPage() {
  await requireBudgetUnlocked();
  const [categories, history, cash] = await Promise.all([getCategories(true), getCategoryHistory(), getCashPosition()]);
  return (
    <div>
      <p className="card-title">Budget tracker</p>
      <h1 className="page-title mb-6 mt-1">Budget setup</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="card-title mb-1">Monthly budgets</h2>
          <p className="mb-4 text-sm text-ink-soft">Set how much you plan to spend (or expect to earn) per category each month. Every change is logged with who made it.</p>
          <ActionForm action={saveCategoryBudgets} submitLabel="Save budgets">
            <table className="table">
              <thead><tr><th>Category</th><th>Type</th><th className="w-48">Monthly (Rp)</th><th></th></tr></thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className={c.is_archived ? 'opacity-50' : ''}>
                    <td>{c.name} {c.is_archived ? <Pill>Archived</Pill> : null}</td>
                    <td className="text-xs uppercase text-ink-soft">{c.kind === 'expense' ? 'Spending' : 'Income'}</td>
                    <td><input className="input py-1.5 text-right" type="number" min="0" step="1000" name={`budget_${c.id}`} defaultValue={c.monthly_budget} aria-label={`${c.name} monthly budget`} disabled={c.is_archived} /></td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </ActionForm>
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((c) => (
              <ActionForm key={c.id} action={archiveCategory} submitLabel={`${c.is_archived ? 'Restore' : 'Archive'} ${c.name}`} submitClassName="btn-ghost btn-sm" inline>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="archived" value={String(!c.is_archived)} />
              </ActionForm>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="card">
            <h2 className="card-title mb-1">Opening cash balance</h2>
            <p className="mb-3 text-sm text-ink-soft">The bank balance on a starting date. Cash position = this plus everything received, minus everything paid out since.</p>
            <ActionForm action={saveOpeningBalance} submitLabel="Save">
              <Field label="Balance (Rp)" name="opening_cash_balance" type="number" defaultValue={cash.opening} required />
              <Field label="As of" name="opening_cash_date" type="date" defaultValue={cash.opening_date} required />
            </ActionForm>
          </section>
          <section className="card">
            <h2 className="card-title mb-3">Add a category</h2>
            <ActionForm action={addCategory} submitLabel="Add category" resetOnSuccess>
              <Field label="Name" name="name" required />
              <Select label="Type" name="kind" options={[{ value: 'expense', label: 'Spending' }, { value: 'revenue', label: 'Income' }]} />
              <Field label="Monthly budget (Rp)" name="monthly_budget" type="number" defaultValue={0} />
            </ActionForm>
          </section>
          <section className="card">
            <h2 className="card-title mb-3">Change history</h2>
            {history.length === 0 ? (
              <p className="text-sm text-ink-soft">No changes yet.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {history.map((h) => (
                  <li key={h.id}>
                    <strong>{h.category_name}</strong>: {formatIDR(h.old_value)} → {formatIDR(h.new_value)}
                    <span className="block text-ink-soft">{h.changed_by_name ?? 'Unknown'} · {formatDate(h.changed_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
