import Link from 'next/link';
import { createPurchaseOrders, saveInventoryItem } from '@/app/actions/inventory';
import { ItemFields } from '@/components/operations/ItemFields';
import { StockForm } from '@/components/operations/StockForm';
import { EmptyState, PageHeader, StatTile } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { Pill } from '@/components/ui/Badges';
import { can } from '@/lib/auth';
import { formatDate, todayISO } from '@/lib/format';
import { daysUntil, stockStatus, suggestedOrderQuantity } from '@/lib/ops-shared';
import { getExpiringBatches, getSuppliers, listInventory, listPurchaseOrders } from '@/lib/operations';
import { requireStaff } from '@/lib/session';

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ''));

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; show?: string }> }) {
  const user = await requireStaff();
  const { q = '', category = '', show = '' } = await searchParams;
  const manage = can(user.role, 'manageOperations');
  const today = todayISO();
  const [items, expiring, suppliers, orders] = await Promise.all([listInventory(), getExpiringBatches(60), getSuppliers(), listPurchaseOrders(true)]);
  const categories = Array.from(new Set(items.map((i) => i.category)));
  const needOrder = items.filter((i) => stockStatus(i.quantity, i.reorder_level) !== 'ok' && i.quantity + i.on_order <= i.reorder_level);
  const term = q.toLowerCase();
  const shown = items.filter(
    (i) =>
      (!term || i.name.toLowerCase().includes(term) || (i.sku ?? '').toLowerCase().includes(term) || (i.location ?? '').toLowerCase().includes(term)) &&
      (!category || i.category === category) &&
      (show !== 'low' || stockStatus(i.quantity, i.reorder_level) !== 'ok')
  );
  const out = items.filter((i) => i.quantity <= 0).length;
  const low = items.filter((i) => stockStatus(i.quantity, i.reorder_level) === 'low').length;
  const expired = expiring.filter((b) => b.expiry_date < today);

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Operations"
        title="Inventory"
        back={{ href: '/dashboard/operations', label: 'Operations' }}
        actions={
          <>
            <Link href="/dashboard/operations/inventory/orders" className="btn-ghost btn-sm">Orders{orders.length ? ` (${orders.length})` : ''}</Link>
            {manage ? <Link href="/dashboard/operations/inventory/suppliers" className="btn-ghost btn-sm">Suppliers</Link> : null}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Out of stock" value={out} tone={out ? 'alert' : 'good'} href="/dashboard/operations/inventory?show=low" />
        <StatTile label="Running low" value={low} tone={low ? 'alert' : 'good'} href="/dashboard/operations/inventory?show=low" />
        <StatTile label="Expiring in 60 days" value={expiring.length} note={expired.length ? `${expired.length} already expired` : undefined} tone={expired.length ? 'alert' : 'default'} href="#expiring" />
        <StatTile label="Open orders" value={orders.length} href="/dashboard/operations/inventory/orders" />
      </div>

      {needOrder.length ? (
        <section className="card mb-6 border-amber-300">
          <h2 className="card-title mb-1">Needs reordering ({needOrder.length})</h2>
          <p className="mb-3 text-sm text-ink-soft">At or below the reorder level, counting anything already on order.</p>
          {manage ? (
            <ActionForm action={createPurchaseOrders} submitLabel="Create draft orders" submitClassName="btn-clay btn-sm">
              <table className="table text-sm">
                <thead><tr><th></th><th>Item</th><th>In stock</th><th>Reorder at</th><th>Supplier</th><th>Order</th></tr></thead>
                <tbody>
                  {needOrder.map((i) => (
                    <tr key={i.id}>
                      <td><input type="checkbox" name="item" value={i.id} defaultChecked className="h-4 w-4 accent-teal" aria-label={`Order ${i.name}`} /></td>
                      <td><Link href={`/dashboard/operations/inventory/${i.id}`} className="font-semibold text-teal hover:underline">{i.name}</Link></td>
                      <td>{fmtQty(i.quantity)} {i.unit}</td>
                      <td>{fmtQty(i.reorder_level)}</td>
                      <td>{i.supplier_name ?? <span className="text-amber-800">No supplier</span>}</td>
                      <td><input name={`qty_${i.id}`} type="number" step="any" min="0" defaultValue={suggestedOrderQuantity(i.quantity, i.reorder_level, i.reorder_quantity)} className="input w-24 py-1" aria-label={`Quantity of ${i.name}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-ink-soft">One draft order is made per supplier. You can edit it before placing it.</p>
            </ActionForm>
          ) : (
            <ul className="text-sm">{needOrder.map((i) => <li key={i.id}>{i.name}: {fmtQty(i.quantity)} {i.unit} left</li>)}</ul>
          )}
        </section>
      ) : null}

      <form className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" name="q" defaultValue={q} placeholder="Search item, code or location" aria-label="Search inventory" />
        <select name="category" defaultValue={category} className="input w-auto" aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="show" defaultValue={show} className="input w-auto" aria-label="Show">
          <option value="">All items</option>
          <option value="low">Low or out only</option>
        </select>
        <button className="btn-primary">Filter</button>
      </form>

      {shown.length === 0 ? (
        <EmptyState>{items.length ? 'Nothing matches.' : manage ? 'No items yet. Add your first item below.' : 'No items yet.'}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="table text-sm">
            <thead><tr><th>Item</th><th>In stock</th><th>Next expiry</th><th>Record</th></tr></thead>
            <tbody>
              {shown.map((i) => {
                const status = stockStatus(i.quantity, i.reorder_level);
                const days = i.next_expiry ? daysUntil(i.next_expiry, today) : null;
                return (
                  <tr key={i.id} className="align-top">
                    <td>
                      <Link href={`/dashboard/operations/inventory/${i.id}`} className="font-semibold text-teal hover:underline">{i.name}</Link>
                      <span className="block text-xs text-ink-soft">{i.category}{i.location ? ` · ${i.location}` : ''}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      <strong>{fmtQty(i.quantity)}</strong> {i.unit}{' '}
                      {status === 'out' ? <Pill tone="red">Out</Pill> : status === 'low' ? <Pill tone="amber">Low</Pill> : null}
                      {i.on_order ? <span className="block text-xs text-teal">+{fmtQty(i.on_order)} on order</span> : null}
                      <span className="block text-xs text-ink-soft">reorder at {fmtQty(i.reorder_level)}</span>
                    </td>
                    <td className={`whitespace-nowrap ${days != null && days < 0 ? 'font-bold text-red-700' : days != null && days <= 60 ? 'font-semibold text-amber-800' : ''}`}>
                      {i.next_expiry ? `${formatDate(i.next_expiry)}${days != null && days < 0 ? ' (expired)' : ''}` : '—'}
                    </td>
                    <td className="min-w-[22rem]"><StockForm itemId={i.id} unit={i.unit} trackExpiry={i.track_expiry} compact /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {expiring.length ? (
        <section id="expiring" className="card mt-6 scroll-mt-6">
          <h2 className="card-title mb-3">Expiring in the next 60 days</h2>
          <ul className="divide-y divide-line text-sm">
            {expiring.map((b) => (
              <li key={b.batch_id} className="flex flex-wrap justify-between gap-2 py-2">
                <Link href={`/dashboard/operations/inventory/${b.item_id}`} className="text-teal hover:underline">{b.name}{b.batch_no ? ` (batch ${b.batch_no})` : ''}</Link>
                <span className={b.expiry_date < today ? 'font-bold text-red-700' : ''}>{fmtQty(b.quantity)} {b.unit} · {b.expiry_date < today ? 'EXPIRED' : 'expires'} {formatDate(b.expiry_date)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {manage ? (
        <details className="card mt-6" open={items.length === 0}>
          <summary className="cursor-pointer card-title">+ Add an item</summary>
          <div className="mt-4"><ActionForm action={saveInventoryItem} submitLabel="Add item" resetOnSuccess><ItemFields suppliers={suppliers} /></ActionForm></div>
        </details>
      ) : null}
    </div>
  );
}
