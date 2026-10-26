import { INVENTORY_CATEGORIES, type InventoryItem, type Supplier } from '@/lib/operations';

/** Fields shared by the add and edit item forms. */
export function ItemFields({ item, suppliers }: { item?: InventoryItem; suppliers: Supplier[] }) {
  const p = item ? `i${item.id}-` : 'new-';
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div className="sm:col-span-2"><label className="label" htmlFor={`${p}name`}>Item *</label><input className="input" id={`${p}name`} name="name" defaultValue={item?.name} required placeholder="e.g. Sterile gauze swabs 10×10 cm" /></div>
      <div>
        <label className="label" htmlFor={`${p}cat`}>Category</label>
        <input className="input" id={`${p}cat`} name="category" list="inventory-categories" defaultValue={item?.category ?? 'Consumables'} />
        <datalist id="inventory-categories">{INVENTORY_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div><label className="label" htmlFor={`${p}unit`}>Counted in</label><input className="input" id={`${p}unit`} name="unit" defaultValue={item?.unit ?? 'each'} placeholder="each, box, bottle" /></div>
      <div><label className="label" htmlFor={`${p}loc`}>Where it’s kept</label><input className="input" id={`${p}loc`} name="location" defaultValue={item?.location ?? ''} placeholder="Store room, shelf B" /></div>
      <div><label className="label" htmlFor={`${p}rl`}>Reorder when at or below</label><input className="input" id={`${p}rl`} name="reorder_level" type="number" step="any" min="0" defaultValue={item?.reorder_level ?? 0} /></div>
      <div><label className="label" htmlFor={`${p}rq`}>Usual order quantity</label><input className="input" id={`${p}rq`} name="reorder_quantity" type="number" step="any" min="0" defaultValue={item?.reorder_quantity ?? 0} /></div>
      <div><label className="label" htmlFor={`${p}cost`}>Cost per unit (Rp)</label><input className="input" id={`${p}cost`} name="unit_cost" inputMode="numeric" defaultValue={item?.unit_cost || ''} /></div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}sup`}>Supplier</label>
        <select className="input" id={`${p}sup`} name="supplier_id" defaultValue={item?.supplier_id ?? ''}>
          <option value="">None</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div><label className="label" htmlFor={`${p}sku`}>Code / SKU</label><input className="input" id={`${p}sku`} name="sku" defaultValue={item?.sku ?? ''} /></div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="track_expiry" defaultChecked={item?.track_expiry ?? false} className="h-4 w-4 accent-teal" /> Track expiry dates</label>
      <div className="sm:col-span-4"><label className="label" htmlFor={`${p}notes`}>Notes</label><input className="input" id={`${p}notes`} name="notes" defaultValue={item?.notes ?? ''} /></div>
      {item ? (
        <div>
          <label className="label" htmlFor={`${p}act`}>Status</label>
          <select className="input" id={`${p}act`} name="is_active" defaultValue={String(item.is_active)}><option value="true">In use</option><option value="false">Discontinued</option></select>
        </div>
      ) : (
        <>
          <div><label className="label" htmlFor="new-oq">Opening stock</label><input className="input" id="new-oq" name="opening_quantity" type="number" step="any" min="0" /></div>
          <div><label className="label" htmlFor="new-ob">Batch no.</label><input className="input" id="new-ob" name="opening_batch" /></div>
          <div><label className="label" htmlFor="new-oe">Expiry</label><input className="input" id="new-oe" name="opening_expiry" type="date" /></div>
        </>
      )}
    </div>
  );
}
