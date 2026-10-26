import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/dashboard/PageHeader';
import { Pill } from '@/components/ui/Badges';
import { formatDate, formatIDR } from '@/lib/format';
import { listPurchaseOrders, PO_STATUS_LABELS } from '@/lib/operations';
import { requireStaff } from '@/lib/session';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireStaff();
  const { show } = await searchParams;
  const orders = await listPurchaseOrders(show !== 'all');
  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Inventory" title="Orders" back={{ href: '/dashboard/operations/inventory', label: 'Inventory' }} />
      <p className="mb-4 text-sm text-ink-soft">Create orders from the “Needs reordering” list on the Inventory page. When a delivery arrives, open the order and book it in.</p>
      <nav className="mb-4 flex gap-2">
        <Link href="/dashboard/operations/inventory/orders" className={show !== 'all' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}>Open</Link>
        <Link href="/dashboard/operations/inventory/orders?show=all" className={show === 'all' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}>All</Link>
      </nav>
      {orders.length ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="table text-sm">
            <thead><tr><th>Order</th><th>Supplier</th><th>Items</th><th>Total</th><th>Expected</th><th>Status</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/dashboard/operations/inventory/orders/${o.id}`} className="font-semibold text-teal hover:underline">PO-{o.id}</Link><span className="block text-xs text-ink-soft">{formatDate(o.created_at)}</span></td>
                  <td>{o.supplier_name ?? 'No supplier'}</td>
                  <td>{o.line_count}</td>
                  <td>{o.total ? formatIDR(o.total) : '—'}</td>
                  <td>{o.expected_date ? formatDate(o.expected_date) : '—'}</td>
                  <td><Pill tone={o.status === 'received' ? 'teal' : o.status === 'cancelled' ? 'stone' : o.status === 'draft' ? 'amber' : 'clay'}>{PO_STATUS_LABELS[o.status]}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState>No orders.</EmptyState>}
    </div>
  );
}
