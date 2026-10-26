'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/app/actions/auth';
import { can } from '@/lib/auth';
import { sql, transaction } from '@/lib/db';
import { dateStr, errorMessage, num, str } from '@/lib/form';
import { parseAmount, todayISO } from '@/lib/format';
import { allocateFefo, type BatchLike } from '@/lib/ops-shared';
import { audit, requirePermission, requireStaff } from '@/lib/session';

type Q = Parameters<Parameters<typeof transaction>[0]>[0];

function revalidateStock(itemId?: number) {
  revalidatePath('/dashboard/operations');
  revalidatePath('/dashboard/operations/inventory');
  if (itemId) revalidatePath(`/dashboard/operations/inventory/${itemId}`);
}

// ---------- Suppliers and items (managers) ----------

export async function saveSupplier(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const id = num(fd, 'id');
  const name = str(fd, 'name');
  if (!name) return { error: 'Add the supplier name.' };
  const v = [str(fd, 'contact_name'), str(fd, 'phone'), str(fd, 'email'), str(fd, 'notes')];
  if (id) {
    await sql`UPDATE suppliers SET name = ${name}, contact_name = ${v[0]}, phone = ${v[1]}, email = ${v[2]}, notes = ${v[3]},
      is_active = ${str(fd, 'is_active') !== 'false'} WHERE id = ${id}`;
  } else {
    await sql`INSERT INTO suppliers (name, contact_name, phone, email, notes) VALUES (${name}, ${v[0]}, ${v[1]}, ${v[2]}, ${v[3]})`;
  }
  await audit(user.id, id ? 'update' : 'create', 'supplier', id);
  revalidatePath('/dashboard/operations/inventory/suppliers');
  return { ok: id ? 'Supplier saved.' : 'Supplier added.' };
}

export async function saveInventoryItem(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const id = num(fd, 'id');
  const name = str(fd, 'name');
  if (!name) return { error: 'Add the item name.' };
  const reorderLevel = num(fd, 'reorder_level') ?? 0;
  const reorderQty = num(fd, 'reorder_quantity') ?? 0;
  if (reorderLevel < 0 || reorderQty < 0) return { error: 'Reorder numbers can’t be negative.' };
  const unitCost = Math.max(0, parseAmount(str(fd, 'unit_cost') ?? '0') || 0);
  const trackExpiry = str(fd, 'track_expiry') === 'on';
  const v = {
    sku: str(fd, 'sku'),
    category: str(fd, 'category') ?? 'Consumables',
    unit: str(fd, 'unit') ?? 'each',
    location: str(fd, 'location'),
    supplier: num(fd, 'supplier_id'),
    notes: str(fd, 'notes'),
  };
  let itemId = id;
  if (id) {
    await sql`UPDATE inventory_items SET name = ${name}, sku = ${v.sku}, category = ${v.category}, unit = ${v.unit}, location = ${v.location},
      reorder_level = ${reorderLevel}, reorder_quantity = ${reorderQty}, supplier_id = ${v.supplier}, unit_cost = ${unitCost},
      track_expiry = ${trackExpiry}, notes = ${v.notes}, is_active = ${str(fd, 'is_active') !== 'false'} WHERE id = ${id}`;
    await audit(user.id, 'update', 'inventory_item', id);
  } else {
    const [row] = await sql<{ id: number }>`INSERT INTO inventory_items (name, sku, category, unit, location, reorder_level, reorder_quantity, supplier_id, unit_cost, track_expiry, notes)
      VALUES (${name}, ${v.sku}, ${v.category}, ${v.unit}, ${v.location}, ${reorderLevel}, ${reorderQty}, ${v.supplier}, ${unitCost}, ${trackExpiry}, ${v.notes})
      RETURNING id`;
    itemId = row.id;
    const opening = num(fd, 'opening_quantity');
    if (opening && opening > 0) {
      await transaction((q) => receiveInto(q, row.id, opening, str(fd, 'opening_batch'), dateStr(fd, 'opening_expiry'), user.id, 'Opening stock', null));
    }
    await audit(user.id, 'create', 'inventory_item', row.id);
  }
  revalidateStock(itemId ?? undefined);
  return { ok: id ? 'Item saved.' : 'Item added.' };
}

// ---------- Stock movements (everyone) ----------

