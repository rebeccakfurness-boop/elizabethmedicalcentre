'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/Logo';

export interface NavItem {
  href: string;
  label: string;
  section?: string;
  locked?: boolean;
}

export function Sidebar({ items, userName, roleLabel, logoutAction }: { items: NavItem[]; userName: string; roleLabel: string; logoutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (['/dashboard', '/dashboard/budget', '/dashboard/operations'].includes(href) ? pathname === href : pathname.startsWith(href));

  return (
    <>
      <div className="flex items-center justify-between bg-teal px-4 py-3 text-cream print:hidden lg:hidden">
        <Logo variant="wordmark" className="h-6" title="The Doctors" />
        <button className="font-label text-xs font-bold uppercase tracking-widest" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      <aside className={`${open ? 'block' : 'hidden'} w-full shrink-0 bg-teal text-cream print:hidden lg:sticky lg:top-0 lg:block lg:h-screen lg:w-64 lg:overflow-y-auto`}>
        <div className="hidden px-6 pb-4 pt-7 lg:block">
          <Link href="/dashboard" className="block w-40">
            <Logo variant="logo-combination" title="The Doctors – Elizabeth Medical Centre" />
          </Link>
        </div>
        <nav className="px-3 pb-4" aria-label="Dashboard">
          {items.map((item, i) => {
            const header = item.section && item.section !== items[i - 1]?.section ? item.section : null;
            return (
              <div key={item.href}>
                {header ? <p className="mb-1 mt-5 px-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-cream/55">{header}</p> : null}
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                    isActive(item.href) ? 'bg-cream font-semibold text-pulse' : 'text-cream/90 hover:bg-white/10'
                  }`}
                >
                  {item.label}
                  {item.locked ? <span aria-label="PIN protected" title="PIN protected">🔒</span> : null}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/15 px-6 py-4 text-sm">
          <p className="font-semibold">{userName}</p>
          <p className="text-xs text-cream/70">{roleLabel}</p>
          <div className="mt-3 flex gap-3 text-xs">
            <Link href="/account/password" className="underline-offset-2 hover:underline">Password</Link>
            <form action={logoutAction}>
              <button className="underline-offset-2 hover:underline">Sign out</button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
