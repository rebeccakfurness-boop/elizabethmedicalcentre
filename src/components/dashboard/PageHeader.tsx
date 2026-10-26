import Link from 'next/link';

export function PageHeader({ eyebrow, title, actions, back }: { eyebrow?: string; title: string; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6">
      {back ? (
        <Link href={back.href} className="mb-2 inline-block font-label text-xs font-bold uppercase tracking-[0.12em] text-ink-soft hover:text-teal">
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {eyebrow ? <p className="card-title">{eyebrow}</p> : null}
          <h1 className="page-title mt-1">{title}</h1>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function StatTile({ label, value, href, tone = 'default', note }: { label: string; value: React.ReactNode; href?: string; tone?: 'default' | 'alert' | 'good'; note?: string }) {
  const toneClass = tone === 'alert' ? 'text-red-700' : tone === 'good' ? 'text-teal' : 'text-pulse';
  const inner = (
    <>
      <p className="font-label text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">{label}</p>
      <p className={`mt-2 font-headline text-2xl font-extrabold ${toneClass}`}>{value}</p>
      {note ? <p className="mt-1 text-xs text-ink-soft">{note}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className="card block transition hover:border-teal">{inner}</Link>
  ) : (
    <div className="card">{inner}</div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center text-sm text-ink-soft">{children}</div>;
}
