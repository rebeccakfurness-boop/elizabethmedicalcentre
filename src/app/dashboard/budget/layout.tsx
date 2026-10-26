import Link from 'next/link';
import { lockBudget } from '@/app/actions/finance';
import { PinGate } from '@/components/finance/PinGate';
import { FinanceTabs } from '@/components/finance/FinanceTabs';
import { getClinicSettings } from '@/lib/billing';
import { isBudgetUnlocked, requirePermission } from '@/lib/session';

// Everything under /dashboard/budget sits behind the budget PIN, on top of the super admin login.
// Each server action re-checks the PIN too (requireBudgetUnlocked), so the layout isn't the only gate.
export default async function BudgetLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('finance');
  const settings = await getClinicSettings();
  if (!settings.budget_pin_hash) {
    return (
      <div className="mx-auto mt-10 max-w-md text-center">
        <h1 className="page-title">Set a budget PIN first</h1>
        <p className="mb-6 mt-2 text-sm text-ink-soft">The budget tracker, bills and bank statements are protected by a separate PIN. Set one to get started.</p>
        <Link href="/dashboard/settings#pin" className="btn-primary">Set the PIN</Link>
      </div>
    );
  }
  if (!(await isBudgetUnlocked())) return <PinGate />;
  return (
    <div className="max-w-7xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <FinanceTabs />
        <form action={lockBudget}>
          <button className="btn-ghost btn-sm">🔒 Lock</button>
        </form>
      </div>
      {children}
    </div>
  );
}