async function receiveInto(
  q: Q,
  itemId: number,
  quantity: number,
  batchNo: string | null,
  expiry: string | null,
  userId: number,
  reason: string | null,
  poId: number | null,
  kind: 'receive' | 'adjust' = 'receive'
) {
  // Same batch and expiry goes into the existing batch row.
  const [existing] = await q<{ id: number }>`SELECT id FROM inventory_batches WHERE item_id = ${itemId}
    AND batch_no IS NOT DISTINCT FROM ${batchNo} AND expiry_date IS NOT DISTINCT FROM ${expiry}::date FOR UPDATE`;
  let batchId: number;
  if (existing) {
    await q`UPDATE inventory_batches SET quantity = quantity + ${quantity} WHERE id = ${existing.id}`;
    batchId = existing.id;
  } else {
    const [b] = await q<{ id: number }>`INSERT INTO inventory_batches (item_id, batch_no, expiry_date, quantity) VALUES (${itemId}, ${batchNo}, ${expiry}::date, ${quantity}) RETURNING id`;
    batchId = b.id;
  }
  await q`INSERT INTO inventory_movements (item_id, batch_id, kind, quantity, reason, purchase_order_id, user_id)
    VALUES (${itemId}, ${batchId}, ${kind}, ${quantity}, ${reason}, ${poId}, ${userId})`;
}

async function takeOut(q: Q, itemId: number, quantity: number, kind: 'use' | 'dispose' | 'adjust', userId: number, reason: string | null, batchId: number | null) {
  const batches = await q<BatchLike>`SELECT id, quantity::float AS quantity, expiry_date::text AS expiry_date, received_at::text AS received_at
    FROM inventory_batches WHERE item_id = ${itemId} AND quantity > 0 FOR UPDATE`;
  const pool = batchId ? batches.filter((b) => b.id === batchId) : batches;
  const plan = allocateFefo(pool, quantity);
  for (const p of plan) {
    await q`UPDATE inventory_batches SET quantity = quantity - ${p.take} WHERE id = ${p.batchId}`;
    await q`INSERT INTO inventory_movements (item_id, batch_id, kind, quantity, reason, user_id) VALUES (${itemId}, ${p.batchId}, ${kind}, ${-p.take}, ${reason}, ${userId})`;
  }
}

const KINDS = ['use', 'receive', 'dispose', 'count'] as const;

/**
 * Records a stock change: use (oldest expiry first), receive (with batch and expiry), dispose
 * (e.g. an expired batch) or count (sets the total to what's on the shelf).
 */
