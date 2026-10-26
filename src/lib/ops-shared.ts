// Pure helpers for the operations area (no database), shared by pages, actions and tests.

export type Frequency = 'daily' | 'weekly' | 'monthly';

export const FREQUENCY_LABELS: Record<Frequency, string> = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

/** The date a tick is filed under: the day itself, the Monday of its week, or the 1st of its month. */
export function periodStart(iso: string, frequency: Frequency): string {
  const d = parse(iso);
  if (frequency === 'weekly') {
    const back = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - back);
  } else if (frequency === 'monthly') {
    d.setUTCDate(1);
  }
  return fmt(d);
}

export function weekdayOf(iso: string): number {
  return parse(iso).getUTCDay();
}

export function readingOutOfRange(reading: number | null, min: number | null, max: number | null): boolean {
  if (reading == null) return false;
  return (min != null && reading < min) || (max != null && reading > max);
}

// ---------- Inventory ----------

export type StockStatus = 'out' | 'low' | 'ok';

export function stockStatus(quantity: number, reorderLevel: number): StockStatus {
  if (quantity <= 0) return 'out';
  if (quantity <= reorderLevel) return 'low';
  return 'ok';
}

/** How many to order: the item's usual order quantity, or enough to get back to twice the reorder level. */
export function suggestedOrderQuantity(quantity: number, reorderLevel: number, reorderQuantity: number): number {
  if (reorderQuantity > 0) return reorderQuantity;
  return Math.max(1, Math.ceil(reorderLevel * 2 - quantity));
}

export interface BatchLike {
  id: number;
  quantity: number;
  expiry_date: string | null;
  received_at: string;
}

/**
 * Takes stock first-expiry-first-out: soonest expiry first, undated batches last, then oldest
 * received. Throws if there isn't enough.
 */
export function allocateFefo(batches: BatchLike[], quantity: number): { batchId: number; take: number }[] {
  const sorted = [...batches]
    .filter((b) => b.quantity > 0)
    .sort((a, b) => {
      if (a.expiry_date !== b.expiry_date) {
        if (!a.expiry_date) return 1;
        if (!b.expiry_date) return -1;
        return a.expiry_date < b.expiry_date ? -1 : 1;
      }
      return a.received_at < b.received_at ? -1 : 1;
    });
  const total = sorted.reduce((s, b) => s + b.quantity, 0);
  if (quantity > total + 1e-9) throw new Error(`Only ${total} in stock.`);
  const out: { batchId: number; take: number }[] = [];
  let left = quantity;
  for (const b of sorted) {
    if (left <= 0) break;
    const take = Math.min(b.quantity, left);
    out.push({ batchId: b.id, take });
    left = Math.round((left - take) * 1e6) / 1e6;
  }
  return out;
}

export function daysUntil(iso: string, todayIso: string): number {
  return Math.round((parse(iso).getTime() - parse(todayIso).getTime()) / 86400000);
}

// ---------- Projects ----------

export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export const PRIORITY_LABELS: Record<Priority, string> = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };

export const DEFAULT_LABELS = ['Licensing', 'Building & fit-out', 'Equipment', 'Clinical', 'Staffing', 'IT & systems', 'Finance & legal', 'Marketing', 'Partnerships'];

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'done' | 'none';

export function dueState(due: string | null, todayIso: string, done: boolean): DueState {
  if (done) return 'done';
  if (!due) return 'none';
  const d = daysUntil(due, todayIso);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 7) return 'soon';
  return 'later';
}

const LABEL_COLOURS = ['bg-teal-soft text-teal-deep', 'bg-amber-100 text-amber-900', 'bg-sky-100 text-sky-900', 'bg-rose-100 text-rose-900', 'bg-violet-100 text-violet-900', 'bg-lime-100 text-lime-900', 'bg-orange-100 text-orange-900', 'bg-stone-200 text-stone-800', 'bg-emerald-100 text-emerald-900'];

export function labelColour(label: string): string {
  let h = 0;
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return LABEL_COLOURS[h % LABEL_COLOURS.length];
}
