import Link from 'next/link';
import { createBoard } from '@/app/actions/projects';
import { EmptyState, PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { Field } from '@/components/ui/Field';
import { can } from '@/lib/auth';
import { formatDate, todayISO } from '@/lib/format';
import { listBoards } from '@/lib/operations';
import { requireStaff } from '@/lib/session';

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const user = await requireStaff();
  const { archived } = await searchParams;
  const boards = await listBoards(archived === '1');
  const manage = can(user.role, 'manageOperations');
  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Operations" title="Project boards" back={{ href: '/dashboard/operations', label: 'Operations' }} />
      {boards.length === 0 ? <EmptyState>No boards yet.{manage ? ' Start with the clinic launch plan below.' : ''}</EmptyState> : null}
      <ul className="mb-8 grid gap-4 sm:grid-cols-2">
        {boards.map((b) => {
          const pct = b.card_count ? Math.round((b.done_count / b.card_count) * 100) : 0;
          return (
            <li key={b.id}>
              <Link href={`/dashboard/operations/projects/${b.id}`} className={`card block transition hover:border-teal ${b.is_archived ? 'opacity-60' : ''}`}>
                <p className="font-headline text-lg font-extrabold text-pulse">{b.title}</p>
                {b.description ? <p className="text-sm text-ink-soft">{b.description}</p> : null}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true"><div className="h-full bg-teal" style={{ width: `${pct}%` }} /></div>
                <p className="mt-2 text-xs text-ink-soft">
                  {b.done_count} of {b.card_count} done ({pct}%){b.overdue_count ? <strong className="text-red-700"> · {b.overdue_count} overdue</strong> : null}
                  {b.start_date ? ` · started ${formatDate(b.start_date)}` : ''}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href={archived === '1' ? '/dashboard/operations/projects' : '/dashboard/operations/projects?archived=1'} className="text-sm text-teal underline">
        {archived === '1' ? 'Hide archived boards' : 'Show archived boards'}
      </Link>
      {manage ? (
        <section className="card mt-6">
          <h2 className="card-title mb-3">New board</h2>
          <ActionForm action={createBoard} submitLabel="Create board" submitClassName="btn-clay">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Board name" name="title" required placeholder="e.g. Clinic launch" />
              <Field label="Start date" name="start_date" type="date" defaultValue={todayISO()} hint="Deadlines in the launch plan count from this date." />
              <Field label="Description" name="description" className="sm:col-span-2" />
            </div>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="label">Start from</legend>
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line p-3 text-sm has-[:checked]:border-teal has-[:checked]:bg-teal-soft">
                <input type="radio" name="template" value="launch" defaultChecked={boards.length === 0} className="mt-1 accent-teal" />
                <span><strong>Clinic launch plan (6+ months)</strong><span className="block text-xs text-ink-soft">About 40 cards: licensing, fit-out, equipment, clinical set-up, staffing, IT, marketing and opening, with deadlines and checklists. Confirm the licensing steps with Dinas Kesehatan.</span></span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line p-3 text-sm has-[:checked]:border-teal has-[:checked]:bg-teal-soft">
                <input type="radio" name="template" value="blank" defaultChecked={boards.length > 0} className="mt-1 accent-teal" />
                <span><strong>Blank board</strong><span className="block text-xs text-ink-soft">To do, In progress, Done.</span></span>
              </label>
            </fieldset>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