export async function recordStock(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff();
  const itemId = num(fd, 'item_id');
  const kind = str(fd, 'kind') as (typeof KINDS)[number];
  const quantity = num(fd, 'quantity');
  if (!itemId) return { error: 'Missing item.' };
  if (!KINDS.includes(kind)) return { error: 'Choose what happened.' };
  if (quantity == null || quantity < 0 || (kind !== 'count' && quantity === 0)) return { error: 'Enter a quantity.' };
  const [item] = await sql<{ name: string; unit: string; track_expiry: boolean }>`SELECT name, unit, track_expiry FROM inventory_items WHERE id = ${itemId}`;
  if (!item) return { error: 'Item not found.' };
  const reason = str(fd, 'reason');
  const expiry = dateStr(fd, 'expiry_date');
  if (kind === 'receive' && item.track_expiry && !expiry) return { error: 'Enter the expiry date for this delivery.' };
  let message = '';
  try {
    await transaction(async (q) => {
      if (kind === 'receive') {
        await receiveInto(q, itemId, quantity, str(fd, 'batch_no'), expiry, user.id, reason, null);
        message = `Received ${quantity} ${item.unit}.`;
      } else if (kind === 'count') {
        const [{ total }] = await q<{ total: number }>`SELECT COALESCE(SUM(quantity), 0)::float AS total FROM inventory_batches WHERE item_id = ${itemId}`;
        const diff = Math.round((quantity - total) * 1e6) / 1e6;
        if (diff < 0) await takeOut(q, itemId, -diff, 'adjust', user.id, reason ?? 'Stock count', null);
        if (diff > 0) await receiveInto(q, itemId, diff, null, null, user.id, reason ?? 'Stock count (found extra)', null, 'adjust');
        message = diff === 0 ? 'Count matches. Nothing changed.' : `Count saved: ${diff > 0 ? '+' : ''}${diff} ${item.unit}.`;
      } else {
        await takeOut(q, itemId, quantity, kind, user.id, reason, num(fd, 'batch_id'));
        message = kind === 'use' ? `Recorded ${quantity} ${item.unit} used.` : `Disposed of ${quantity} ${item.unit}.`;
      }
    });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await audit(user.id, `stock_${kind}`, 'inventory_item', itemId, String(quantity));
  revalidateStock(itemId);
  return { ok: message };
}

// ---------- Purchase orders (managers) ----------

/** Makes one draft order per supplier from the ticked items on the reorder list. */
export async function createPurchaseOrders(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const ids = fd.getAll('item').map(Number).filter(Boolean);
  if (!ids.length) return { error: 'Tick the items to order.' };
  const items = await sql<{ id: number; supplier_id: number | null; unit_cost: number }>`SELECT id, supplier_id, unit_cost FROM inventory_items WHERE id = ANY(${ids})`;
  const bySupplier = new Map<number | null, typeof items>();
  for (const it of items) bySupplier.set(it.supplier_id, [...(bySupplier.get(it.supplier_id) ?? []), it]);
  const created: number[] = [];
  await transaction(async (q) => {
    for (const [supplierId, list] of bySupplier) {
      const [po] = await q<{ id: number }>`INSERT INTO purchase_orders (supplier_id, created_by) VALUES (${supplierId}, ${user.id}) RETURNING id`;
      for (const it of list) {
        const qty = num(fd, `qty_${it.id}`) ?? 1;
        if (qty > 0) await q`INSERT INTO purchase_order_lines (order_id, item_id, quantity, unit_cost) VALUES (${po.id}, ${it.id}, ${qty}, ${it.unit_cost})`;
      }
      created.push(po.id);
    }
  });
  await audit(user.id, 'create', 'purchase_order', created[0] ?? null, `${created.length} orders`);
  revalidatePath('/dashboard/operations/inventory/orders');
  if (created.length === 1) redirect(`/dashboard/operations/inventory/orders/${created[0]}`);
  return { ok: `${created.length} draft orders created, one per supplier.` };
}

async function loadPo(fd: FormData) {
  const id = num(fd, 'order_id');
  if (!id) return null;
  return (await sql<{ id: number; status: string; supplier_id: number | null }>`SELECT id, status, supplier_id FROM purchase_orders WHERE id = ${id}`)[0] ?? null;
}

function revalidatePo(id: number) {
  revalidatePath(`/dashboard/operations/inventory/orders/${id}`);
  revalidatePath('/dashboard/operations/inventory/orders');
  revalidatePath('/dashboard/operations/inventory');
}

export async function updatePurchaseOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const po = await loadPo(fd);
  if (!po || po.status !== 'draft') return { error: 'Only draft orders can be changed.' };
  const lines = await sql<{ id: number }>`SELECT id FROM purchase_order_lines WHERE order_id = ${po.id}`;
  await transaction(async (q) => {
    await q`UPDATE purchase_orders SET supplier_id = ${num(fd, 'supplier_id')}, expected_date = ${dateStr(fd, 'expected_date')}, notes = ${str(fd, 'notes')} WHERE id = ${po.id}`;
    for (const l of lines) {
      const qty = num(fd, `qty_${l.id}`);
      if (!qty || qty <= 0) await q`DELETE FROM purchase_order_lines WHERE id = ${l.id}`;
      else await q`UPDATE purchase_order_lines SET quantity = ${qty}, unit_cost = ${Math.max(0, parseAmount(str(fd, `cost_${l.id}`) ?? '0') || 0)} WHERE id = ${l.id}`;
    }
    const addItem = num(fd, 'add_item_id');
    const addQty = num(fd, 'add_quantity');
    if (addItem && addQty && addQty > 0) {
      await q`INSERT INTO purchase_order_lines (order_id, item_id, quantity, unit_cost)
        SELECT ${po.id}, id, ${addQty}, unit_cost FROM inventory_items WHERE id = ${addItem}
        ON CONFLICT (order_id, item_id) DO UPDATE SET quantity = purchase_order_lines.quantity + EXCLUDED.quantity`;
    }
  });
  await audit(user.id, 'update', 'purchase_order', po.id);
  revalidatePo(po.id);
  return { ok: 'Order saved.' };
}

