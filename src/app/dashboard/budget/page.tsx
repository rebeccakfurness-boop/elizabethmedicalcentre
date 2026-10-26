import Link from 'next/link';
import { logOtherIncome } from '@/app/actions/finance';
import { StatTile } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { Field, Select } from '@/components/ui/Field';
import { PAYMENT_METHOD_LABELS } from '@/lib/billing';
import { getCashPosition, getCategories, getMonthActuals, getMonthlyTrend } from '@/lib/budget';
import { formatDate, formatIDR, todayISO } from '@/lib/format';
import { requireBudgetUnlocked } from '@/lib/session';

function monthLabel(month: string) {
  return new Date(month + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function BudgetOverview({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireBudgetUnlocked();
  const { month: monthParam } = await searchParams;
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : todayISO().slice(0, 7);
  const [actuals, cash, trend, categories] = await Promise.all([getMonthActuals(month), getCashPosition(), getMonthlyTrend(6), getCategories()]);
  const expenses = actuals.filter((c) => c.kind === 'expense');
  const revenue = actuals.filter((c) => c.kind === 'revenue');
  const totalIn = revenue.reduce((s, c) => s + c.actual, 0);
  const totalOut = expenses.reduce((s, c) => s + c.actual, 0);
  const totalBudget = expenses.reduce((s, c) => s + c.monthly_budget, 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="card-title">Budget tracker</p>
          <h1 className="page-title mt-1">{monthLabel(month)}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/budget?month=${shiftMonth(month, -1)}`} className="btn-ghost btn-sm">← Previous</Link>
          <Link href="/dashboard/budget" className="btn-ghost btn-sm">This month</Link>
          <Link href={`/dashboard/budget?month=${shiftMonth(month, 1)}`} className="btn-ghost btn-sm">Next →</Link>
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Money in" value={formatIDR(totalIn)} tone="good" />
        <StatTile label="Money out" value={formatIDR(totalOut)} note={totalBudget ? `of ${formatIDR(totalBudget)} budgeted` : undefined} />
        <StatTile label="Net" value={formatIDR(totalIn - totalOut)} tone={totalIn - totalOut < 0 ? 'alert' : 'good'} />
        <StatTile label="Cash position" value={formatIDR(cash.cash)} note={`From ${formatIDR(cash.opening)} on ${formatDate(cash.opening_date)}`} href="/dashboard/budget/setup" />
      </div>

      <h2 className="card-title mb-3">Spending against budget</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {expenses.map((c) => {
          const pct = c.monthly_budget > 0 ? (c.actual / c.monthly_budget) * 100 : c.actual > 0 ? 100 : 0;
          const bar = pct > 100 ? 'bg-red-600' : pct >= 80 ? 'bg-amber-500' : 'bg-teal';
          return (
            <div key={c.id} className="card">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{c.name}</p>
                <p className={`text-xs font-bold ${pct > 100 ? 'text-red-700' : 'text-ink-soft'}`}>{c.monthly_budget ? `${Math.round(pct)}%` : 'No budget'}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${Math.round(pct)}% of budget used`}>
                <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-ink-soft">
                <span>Spent {formatIDR(c.actual)}</span>
                <span>
                  {c.monthly_budget
                    ? c.actual > c.monthly_budget
                      ? `${formatIDR(c.actual - c.monthly_budget)} over`
                      : `${formatIDR(c.monthly_budget - c.actual)} left`
                    : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="card-title mb-3">Income by category</h2>
          <table className="table">
            <tbody>
              {revenue.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="text-right font-semibold">{formatIDR(c.actual)}</td>
                  <td className="text-right text-xs text-ink-soft">{c.monthly_budget ? `target ${formatIDR(c.monthly_budget)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2 className="card-title mb-3">Last six months</h2>
          <table className="table">
            <thead><tr><th>Month</th><th className="text-right">In</th><th className="text-right">Out</th><th className="text-right">Net</th></tr></thead>
            <tbody>
              {trend.map((t) => (
                <tr key={t.month}>
                  <td><Link href={`/dashboard/budget?month=${t.month}`} className="text-teal hover:underline">{monthLabel(t.month)}</Link></td>
                  <td className="text-right">{formatIDR(t.revenue)}</td>
                  <td className="text-right">{formatIDR(t.expenses)}</td>
                  <td className={`text-right font-semibold ${t.revenue - t.expenses < 0 ? 'text-red-700' : 'text-teal'}`}>{formatIDR(t.revenue - t.expenses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2 className="card-title mb-1">Log other income</h2>
          <p className="mb-3 text-sm text-ink-soft">For money that isn&rsquo;t an invoice payment, such as walk-in pharmacy cash sales. Invoice payments are recorded on the invoice.</p>
          <ActionForm action={logOtherIncome} submitLabel="Record income" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount (Rp)" name="amount" type="number" min="1" required />
              <Select label="Category" name="category_id" required options={categories.filter((c) => c.kind === 'revenue').map((c) => ({ value: c.id, label: c.name }))} />
              <Select label="Method" name="method" defaultValue="cash" options={Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))} />
              <Field label="Date" name="paid_at" type="date" defaultValue={todayISO()} />
              <Field label="Reference / note" name="reference" className="sm:col-span-2" />
            </div>
          </ActionForm>
        </section>

        <section className="card">
          <h2 className="card-title mb-1">Log an expense</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Upload a supplier bill to pay later, or record something already paid, on <Link href="/dashboard/budget/bills" className="text-teal underline">Bills to pay</Link>. Bank-fee and card lines can be categorised straight from the{' '}
            <Link href="/dashboard/budget/bank" className="text-teal underline">bank statement</Link>.
          </p>
          {cash.uncategorised_bills ? <p className="text-sm text-amber-800">{cash.uncategorised_bills} paid expense(s) have no category and don&rsquo;t show above.</p> : null}
        </section>
      </div>
    </div>
  );
}
