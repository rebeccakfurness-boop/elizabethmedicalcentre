import Link from 'next/link';
import { getLedger } from '@/lib/budget';
import { formatDate, formatIDR, todayISO } from '@/lib/format';
import { requireBudgetUnlocked } from '@/lib/session';

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; q?: string }> }) {
  await requireBudgetUnlocked();
  const sp = await searchParams;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : todayISO();
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : `${to.slice(0, 7)}-01`;
  const q = sp.q ?? '';
  const rows = await getLedger(from, to, q);
  const totalIn = rows.filter((r) => r.kind === 'in').reduce((s, r) => s + r.amount, 0);
  const totalOut = rows.filter((r) => r.kind === 'out').reduce((s, r) => s + r.amount, 0);
  return (
    <div>
      <p className="card-title">Budget tracker</p>
      <h1 className="page-title mb-6 mt-1">Transactions</h1>
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <div><label className="label" htmlFor="from">From</label><input className="input" type="date" id="from" name="from" defaultValue={from} /></div>
        <div><label className="label" htmlFor="to">To</label><input className="input" type="date" id="to" name="to" defaultValue={to} /></div>
        <div className="min-w-60 flex-1"><label className="label" htmlFor="q">Search</label><input className="input" id="q" name="q" defaultValue={q} placeholder="Name, invoice, vendor or category" /></div>
        <button className="btn-primary">Filter</button>
      </form>
      <p className="mb-3 text-sm text-ink-soft">
        In <strong className="text-teal">{formatIDR(totalIn)}</strong> · Out <strong className="text-red-700">{formatIDR(totalOut)}</strong> · Net <strong>{formatIDR(totalIn - totalOut)}</strong>
      </p>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="table">
          <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Method</th><th>Receipt</th><th className="text-right">In</th><th className="text-right">Out</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`}>
                <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                <td><Link href={r.link} className="hover:text-teal hover:underline">{r.description}</Link></td>
                <td>{r.category ?? <span className="text-amber-700">Uncategorised</span>}</td>
                <td className="text-xs">{r.method ?? '—'}</td>
                <td>{r.file_id ? <a href={`/api/files/${r.file_id}`} target="_blank" rel="noreferrer" className="text-teal underline">View</a> : ''}</td>
                <td className="text-right text-teal">{r.kind === 'in' ? formatIDR(r.amount) : ''}</td>
                <td className="text-right text-red-700">{r.kind === 'out' ? formatIDR(r.amount) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-6 text-center text-sm text-ink-soft">No transactions in this period.</p> : null}
      </div>
    </div>
  );
}
