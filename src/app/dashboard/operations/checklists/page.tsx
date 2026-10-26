import Link from 'next/link';
import { addSuggestedChecklists, saveTaskTemplate } from '@/app/actions/checklists';
import { ChecklistTask } from '@/components/operations/ChecklistTask';
import { EmptyState, PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { can } from '@/lib/auth';
import { addDaysISO, formatDate, todayISO } from '@/lib/format';
import { FREQUENCY_LABELS, WEEKDAYS, weekdayOf, type Frequency } from '@/lib/ops-shared';
import { getChecklist, getChecklistHistory, getStaffMembers, getTaskTemplates, type TaskTemplate } from '@/lib/operations';
import { requireStaff } from '@/lib/session';

function TemplateFields({ t, staff }: { t?: TaskTemplate; staff: { id: number; name: string }[] }) {
  const p = t ? `t${t.id}-` : 'new-';
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      {t ? <input type="hidden" name="id" value={t.id} /> : null}
      <div className="sm:col-span-4"><label className="label" htmlFor={`${p}title`}>Task</label><input className="input" id={`${p}title`} name="title" defaultValue={t?.title} required /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`${p}area`}>Area</label><input className="input" id={`${p}area`} name="area" defaultValue={t?.area ?? 'General'} list="task-areas" /></div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}freq`}>How often</label>
        <select className="input" id={`${p}freq`} name="frequency" defaultValue={t?.frequency ?? 'daily'}>
          {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}wd`}>Weekly: which day</label>
        <select className="input" id={`${p}wd`} name="weekday" defaultValue={t?.weekday ?? ''}>
          <option value="">Any day that week</option>
          {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`${p}time`}>Done by (time)</label><input className="input" id={`${p}time`} name="due_time" type="time" defaultValue={t?.due_time ?? ''} /></div>
      <div className="sm:col-span-3">
        <label className="label" htmlFor={`${p}who`}>Usually done by</label>
        <select className="input" id={`${p}who`} name="assigned_user_id" defaultValue={t?.assigned_user_id ?? ''}>
          <option value="">Anyone on shift</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="sm:col-span-3"><label className="label" htmlFor={`${p}ins`}>Instructions</label><input className="input" id={`${p}ins`} name="instructions" defaultValue={t?.instructions ?? ''} /></div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="requires_reading" defaultChecked={t?.requires_reading} className="h-4 w-4 accent-teal" /> Record a reading</label>
      <div><label className="label" htmlFor={`${p}unit`}>Unit</label><input className="input" id={`${p}unit`} name="reading_unit" defaultValue={t?.reading_unit ?? ''} placeholder="°C" /></div>
      <div><label className="label" htmlFor={`${p}min`}>Min</label><input className="input" id={`${p}min`} name="reading_min" type="number" step="any" defaultValue={t?.reading_min ?? ''} /></div>
      <div><label className="label" htmlFor={`${p}max`}>Max</label><input className="input" id={`${p}max`} name="reading_max" type="number" step="any" defaultValue={t?.reading_max ?? ''} /></div>
      {t ? (
        <div>
          <label className="label" htmlFor={`${p}act`}>Status</label>
          <select className="input" id={`${p}act`} name="is_active" defaultValue={String(t.is_active)}><option value="true">Active</option><option value="false">Hidden</option></select>
        </div>
      ) : null}
    </div>
  );
}

