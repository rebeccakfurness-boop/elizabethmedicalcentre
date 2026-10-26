import { notFound } from 'next/navigation';
import { saveInventoryItem } from '@/app/actions/inventory';
import { ItemFields } from '@/components/operations/ItemFields';
import { StockForm } from '@/components/operations/StockForm';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { Pill } from '@/components/ui/Badges';
import { can } from '@/lib/auth';
import { addDaysISO, formatClinicTime, formatDate, formatIDR, todayISO } from '@/lib/format';
import { stockStatus } from '@/lib/ops-shared';
import { getBatches, getInventoryItem, getMovements, getSuppliers } from '@/lib/operations';
import { requireStaff } from '@/lib/session';

const KIND = { receive: 'Received', use: 'Used', dispose: 'Disposed', adjust: 'Count adjustment' } as Record<string, string>;

export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const item = await getInventoryItem(Number((await params).id));
  if (!item) notFound();
  const [batches, movements, suppliers] = await Promise.all([getBatches(item.id), getMovements(item.id), getSuppliers()]);
  const today = todayISO();
  const status = stockStatus(item.quantity, item.reorder_level);
  const since = addDaysISO(today, -30);
  const used30 = movements.filter((m) => m.kind === 'use' && new Date(m.created_at).toISOString().slice(0, 10) >= since).reduce((s, m) => s - m.quantity, 0);

  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow={`Inventory · ${item.category}`} title={item.name} back={{ href: '/dashboard/operations/inventory', label: 'Inventory' }} />
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <section className="card">
          <p className="text-sm text-ink-soft">In stock</p>
          <p className="font-headline text-3xl font-extrabold text-pulse">{item.quantity} <span className="text-base font-semibold">{item.unit}</span></p>
          <p className="mt-1">{status === 'out' ? <Pill tone="red">Out of stock</Pill> : status === 'low' ? <Pill tone="amber">Running low</Pill> : <Pill tone="teal">OK</Pill>}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-ink-soft">Reorder at</dt><dd>{item.reorder_level}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">On order</dt><dd>{item.on_order || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Used in last 30 days</dt><dd>{used30 || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Supplier</dt><dd>{item.supplier_name ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Cost per unit</dt><dd>{item.unit_cost ? formatIDR(item.unit_cost) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Location</dt><dd>{item.location ?? '—'}</dd></div>
          </dl>
        </section>
        <section className="card lg:col-span-2">
          <h2 className="card-title mb-3">Record a change</h2>
          <StockForm
            itemId={item.id}
            unit={item.unit}
            trackExpiry={item.track_expiry}
            batches={batches.map((b) => ({ id: b.id, label: `${b.batch_no ?? 'No batch'}${b.expiry_date ? ` · exp ${formatDate(b.expiry_date)}` : ''} · ${b.quantity}` }))}
          />
          <h3 className="label mt-5">Batches in stock</h3>
          {batches.length ? (
            <table className="table text-sm">
              <thead><tr><th>Batch</th><th>Expiry</th><th>Quantity</th><th>Received</th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>{b.batch_no ?? '—'}</td>
                    <td className={b.expiry_date && b.expiry_date < today ? 'font-bold text-red-700' : ''}>{b.expiry_date ? formatDate(b.expiry_date) : '—'}{b.expiry_date && b.expiry_date < today ? ' EXPIRED' : ''}</td>
                    <td>{b.quantity}</td>
                    <td className="text-xs">{formatDate(b.received_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-ink-soft">None.</p>}
          <p className="mt-2 text-xs text-ink-soft">“Used” always takes from the batch that expires first.</p>
        </section>
      </div>

      <section className="card mb-6">
        <h2 className="card-title mb-3">History</h2>
        {movements.length ? (
          <div className="max-h-96 overflow-y-auto">
            <table className="table text-sm">
              <thead><tr><th>When</th><th>What</th><th>Change</th><th>Batch</th><th>Who</th><th>Note</th></tr></thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-xs">{formatClinicTime(m.created_at)}</td>
                    <td>{KIND[m.kind] ?? m.kind}</td>
                    <td className={m.quantity < 0 ? 'text-red-700' : 'text-teal'}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                    <td className="text-xs">{m.batch_no ?? ''}{m.expiry_date ? ` exp ${formatDate(m.expiry_date)}` : ''}</td>
                    <td className="text-xs">{m.user_name ?? ''}</td>
                    <td className="text-xs">{m.reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-ink-soft">No changes recorded yet.</p>}
      </section>

      {can(user.role, 'manageOperations') ? (
        <details className="card">
          <summary className="cursor-pointer card-title">Edit item</summary>
          <div className="mt-4"><ActionForm action={saveInventoryItem} submitLabel="Save item"><ItemFields item={item} suppliers={suppliers} /></ActionForm></div>
        </details>
      ) : null}
    </div>
  );
}
