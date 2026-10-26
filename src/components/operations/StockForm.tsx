'use client';

import { useActionState, useState } from 'react';
import { recordStock } from '@/app/actions/inventory';

const KIND_LABELS = { use: 'Used', receive: 'Received', count: 'Counted (set total)', dispose: 'Thrown away / expired' } as const;

/** Quick stock change. Receiving asks for batch and expiry; counting sets the total on the shelf. */
export function StockForm({ itemId, unit, trackExpiry, compact = false, batches = [] }: {
  itemId: number;
  unit: string;
  trackExpiry: boolean;
  compact?: boolean;
  batches?: { id: number; label: string }[];
}) {
  const [state, action, pending] = useActionState(recordStock, {});
  const [kind, setKind] = useState<keyof typeof KIND_LABELS>('use');
  const [seen, setSeen] = useState(state);
  const [round, setRound] = useState(0);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setRound((r) => r + 1);
  }
  return (
    <form action={action} className={compact ? 'flex flex-wrap items-center gap-1.5' : 'space-y-2'} key={round}>
      <input type="hidden" name="item_id" value={itemId} />
      <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as keyof typeof KIND_LABELS)} className="input w-auto py-1.5 text-sm" aria-label="What happened">
        {(Object.keys(KIND_LABELS) as (keyof typeof KIND_LABELS)[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
      </select>
      <input name="quantity" type="number" step="any" min="0" required className="input w-20 py-1.5 text-sm" placeholder={unit} aria-label={`Quantity (${unit})`} />
      {kind === 'receive' ? (
        <>
          <input name="batch_no" className="input w-28 py-1.5 text-sm" placeholder="Batch no." aria-label="Batch number" />
          <input name="expiry_date" type="date" required={trackExpiry} className="input w-auto py-1.5 text-sm" aria-label="Expiry date" />
        </>
      ) : null}
      {kind === 'dispose' && batches.length ? (
        <select name="batch_id" className="input w-auto py-1.5 text-sm" aria-label="Which batch">
          <option value="">Oldest expiry first</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      ) : null}
      {!compact || kind !== 'use' ? <input name="reason" className="input w-40 py-1.5 text-sm" placeholder={kind === 'dispose' ? 'Reason (e.g. expired)' : 'Note (optional)'} aria-label="Note" /> : null}
      <button type="submit" className="btn-primary btn-sm" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
      {state.error ? <p role="alert" className="text-xs text-red-700">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-xs text-teal">{state.ok}</p> : null}
    </form>
  );
}
