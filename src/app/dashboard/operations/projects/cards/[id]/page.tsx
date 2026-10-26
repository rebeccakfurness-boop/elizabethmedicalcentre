import Link from 'next/link';
import { notFound } from 'next/navigation';
import { addChecklistItem, addComment, deleteChecklistItem, setCardArchived, updateCard } from '@/app/actions/projects';
import { ChecklistToggle } from '@/components/operations/ChecklistToggle';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { formatClinicTime, formatDate, todayISO } from '@/lib/format';
import { DEFAULT_LABELS, dueState, labelColour, PRIORITY_LABELS, type Priority } from '@/lib/ops-shared';
import { getBoard, getCardDetail, getStaffMembers } from '@/lib/operations';
import { requireStaff } from '@/lib/session';

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const detail = await getCardDetail(Number((await params).id));
  if (!detail) notFound();
  const { card, checklist, activity } = detail;
  const [board, staff] = await Promise.all([getBoard(card.board_id), getStaffMembers()]);
  const today = todayISO();
  const state = dueState(card.due_date, today, card.list_is_done);
  const labelOptions = Array.from(new Set([...DEFAULT_LABELS, ...card.labels]));
  const doneItems = checklist.filter((i) => i.is_done).length;

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow={`${card.board_title} · ${card.list_title}`}
        title={card.title}
        back={{ href: `/dashboard/operations/projects/${card.board_id}`, label: card.board_title }}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {card.labels.map((l) => <span key={l} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${labelColour(l)}`}>{l}</span>)}
        {card.due_date ? (
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${state === 'overdue' ? 'bg-red-600 text-white' : state === 'today' ? 'bg-orange-500 text-white' : state === 'done' ? 'bg-teal-soft text-teal-deep' : 'bg-paper'}`}>
            Due {formatDate(card.due_date)}{state === 'overdue' ? ' · overdue' : state === 'today' ? ' · today' : ''}
          </span>
        ) : null}
        <span className="text-xs text-ink-soft">{PRIORITY_LABELS[card.priority]} priority</span>
        {card.assignees.length ? <span className="text-xs">👥 {card.assignees.map((a) => a.name).join(', ')}</span> : <span className="text-xs text-amber-800">Nobody assigned</span>}
        {card.is_archived ? <span className="pill bg-stone-200 text-stone-700">Archived</span> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="card-title">Checklist</h2>
              {checklist.length ? <span className="text-xs text-ink-soft">{doneItems} of {checklist.length}</span> : null}
            </div>
            {checklist.length ? (
              <>
                <div className="mb-3 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true"><div className="h-full bg-teal" style={{ width: `${Math.round((doneItems / checklist.length) * 100)}%` }} /></div>
                <ul className="mb-4 divide-y divide-line">
                  {checklist.map((i) => (
                    <li key={i.id} className="flex items-start gap-3 py-2">
                      <ChecklistToggle id={i.id} done={i.is_done} label={i.text} />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className={i.is_done ? 'text-ink-soft line-through' : ''}>{i.text}</p>
                        <p className="text-xs text-ink-soft">
                          {i.assignee_name ? `👤 ${i.assignee_name}` : null}
                          {i.due_date ? `${i.assignee_name ? ' · ' : ''}by ${formatDate(i.due_date)}` : null}
                          {i.is_done && i.done_by_name ? `${i.assignee_name || i.due_date ? ' · ' : ''}✓ ${i.done_by_name} ${formatClinicTime(i.done_at)}` : null}
                        </p>
                      </div>
                      <ActionForm action={deleteChecklistItem} submitLabel="✕" submitClassName="text-xs text-ink-soft hover:text-red-700" inline>
                        <input type="hidden" name="item_id" value={i.id} />
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <ActionForm action={addChecklistItem} submitLabel="Add" submitClassName="btn-ghost btn-sm" resetOnSuccess className="space-y-2">
              <input type="hidden" name="card_id" value={card.id} />
              <div className="flex flex-wrap gap-2">
                <input name="text" required placeholder="Add a step" className="input min-w-48 flex-1 py-1.5 text-sm" aria-label="New checklist step" />
                <select name="assignee_id" defaultValue="" className="input w-auto py-1.5 text-sm" aria-label="Who does this step">
                  <option value="">Anyone</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input name="due_date" type="date" className="input w-auto py-1.5 text-sm" aria-label="Step deadline" />
              </div>
            </ActionForm>
          </section>

          <section className="card">
            <h2 className="card-title mb-3">Comments and history</h2>
            <ActionForm action={addComment} submitLabel="Comment" submitClassName="btn-primary btn-sm" resetOnSuccess>
              <input type="hidden" name="card_id" value={card.id} />
              <textarea name="body" rows={2} required className="input text-sm" placeholder="Update the team, ask a question, share a link…" aria-label="Comment" />
            </ActionForm>
            <ul className="mt-4 space-y-3">
              {activity.map((a) => (
                <li key={a.id} className={a.kind === 'comment' ? 'rounded-xl bg-paper p-3 text-sm' : 'px-1 text-xs text-ink-soft'}>
                  {a.kind === 'comment' ? (
                    <>
                      <p className="mb-1 text-xs text-ink-soft"><strong className="text-ink">{a.user_name ?? 'Someone'}</strong> · {formatClinicTime(a.created_at)}</p>
                      <p className="whitespace-pre-line">{a.body}</p>
                    </>
                  ) : (
                    <p><strong>{a.user_name ?? 'Someone'}</strong> {a.body} · {formatClinicTime(a.created_at)}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="lg:col-span-2">
          <section className="card">
            <h2 className="card-title mb-3">Details</h2>
            <ActionForm action={updateCard} submitLabel="Save card">
              <input type="hidden" name="card_id" value={card.id} />
              <div><label className="label" htmlFor="title">Title</label><textarea className="input" id="title" name="title" rows={2} defaultValue={card.title} required /></div>
              <div>
                <label className="label" htmlFor="list_id">List</label>
                <select className="input" id="list_id" name="list_id" defaultValue={card.list_id}>
                  {board?.lists.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              </div>
              <fieldset>
                <legend className="label">People working on it</legend>
                <div className="grid grid-cols-2 gap-1">
                  {staff.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="assignees" value={s.id} defaultChecked={card.assignees.some((a) => a.id === s.id)} className="h-4 w-4 accent-teal" /> {s.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor="start_date">Start</label><input className="input" id="start_date" name="start_date" type="date" defaultValue={card.start_date ?? ''} /></div>
                <div><label className="label" htmlFor="due_date">Deadline</label><input className="input" id="due_date" name="due_date" type="date" defaultValue={card.due_date ?? ''} /></div>
              </div>
              <div>
                <label className="label" htmlFor="priority">Priority</label>
                <select className="input" id="priority" name="priority" defaultValue={card.priority}>
                  {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
              </div>
              <fieldset>
                <legend className="label">Labels</legend>
                <div className="flex flex-wrap gap-1.5">
                  {labelOptions.map((l) => (
                    <label key={l} className="flex items-center gap-1 text-xs">
                      <input type="checkbox" name="labels" value={l} defaultChecked={card.labels.includes(l)} className="accent-teal" />
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${labelColour(l)}`}>{l}</span>
                    </label>
                  ))}
                </div>
                <input name="new_label" placeholder="New label" className="input mt-2 py-1.5 text-sm" aria-label="New label" />
              </fieldset>
              <div><label className="label" htmlFor="description">Description</label><textarea className="input text-sm" id="description" name="description" rows={5} defaultValue={card.description ?? ''} /></div>
            </ActionForm>
          </section>
          <p className="mt-3 text-xs text-ink-soft">Created {formatClinicTime(card.created_at)}{card.created_by_name ? ` by ${card.created_by_name}` : ''}</p>
          <div className="mt-3 flex gap-3">
            <ActionForm action={setCardArchived} submitLabel={card.is_archived ? 'Restore card' : 'Archive card'} submitClassName="text-xs text-ink-soft underline" inline confirm={card.is_archived ? undefined : 'Archive this card? It disappears from the board but keeps its history.'}>
              <input type="hidden" name="card_id" value={card.id} />
              <input type="hidden" name="archive" value={String(!card.is_archived)} />
            </ActionForm>
            <Link href={`/dashboard/operations/projects/${card.board_id}`} className="text-xs text-teal underline">Back to board</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
