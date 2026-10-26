import { completeTask, undoTask } from '@/app/actions/checklists';
import { ActionForm } from '@/components/ui/ActionForm';
import { formatClinicTime } from '@/lib/format';
import type { ChecklistRow } from '@/lib/operations';

/** One row of the checklist: tick it (with a reading if needed), or see who did it. */
export function ChecklistTask({ task, date, editable, dueToday = false }: { task: ChecklistRow; date: string; editable: boolean; dueToday?: boolean }) {
  const done = !!task.completion_id;
  const unit = task.reading_unit ? ` ${task.reading_unit}` : '';
  const range = !task.requires_reading
    ? null
    : task.reading_min != null && task.reading_max != null
      ? `range ${task.reading_min}–${task.reading_max}${unit}`
      : task.reading_max != null
        ? `max ${task.reading_max}${unit}`
        : task.reading_min != null
          ? `min ${task.reading_min}${unit}`
          : null;
  return (
    <li className={`rounded-xl border px-3 py-2.5 ${done ? (task.out_of_range ? 'border-red-300 bg-red-50' : 'border-teal/30 bg-teal-soft/60') : 'border-line bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${done ? 'text-teal-deep' : ''}`}>
            <span aria-hidden="true">{done ? '☑' : '☐'}</span> {task.title}
            {dueToday && !done ? <span className="pill ml-2 bg-amber-100 text-amber-900">Due today</span> : null}
          </p>
          <p className="text-xs text-ink-soft">
            {task.due_time ? `By ${task.due_time}` : null}
            {task.assigned_name ? `${task.due_time ? ' · ' : ''}${task.assigned_name}` : null}
            {range ? ` · ${range}` : null}
          </p>
          {task.instructions && !done ? <p className="mt-1 text-xs text-ink-soft">{task.instructions}</p> : null}
          {done ? (
            <p className="mt-1 text-xs">
              ✓ {task.completed_by_name} · {formatClinicTime(task.completed_at)}
              {task.reading != null ? <strong className={task.out_of_range ? 'ml-1 text-red-700' : 'ml-1'}> · {task.reading} {task.reading_unit}{task.out_of_range ? ' ⚠ out of range' : ''}</strong> : null}
              {task.note ? <span className="block text-ink-soft">“{task.note}”</span> : null}
            </p>
          ) : null}
        </div>
        {editable && !done ? (
          <ActionForm action={completeTask} submitLabel="Done" submitClassName="btn-primary btn-sm" inline>
            <input type="hidden" name="template_id" value={task.id} />
            <input type="hidden" name="date" value={date} />
            {task.requires_reading ? (
              <input name="reading" type="number" step="any" inputMode="decimal" required placeholder={task.reading_unit ?? 'Reading'} className="input w-24 py-1.5" aria-label={`${task.title} reading`} />
            ) : null}
            <input name="note" placeholder="Note (optional)" className="input w-40 py-1.5 text-sm" aria-label={`${task.title} note`} />
          </ActionForm>
        ) : null}
        {editable && done && task.completion_id ? (
          <ActionForm action={undoTask} submitLabel="Undo" submitClassName="text-xs text-ink-soft underline" inline>
            <input type="hidden" name="completion_id" value={task.completion_id} />
          </ActionForm>
        ) : null}
      </div>
    </li>
  );
}
