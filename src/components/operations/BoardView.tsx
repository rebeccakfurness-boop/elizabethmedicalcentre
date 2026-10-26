'use client';

import Link from 'next/link';
import { Fragment, startTransition, useActionState, useMemo, useState } from 'react';
import { createCard, moveCard } from '@/app/actions/projects';
import { dueState, labelColour, PRIORITY_LABELS, type DueState } from '@/lib/ops-shared';
import type { BoardList, CardSummary, StaffMember } from '@/lib/operations';

const DUE_STYLES: Record<DueState, string> = {
  overdue: 'bg-red-600 text-white',
  today: 'bg-orange-500 text-white',
  soon: 'bg-amber-100 text-amber-900',
  later: 'bg-paper text-ink-soft',
  done: 'bg-teal-soft text-teal-deep',
  none: '',
};

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

function CardTile({ card, today, onDragStart, dragging }: { card: CardSummary; today: string; onDragStart: (id: number) => void; dragging: boolean }) {
  const state = dueState(card.due_date, today, card.list_is_done);
  return (
    <li
      draggable
      data-card-id={card.id}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(card.id));
        onDragStart(card.id);
      }}
      className={`group cursor-grab rounded-xl border bg-white p-3 shadow-sm transition active:cursor-grabbing ${dragging ? 'opacity-40' : ''} ${
        card.priority === 'urgent' ? 'border-l-4 border-l-red-600' : card.priority === 'high' ? 'border-l-4 border-l-orange-400' : 'border-line'
      }`}
    >
      {card.labels.length ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {card.labels.map((l) => <span key={l} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${labelColour(l)}`}>{l}</span>)}
        </div>
      ) : null}
      <Link href={`/dashboard/operations/projects/cards/${card.id}`} className={`block text-sm font-semibold leading-snug hover:text-teal ${card.list_is_done ? 'text-ink-soft line-through' : 'text-ink'}`} draggable={false}>
        {card.title}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        {card.due_date ? <span className={`rounded-md px-1.5 py-0.5 font-semibold ${DUE_STYLES[state]}`}>{state === 'overdue' ? '⚠ ' : '📅 '}{shortDate(card.due_date)}</span> : null}
        {card.checklist_total ? (
          <span className={`rounded-md px-1.5 py-0.5 ${card.checklist_done === card.checklist_total ? 'bg-teal-soft text-teal-deep' : 'bg-paper text-ink-soft'}`}>☑ {card.checklist_done}/{card.checklist_total}</span>
        ) : null}
        {card.comment_count ? <span className="text-ink-soft">💬 {card.comment_count}</span> : null}
        <span className="ml-auto flex -space-x-1.5">
          {card.assignees.map((a) => (
            <span key={a.id} title={a.name} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-teal text-[9px] font-bold text-cream">{initials(a.name)}</span>
          ))}
        </span>
      </div>
    </li>
  );
}

function AddCard({ listId }: { listId: number }) {
  const [state, action, pending] = useActionState(createCard, {});
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(state);
  const [round, setRound] = useState(0);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setRound((r) => r + 1);
  }
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="w-full rounded-xl px-2 py-1.5 text-left text-sm text-ink-soft hover:bg-white/70">+ Add a card</button>;
  }
  return (
    <form action={action} key={round} className="space-y-1.5">
      <input type="hidden" name="list_id" value={listId} />
      <textarea name="title" rows={2} required autoFocus placeholder="What needs doing?" className="input text-sm" aria-label="Card title" />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input type="date" name="due_date" className="input w-auto py-1 text-xs" aria-label="Deadline" />
        <label className="flex items-center gap-1"><input type="checkbox" name="assign_me" className="accent-teal" /> Assign me</label>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-primary btn-sm" disabled={pending}>{pending ? 'Adding…' : 'Add card'}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-soft underline">Close</button>
      </div>
      {state.error ? <p role="alert" className="text-xs text-red-700">{state.error}</p> : null}
    </form>
  );
}

export function BoardView({ lists, cards: initialCards, staff, today, viewerId }: { lists: BoardList[]; cards: CardSummary[]; staff: StaffMember[]; today: string; viewerId: number }) {
  // Local copy for instant drag-and-drop; replaced whenever the server sends a fresh board.
  const [cards, setCards] = useState(initialCards);
  const [seenInitial, setSeenInitial] = useState(initialCards);
  if (initialCards !== seenInitial) {
    setSeenInitial(initialCards);
    setCards(initialCards);
  }
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<{ listId: number; index: number } | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [who, setWho] = useState('all');
  const [label, setLabel] = useState('');
  const [search, setSearch] = useState('');

  const labels = useMemo(() => Array.from(new Set(cards.flatMap((c) => c.labels))).sort(), [cards]);
  const visible = cards.filter(
    (c) =>
      (who === 'all' || (who === 'me' ? c.assignees.some((a) => a.id === viewerId) : who === 'none' ? !c.assignees.length : c.assignees.some((a) => String(a.id) === who))) &&
      (!label || c.labels.includes(label)) &&
      (!search || c.title.toLowerCase().includes(search.toLowerCase()))
  );
  const filtered = visible.length !== cards.length;

  function dropIndex(e: React.DragEvent<HTMLElement>, listId: number): number {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-card-id]')).filter((el) => Number(el.dataset.cardId) !== dragId);
    const y = e.clientY;
    const i = items.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return i === -1 ? cards.filter((c) => c.list_id === listId && c.id !== dragId).length : i;
  }

  function drop(listId: number, index: number) {
    const id = dragId;
    setDragId(null);
    setOver(null);
    if (id == null) return;
    const card = cards.find((c) => c.id === id);
    const list = lists.find((l) => l.id === listId);
    if (!card || !list) return;
    // Rebuild the target list in its new order, using the full (unfiltered) list.
    const others = cards.filter((c) => c.list_id === listId && c.id !== id);
    const visibleOthers = others.filter((c) => visible.some((v) => v.id === c.id));
    const anchor = visibleOthers[index];
    const at = anchor ? others.indexOf(anchor) : others.length;
    const moved = { ...card, list_id: listId, list_title: list.title, list_is_done: list.is_done };
    const target = [...others.slice(0, at), moved, ...others.slice(at)];
    const before = cards;
    setCards([...cards.filter((c) => c.list_id !== listId && c.id !== id), ...target.map((c, i) => ({ ...c, position: i + 1 }))]);
    setError('');
    startTransition(async () => {
      const res = await moveCard(id, listId, target.map((c) => c.id));
      if (res.error) {
        setCards(before);
        setError(res.error);
      }
    });
  }

  const byDue = [...visible].sort((a, b) => (a.list_is_done === b.list_is_done ? (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1 : a.list_is_done ? 1 : -1));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-line bg-white p-0.5 text-sm">
          {(['board', 'list'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`rounded-lg px-3 py-1 ${view === v ? 'bg-teal text-cream' : 'text-ink-soft'}`}>{v === 'board' ? 'Board' : 'By deadline'}</button>
          ))}
        </div>
        <select value={who} onChange={(e) => setWho(e.target.value)} className="input w-auto py-1.5 text-sm" aria-label="Filter by person">
          <option value="all">Everyone</option>
          <option value="me">My cards</option>
          <option value="none">Unassigned</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={label} onChange={(e) => setLabel(e.target.value)} className="input w-auto py-1.5 text-sm" aria-label="Filter by label">
          <option value="">All labels</option>
          {labels.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cards" className="input w-48 py-1.5 text-sm" aria-label="Search cards" />
        {filtered ? <span className="text-xs text-ink-soft">Showing {visible.length} of {cards.length}</span> : null}
        {error ? <span role="alert" className="text-sm text-red-700">{error}</span> : null}
      </div>

      {view === 'board' ? (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
          {lists.map((list) => {
            const listCards = visible.filter((c) => c.list_id === list.id);
            const isOver = over?.listId === list.id;
            return (
              <section
                key={list.id}
                aria-label={list.title}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  const index = dropIndex(e, list.id);
                  if (over?.listId !== list.id || over.index !== index) setOver({ listId: list.id, index });
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(list.id, dropIndex(e, list.id));
                }}
                className={`flex w-72 shrink-0 flex-col rounded-2xl p-2 transition ${isOver ? 'bg-teal-soft ring-2 ring-teal' : list.is_done ? 'bg-teal-soft/50' : 'bg-line/50'}`}
              >
                <h2 className="mb-2 flex items-center justify-between px-1 font-label text-xs font-bold uppercase tracking-wider text-ink-soft">
                  <span>{list.is_done ? '✓ ' : ''}{list.title}</span>
                  <span className="rounded-full bg-white px-2 py-0.5">{listCards.length}</span>
                </h2>
                <ul className="flex min-h-12 flex-col gap-2">
                  {listCards.map((c, i) => (
                    <Fragment key={c.id}>
                      {isOver && over.index === i && dragId !== c.id ? <li aria-hidden="true" className="h-1.5 rounded-full bg-teal" /> : null}
                      <CardTile card={c} today={today} onDragStart={setDragId} dragging={dragId === c.id} />
                    </Fragment>
                  ))}
                  {isOver && over.index >= listCards.filter((c) => c.id !== dragId).length ? <li aria-hidden="true" className="h-1.5 rounded-full bg-teal" /> : null}
                </ul>
                <div className="mt-2"><AddCard listId={list.id} /></div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="table text-sm">
            <thead><tr><th>Card</th><th>List</th><th>Who</th><th>Deadline</th><th>Checklist</th><th>Priority</th></tr></thead>
            <tbody>
              {byDue.map((c) => {
                const state = dueState(c.due_date, today, c.list_is_done);
                return (
                  <tr key={c.id} className={c.list_is_done ? 'opacity-60' : ''}>
                    <td>
                      <Link href={`/dashboard/operations/projects/cards/${c.id}`} className="font-semibold text-teal hover:underline">{c.title}</Link>
                      <span className="block">{c.labels.map((l) => <span key={l} className={`mr-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${labelColour(l)}`}>{l}</span>)}</span>
                    </td>
                    <td>{c.list_title}</td>
                    <td className="text-xs">{c.assignees.map((a) => a.name).join(', ') || <span className="text-amber-800">Nobody</span>}</td>
                    <td>{c.due_date ? <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${DUE_STYLES[state]}`}>{shortDate(c.due_date)}{state === 'overdue' ? ' overdue' : ''}</span> : '—'}</td>
                    <td className="text-xs">{c.checklist_total ? `${c.checklist_done}/${c.checklist_total}` : '—'}</td>
                    <td className="text-xs">{PRIORITY_LABELS[c.priority]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
