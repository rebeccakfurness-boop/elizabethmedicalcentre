import Link from 'next/link';
import { EmptyState, PageHeader, StatTile } from '@/components/dashboard/PageHeader';
import { formatDate, todayISO } from '@/lib/format';
import { dueState, labelColour, stockStatus } from '@/lib/ops-shared';
import { getChecklist, getExpiringBatches, getMyCards, getUpcomingCards, listBoards, listInventory, listPurchaseOrders, type CardSummary } from '@/lib/operations';
import { requireStaff } from '@/lib/session';

function CardRow({ c, today }: { c: CardSummary; today: string }) {
  const state = dueState(c.due_date, today, c.list_is_done);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span className="min-w-0">
        <Link href={`/dashboard/operations/projects/cards/${c.id}`} className="font-semibold text-teal hover:underline">{c.title}</Link>
        <span className="block text-xs text-ink-soft">
          {c.board_title} · {c.list_title}{c.assignees.length ? ` · ${c.assignees.map((a) => a.name).join(', ')}` : ''}
          {c.labels.slice(0, 1).map((l) => <span key={l} className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${labelColour(l)}`}>{l}</span>)}
        </span>
      </span>
      {c.due_date ? (
        <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${state === 'overdue' ? 'bg-red-600 text-white' : state === 'today' ? 'bg-orange-500 text-white' : 'bg-paper'}`}>
          {state === 'overdue' ? 'Overdue · ' : ''}{formatDate(c.due_date)}
        </span>
      ) : null}
    </li>
  );
}

export default async function OperationsPage() {
  const user = await requireStaff();
  const today = todayISO();
  const [checklist, items, expiring, orders, mine, upcoming, boards] = await Promise.all([
    getChecklist(today),
    listInventory(),
    getExpiringBatches(30),
    listPurchaseOrders(true),
    getMyCards(user.id),
    getUpcomingCards(14),
    listBoards(),
  ]);
  const daily = checklist.filter((t) => t.frequency === 'daily');
  const dailyDone = daily.filter((t) => t.completion_id).length;
  const flagged = checklist.filter((t) => t.out_of_range).length;
  const lowItems = items.filter((i) => stockStatus(i.quantity, i.reorder_level) !== 'ok');
  const overdueCount = upcoming.filter((c) => c.due_date && c.due_date < today).length;

  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow="Operations" title="Running the clinic" />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Today’s checklist"
          value={`${dailyDone} / ${daily.length}`}
          note={flagged ? `${flagged} reading${flagged === 1 ? '' : 's'} out of range` : undefined}
          tone={flagged ? 'alert' : daily.length && dailyDone === daily.length ? 'good' : 'default'}
          href="/dashboard/operations/checklists"
        />
        <StatTile label="Stock low or out" value={lowItems.length} note={expiring.length ? `${expiring.length} batches expire within 30 days` : undefined} tone={lowItems.length || expiring.length ? 'alert' : 'good'} href="/dashboard/operations/inventory" />
        <StatTile label="Open stock orders" value={orders.length} href="/dashboard/operations/inventory/orders" />
        <StatTile label="Project tasks overdue" value={overdueCount} tone={overdueCount ? 'alert' : 'good'} href="/dashboard/operations/projects" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="card-title">My tasks</h2>
            <span className="text-xs text-ink-soft">Cards and checklist steps assigned to you</span>
          </div>
          {mine.length ? <ul className="divide-y divide-line">{mine.slice(0, 12).map((c) => <CardRow key={c.id} c={c} today={today} />)}</ul> : <p className="text-sm text-ink-soft">Nothing assigned to you.</p>}
        </section>
        <section className="card">
          <h2 className="card-title mb-2">Deadlines in the next two weeks</h2>
          {upcoming.length ? <ul className="divide-y divide-line">{upcoming.map((c) => <CardRow key={c.id} c={c} today={today} />)}</ul> : <p className="text-sm text-ink-soft">No deadlines coming up.</p>}
        </section>
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="card-title">Still to do today</h2>
            <Link href="/dashboard/operations/checklists" className="text-sm text-teal underline">Open checklist</Link>
          </div>
          {daily.length ? (
            <ul className="space-y-1 text-sm">
              {daily.filter((t) => !t.completion_id).slice(0, 10).map((t) => <li key={t.id}>☐ {t.title}{t.due_time ? <span className="text-xs text-ink-soft"> · by {t.due_time}</span> : null}</li>)}
              {dailyDone === daily.length ? <li className="text-teal">All done for today ✓</li> : null}
            </ul>
          ) : <EmptyState>No checklist set up yet.</EmptyState>}
        </section>
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="card-title">Stock to reorder</h2>
            <Link href="/dashboard/operations/inventory" className="text-sm text-teal underline">Inventory</Link>
          </div>
          {lowItems.length ? (
            <ul className="space-y-1 text-sm">
              {lowItems.slice(0, 10).map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <Link href={`/dashboard/operations/inventory/${i.id}`} className="hover:underline">{i.name}</Link>
                  <span className={i.quantity <= 0 ? 'font-bold text-red-700' : 'text-amber-800'}>{i.quantity} {i.unit}{i.on_order ? ` (+${i.on_order} ordered)` : ''}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-soft">Everything is above its reorder level.</p>}
        </section>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="card-title">Project boards</h2>
          <Link href="/dashboard/operations/projects" className="text-sm text-teal underline">All boards</Link>
        </div>
        {boards.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boards.slice(0, 6).map((b) => {
              const pct = b.card_count ? Math.round((b.done_count / b.card_count) * 100) : 0;
              return (
                <li key={b.id}>
                  <Link href={`/dashboard/operations/projects/${b.id}`} className="card block transition hover:border-teal">
                    <p className="font-semibold text-pulse">{b.title}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true"><div className="h-full bg-teal" style={{ width: `${pct}%` }} /></div>
                    <p className="mt-1 text-xs text-ink-soft">{pct}% done{b.overdue_count ? ` · ${b.overdue_count} overdue` : ''}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState>No project boards yet.</EmptyState>}
      </section>
    </div>
  );
}