export async function markPurchaseOrdered(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const po = await loadPo(fd);
  if (!po || po.status !== 'draft') return { error: 'Only draft orders can be placed.' };
  const [{ n }] = await sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM purchase_order_lines WHERE order_id = ${po.id}`;
  if (!n) return { error: 'Add at least one item.' };
  await sql`UPDATE purchase_orders SET status = 'ordered', ordered_at = now(), expected_date = COALESCE(${dateStr(fd, 'expected_date')}, expected_date) WHERE id = ${po.id}`;
  await audit(user.id, 'ordered', 'purchase_order', po.id);
  revalidatePo(po.id);
  return { ok: 'Marked as ordered. Items now show as “on order”.' };
}

export async function cancelPurchaseOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const po = await loadPo(fd);
  if (!po || !['draft', 'ordered'].includes(po.status)) return { error: 'This order can’t be cancelled.' };
  await sql`UPDATE purchase_orders SET status = 'cancelled' WHERE id = ${po.id}`;
  await audit(user.id, 'cancel', 'purchase_order', po.id);
  revalidatePo(po.id);
  return { ok: 'Order cancelled.' };
}

/** Books a delivery into stock (with batch and expiry) and, for finance users, adds the bill to pay. */
export async function receivePurchaseOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff();
  const po = await loadPo(fd);
  if (!po || !['ordered', 'partially_received'].includes(po.status)) return { error: 'Mark the order as ordered first.' };
  const lines = await sql<{ id: number; item_id: number; quantity: number; received_quantity: number; unit_cost: number; track_expiry: boolean; name: string }>`
    SELECT l.id, l.item_id, l.quantity::float AS quantity, l.received_quantity::float AS received_quantity, l.unit_cost::float AS unit_cost, i.track_expiry, i.name
    FROM purchase_order_lines l JOIN inventory_items i ON i.id = l.item_id WHERE l.order_id = ${po.id}`;
  const receipts = lines
    .map((l) => ({ ...l, now: num(fd, `receive_${l.id}`) ?? 0, batch: str(fd, `batch_${l.id}`), expiry: dateStr(fd, `expiry_${l.id}`) }))
    .filter((l) => l.now > 0);
  if (!receipts.length) return { error: 'Enter how many of each item arrived.' };
  const missingExpiry = receipts.find((r) => r.track_expiry && !r.expiry);
  if (missingExpiry) return { error: `Enter the expiry date for ${missingExpiry.name}.` };
  const addBill = str(fd, 'add_bill') === 'on' && can(user.role, 'finance');
  let total = 0;
  await transaction(async (q) => {
    for (const r of receipts) {
      await receiveInto(q, r.item_id, r.now, r.batch, r.expiry, user.id, `Order PO-${po.id}`, po.id);
      await q`UPDATE purchase_order_lines SET received_quantity = received_quantity + ${r.now} WHERE id = ${r.id}`;
      total += Math.round(r.now * r.unit_cost);
    }
    const [{ open }] = await q<{ open: number }>`SELECT COUNT(*)::int AS open FROM purchase_order_lines WHERE order_id = ${po.id} AND received_quantity < quantity`;
    await q`UPDATE purchase_orders SET status = ${open ? 'partially_received' : 'received'}, received_at = CASE WHEN ${open} = 0 THEN now() ELSE received_at END WHERE id = ${po.id}`;
    if (addBill && total > 0) {
      const [supplier] = await q<{ name: string }>`SELECT name FROM suppliers WHERE id = ${po.supplier_id}`;
      const [cat] = await q<{ id: number }>`SELECT id FROM budget_categories WHERE name = 'Medical supplies'`;
      const [bill] = await q<{ id: number }>`INSERT INTO bills (vendor, bill_reference, category_id, issue_date, amount, status, notes, created_by)
        VALUES (${supplier?.name ?? 'Supplier'}, ${`PO-${po.id}`}, ${cat?.id ?? null}, ${todayISO()}, ${total}, 'unpaid', 'From a stock delivery', ${user.id}) RETURNING id`;
      await q`UPDATE purchase_orders SET bill_id = COALESCE(bill_id, ${bill.id}) WHERE id = ${po.id}`;
    }
  });
  await audit(user.id, 'receive', 'purchase_order', po.id, `${receipts.length} lines`);
  revalidatePo(po.id);
  for (const r of receipts) revalidatePath(`/dashboard/operations/inventory/${r.item_id}`);
  if (addBill) revalidatePath('/dashboard/budget/bills');
  return { ok: `Delivery booked into stock.${addBill && total > 0 ? ' The bill was added to Bills to pay.' : ''}` };
}
