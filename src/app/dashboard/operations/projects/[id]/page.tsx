import { notFound } from 'next/navigation';
import { addList, updateBoard, updateList } from '@/app/actions/projects';
import { BoardView } from '@/components/operations/BoardView';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { can } from '@/lib/auth';
import { todayISO } from '@/lib/format';
import { getBoard, getBoardCards, getStaffMembers } from '@/lib/operations';
import { requireStaff } from '@/lib/session';

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const data = await getBoard(Number((await params).id));
  if (!data) notFound();
  const { board, lists } = data;
  const [cards, staff] = await Promise.all([getBoardCards(board.id), getStaffMembers()]);
  const manage = can(user.role, 'manageOperations');
  const done = cards.filter((c) => c.list_is_done).length;
  const overdue = cards.filter((c) => !c.list_is_done && c.due_date && c.due_date < todayISO()).length;

  return (
    <div>
      <PageHeader eyebrow={`Project board · ${done} of ${cards.length} done${overdue ? ` · ${overdue} overdue` : ''}`} title={board.title} back={{ href: '/dashboard/operations/projects', label: 'Boards' }} />
      {board.description ? <p className="-mt-2 mb-4 max-w-3xl text-sm text-ink-soft">{board.description}</p> : null}
      <p className="mb-4 text-xs text-ink-soft">Drag cards between lists as work moves along. Click a card for details, people, checklist and comments.</p>
      <BoardView lists={lists} cards={cards} staff={staff} today={todayISO()} viewerId={user.id} />
      {manage ? (
        <details className="card mt-6 max-w-4xl">
          <summary className="cursor-pointer card-title">Board settings</summary>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="label">Lists</h3>
              <ul className="space-y-2">
                {lists.map((l, i) => (
                  <li key={l.id}>
                    <ActionForm action={updateList} submitLabel="Save" submitClassName="btn-ghost btn-sm" inline>
                      <input type="hidden" name="list_id" value={l.id} />
                      <input name="title" defaultValue={l.title} className="input w-36 py-1 text-sm" aria-label="List name" />
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_done" defaultChecked={l.is_done} className="accent-teal" /> Done list</label>
                      <select name="move" defaultValue="" className="input w-auto py-1 text-xs" aria-label="Move list">
                        <option value="">Keep place</option>
                        {i > 0 ? <option value="left">Move left</option> : null}
                        {i < lists.length - 1 ? <option value="right">Move right</option> : null}
                      </select>
                      <button type="submit" name="intent" value="delete" className="text-xs text-ink-soft underline">Delete</button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <ActionForm action={addList} submitLabel="Add list" submitClassName="btn-ghost btn-sm" inline resetOnSuccess>
                  <input type="hidden" name="board_id" value={board.id} />
                  <input name="title" placeholder="New list" className="input w-40 py-1 text-sm" aria-label="New list name" required />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_done" className="accent-teal" /> Done list</label>
                </ActionForm>
              </div>
              <p className="mt-2 text-xs text-ink-soft">Cards moved into a “Done list” count as completed.</p>
            </div>
            <ActionForm action={updateBoard} submitLabel="Save board">
              <input type="hidden" name="board_id" value={board.id} />
              <div><label className="label" htmlFor="b-title">Name</label><input className="input" id="b-title" name="title" defaultValue={board.title} required /></div>
              <div><label className="label" htmlFor="b-desc">Description</label><input className="input" id="b-desc" name="description" defaultValue={board.description ?? ''} /></div>
              <div><label className="label" htmlFor="b-start">Start date</label><input className="input" id="b-start" name="start_date" type="date" defaultValue={board.start_date ?? ''} /></div>
              <div>
                <label className="label" htmlFor="b-arch">Status</label>
                <select className="input" id="b-arch" name="is_archived" defaultValue={String(board.is_archived)}><option value="false">Active</option><option value="true">Archived</option></select>
              </div>
            </ActionForm>
          </div>
        </details>
      ) : null}
    </div>
  );
}
