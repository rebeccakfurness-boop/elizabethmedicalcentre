'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/dashboard/budget', label: 'Overview' },
  { href: '/dashboard/budget/bills', label: 'Bills to pay' },
  { href: '/dashboard/budget/bank', label: 'Bank statements' },
  { href: '/dashboard/budget/transactions', label: 'Transactions' },
  { href: '/dashboard/budget/setup', label: 'Budget setup' },
];

export function FinanceTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 rounded-full border border-line bg-white p-1" aria-label="Finance">
      {TABS.map((t) => {
        const active = t.href === '/dashboard/budget' ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={`rounded-full px-4 py-1.5 font-label text-xs font-bold ${active ? 'bg-teal text-cream' : 'text-ink-soft hover:text-teal'}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