export default async function ChecklistsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireStaff();
  const today = todayISO();
  const { date: dateParam } = await searchParams;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam <= today ? dateParam : today;
  const editable = date >= addDaysISO(today, -1);
  const manage = can(user.role, 'manageOperations');
  const [tasks, history, templates, staff] = await Promise.all([
    getChecklist(date),
    getChecklistHistory(14),
    manage ? getTaskTemplates(true) : Promise.resolve([]),
    manage ? getStaffMembers() : Promise.resolve([]),
  ]);
  const wd = weekdayOf(date);
  const daily = tasks.filter((t) => t.frequency === 'daily');
  const weekly = tasks.filter((t) => t.frequency === 'weekly');
  const monthly = tasks.filter((t) => t.frequency === 'monthly');
  const areas = Array.from(new Set(daily.map((t) => t.area)));
  const doneCount = daily.filter((t) => t.completion_id).length;
  const sections: { title: string; rows: typeof tasks; note?: string }[] = [
    { title: 'This week', rows: weekly, note: 'Due once this week.' },
    { title: 'This month', rows: monthly, note: 'Due once this month.' },
  ];

  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Operations" title="Daily checklists" back={{ href: '/dashboard/operations', label: 'Operations' }} />
      <form className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/dashboard/operations/checklists?date=${addDaysISO(date, -1)}`} className="btn-ghost btn-sm">← Previous day</Link>
        <input type="date" name="date" defaultValue={date} max={today} className="input w-auto py-1.5" aria-label="Date" />
        <button className="btn-ghost btn-sm">Go</button>
        {date !== today ? <Link href="/dashboard/operations/checklists" className="btn-primary btn-sm">Today</Link> : null}
        <span className="ml-auto font-semibold">{WEEKDAYS[wd]} {formatDate(date)} · {doneCount} of {daily.length} daily tasks done</span>
      </form>
      {!editable ? <p className="mb-4 rounded-xl bg-paper px-3 py-2 text-sm text-ink-soft">Past days are read-only. Ticks can be added for today and yesterday.</p> : null}

      {tasks.length === 0 ? (
        <EmptyState>
          No checklist tasks yet.{manage ? ' Add the suggested clinic checklist below, or create your own.' : ' Ask an admin to set them up.'}
        </EmptyState>
      ) : null}

      <div className="mb-3 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div className="h-full bg-teal" style={{ width: `${daily.length ? Math.round((doneCount / daily.length) * 100) : 0}%` }} />
      </div>

      {areas.map((area) => (
        <section key={area} className="mb-5">
          <h2 className="card-title mb-2">{area}</h2>
          <ul className="space-y-2">
            {daily.filter((t) => t.area === area).map((t) => <ChecklistTask key={t.id} task={t} date={date} editable={editable} />)}
          </ul>
        </section>
      ))}
      {sections.map((s) => s.rows.length ? (
        <section key={s.title} className="mb-5">
          <h2 className="card-title mb-1">{s.title}</h2>
          <p className="mb-2 text-xs text-ink-soft">{s.note}</p>
          <ul className="space-y-2">
            {s.rows.map((t) => (
              <ChecklistTask key={t.id} task={t} date={date} editable={editable} dueToday={t.frequency === 'weekly' && t.weekday === wd} />
            ))}
          </ul>
        </section>
      ) : null)}

      <section className="card mt-8">
        <h2 className="card-title mb-3">Last 14 days</h2>
        <div className="overflow-x-auto">
          <table className="table text-sm">
            <thead><tr><th>Day</th><th>Daily tasks done</th><th>Out-of-range readings</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.day}>
                  <td><Link href={`/dashboard/operations/checklists?date=${h.day}`} className="text-teal hover:underline">{WEEKDAYS[weekdayOf(h.day)].slice(0, 3)} {formatDate(h.day)}</Link></td>
                  <td className={h.due && h.done < h.due ? 'font-semibold text-amber-800' : ''}>{h.done} / {h.due}</td>
                  <td className={h.flagged ? 'font-bold text-red-700' : ''}>{h.flagged || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {manage ? (
        <section className="card mt-8">
          <h2 className="card-title mb-3">Set up the checklist</h2>
          <datalist id="task-areas">{['Opening', 'Closing', 'Cleaning', 'Clinical', 'Reception', 'Stock', 'Safety'].map((a) => <option key={a} value={a} />)}</datalist>
          <div className="mb-5">
            <ActionForm action={addSuggestedChecklists} submitLabel="Add the suggested clinic checklist" submitClassName="btn-ghost btn-sm" inline>
              <span className="text-sm text-ink-soft">Opening and closing, fridge temperatures, oxygen, emergency trolley, sharps, stock count and more.</span>
            </ActionForm>
          </div>
          <details className="mb-5 rounded-xl border border-line p-3" open={templates.length === 0}>
            <summary className="cursor-pointer text-sm font-semibold text-teal">+ New task</summary>
            <div className="mt-3"><ActionForm action={saveTaskTemplate} submitLabel="Add task" resetOnSuccess><TemplateFields staff={staff} /></ActionForm></div>
          </details>
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={t.id} className={`rounded-xl border border-line p-3 ${t.is_active ? '' : 'opacity-60'}`}>
                <details>
                  <summary className="flex cursor-pointer flex-wrap justify-between gap-2 text-sm">
                    <span><strong>{t.title}</strong> <span className="text-ink-soft">· {t.area}</span></span>
                    <span className="text-xs text-ink-soft">
                      {FREQUENCY_LABELS[t.frequency]}{t.frequency === 'weekly' && t.weekday != null ? ` (${WEEKDAYS[t.weekday]})` : ''}{t.due_time ? ` · by ${t.due_time}` : ''}{t.is_active ? '' : ' · hidden'}
                    </span>
                  </summary>
                  <div className="mt-3"><ActionForm action={saveTaskTemplate} submitLabel="Save"><TemplateFields t={t} staff={staff} /></ActionForm></div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
