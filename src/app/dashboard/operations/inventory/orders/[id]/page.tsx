import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cancelPurchaseOrder, markPurchaseOrdered, receivePurchaseOrder, updatePurchaseOrder } from '@/app/actions/inventory';
import { PrintButton } from '@/components/clinical/PrintButton';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { Pill } from '@/components/ui/Badges';
import { can } from '@/lib/auth';
import { getClinicSettings } from '@/lib/billing';
import { formatDate, formatIDR } from '@/lib/format';
import { getPurchaseOrder, getPurchaseOrderLines, getSuppliers, listInventory, PO_STATUS_LABELS } from '@/lib/operations';
import { requireStaff } from '@/lib/session';

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const po = await getPurchaseOrder(Number((await params).id));
  if (!po) notFound();
  const manage = can(user.role, 'manageOperations');
  const [lines, suppliers, items, clinic] = await Promise.all([getPurchaseOrderLines(po.id), getSuppliers(), listInventory(), getClinicSettings()]);
  const receiving = ['ordered', 'partially_received'].includes(po.status);

  return (
    <div className="max-w-5xl">
      <div className="print:hidden">
        <PageHeader
          eyebrow={`Inventory order · ${formatDate(po.created_at)}${po.created_by_name ? ` by ${po.created_by_name}` : ''}`}
          title={`PO-${po.id}${po.supplier_name ? `: ${po.supplier_name}` : ''}`}
          back={{ href: '/dashboard/operations/inventory/orders', label: 'Orders' }}
          actions={<><Pill tone={po.status === 'received' ? 'teal' : po.status === 'draft' ? 'amber' : 'clay'}>{PO_STATUS_LABELS[po.status]}</Pill><PrintButton /></>}
        />
      </div>

      {/* Printable order to send to the supplier */}
      <section className="card mb-6">
        <div className="mb-4 flex flex-wrap justify-between gap-4 text-sm">
          <div>
            <p className="label">To</p>
            <p className="font-semibold">{po.supplier_name ?? 'Supplier not set'}</p>
            {po.supplier_phone ? <p>{po.supplier_phone}</p> : null}
            {po.supplier_email ? <p>{po.supplier_email}</p> : null}
          </div>
          <div className="text-right">
            <p className="label">From</p>
            <p className="font-semibold">{clinic.legal_name}</p>
            <p>{clinic.address}</p>
            {clinic.phone ? <p>{clinic.phone}</p> : null}
          </div>
        </div>
        <table className="table text-sm">
          <thead><tr><th>Item</th><th>Ordered</th><th>Received</th><th>Unit cost</th><th>Total</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/dashboard/operations/inventory/${l.item_id}`} className="hover:underline">{l.name}</Link></td>
                <td>{l.quantity} {l.unit}</td>
                <td className={l.received_quantity >= l.quantity ? 'text-teal' : ''}>{l.received_quantity || '—'}</td>
                <td>{l.unit_cost ? formatIDR(l.unit_cost) : '—'}</td>
                <td>{l.unit_cost ? formatIDR(l.quantity * l.unit_cost) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-right font-semibold">Total {formatIDR(po.total)}</p>
        {po.expected_date ? <p className="text-sm">Expected {formatDate(po.expected_date)}</p> : null}
        {po.notes ? <p className="mt-2 text-sm">{po.notes}</p> : null}
        {po.bill_id ? <p className="mt-2 text-sm text-ink-soft print:hidden">Bill added to Bills to pay.</p> : null}
      </section>

      <div className="print:hidden">
        {po.status === 'draft' && manage ? (
          <section className="card mb-6">
            <h2 className="card-title mb-3">Edit order</h2>
            <ActionForm action={updatePurchaseOrder} submitLabel="Save order" submitClassName="btn-ghost">
              <input type="hidden" name="order_id" value={po.id} />
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="supplier_id">Supplier</label>
                  <select className="input" id="supplier_id" name="supplier_id" defaultValue={po.supplier_id ?? ''}>
                    <option value="">None</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div><label className="label" htmlFor="expected_date">Expected delivery</label><input className="input" id="expected_date" name="expected_date" type="date" defaultValue={po.expected_date ?? ''} /></div>
                <div><label className="label" htmlFor="notes">Note to supplier</label><input className="input" id="notes" name="notes" defaultValue={po.notes ?? ''} /></div>
              </div>
              <table className="table text-sm">
                <thead><tr><th>Item</th><th>Quantity (0 removes)</th><th>Unit cost (Rp)</th></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.name}</td>
                      <td><input name={`qty_${l.id}`} type="number" step="any" min="0" defaultValue={l.quantity} className="input w-24 py-1" aria-label={`Quantity of ${l.name}`} /></td>
                      <td><input name={`cost_${l.id}`} inputMode="numeric" defaultValue={l.unit_cost || ''} className="input w-32 py-1" aria-label={`Unit cost of ${l.name}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="label" htmlFor="add_item_id">Add an item</label>
                  <select className="input" id="add_item_id" name="add_item_id" defaultValue="">
                    <option value="">—</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div><label className="label" htmlFor="add_quantity">Quantity</label><input className="input w-24" id="add_quantity" name="add_quantity" type="number" step="any" min="0" /></div>
              </div>
            </ActionForm>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <ActionForm action={markPurchaseOrdered} submitLabel="Mark as ordered" submitClassName="btn-clay" inline>
                <input type="hidden" name="order_id" value={po.id} />
                <span className="text-sm text-ink-soft">Print or send this order to the supplier, then mark it as ordered.</span>
              </ActionForm>
            </div>
          </section>
        ) : null}

        {receiving ? (
          <section className="card mb-6 border-teal/40">
            <h2 className="card-title mb-3">Book in a delivery</h2>
            <ActionForm action={receivePurchaseOrder} submitLabel="Add to stock" submitClassName="btn-clay">
              <input type="hidden" name="order_id" value={po.id} />
              <table className="table text-sm">
                <thead><tr><th>Item</th><th>Still to come</th><th>Arrived now</th><th>Batch no.</th><th>Expiry</th></tr></thead>
                <tbody>
                  {lines.filter((l) => l.received_quantity < l.quantity).map((l) => (
                    <tr key={l.id}>
                      <td>{l.name}</td>
                      <td>{l.quantity - l.received_quantity} {l.unit}</td>
                      <td><input name={`receive_${l.id}`} type="number" step="any" min="0" defaultValue={l.quantity - l.received_quantity} className="input w-24 py-1" aria-label={`${l.name} arrived`} /></td>
                      <td><input name={`batch_${l.id}`} className="input w-28 py-1" aria-label={`${l.name} batch`} /></td>
                      <td><input name={`expiry_${l.id}`} type="date" required={l.track_expiry} className="input w-auto py-1" aria-label={`${l.name} expiry`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {can(user.role, 'finance') && !po.bill_id ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="add_bill" defaultChecked className="h-4 w-4 accent-teal" /> Add the cost to Bills to pay (Medical supplies)
                </label>
              ) : null}
            </ActionForm>
          </section>
        ) : null}

        {['draft', 'ordered'].includes(po.status) && manage ? (
          <ActionForm action={cancelPurchaseOrder} submitLabel="Cancel this order" submitClassName="text-xs text-ink-soft underline" inline confirm="Cancel this order?">
            <input type="hidden" name="order_id" value={po.id} />
          </ActionForm>
        ) : null}
      </div>
    </div>
  );
}
