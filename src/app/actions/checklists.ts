'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@/app/actions/auth';
import { can } from '@/lib/auth';
import { sql } from '@/lib/db';
import { dateStr, num, str } from '@/lib/form';
import { addDaysISO, todayISO } from '@/lib/format';
import { periodStart, readingOutOfRange, type Frequency } from '@/lib/ops-shared';
import { audit, requirePermission, requireStaff } from '@/lib/session';
import { SUGGESTED_CHECKLISTS } from '@/operations/templates';

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly'];

function revalidate() {
  revalidatePath('/dashboard/operations');
  revalidatePath('/dashboard/operations/checklists');
}

/** Ticks a task for its current period. Staff can catch up on yesterday, but not further back. */
export async function completeTask(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff();
  const id = num(fd, 'template_id');
  const date = dateStr(fd, 'date') ?? todayISO();
  if (!id) return { error: 'Missing task.' };
  if (date > todayISO() || date < addDaysISO(todayISO(), -1)) return { error: 'You can only tick tasks for today or yesterday.' };
  const [t] = await sql<{ frequency: Frequency; requires_reading: boolean; reading_min: number | null; reading_max: number | null; reading_unit: string | null }>`
    SELECT frequency, requires_reading, reading_min, reading_max, reading_unit FROM ops_task_templates WHERE id = ${id} AND is_active`;
  if (!t) return { error: 'Task not found.' };
  const reading = num(fd, 'reading');
  if (t.requires_reading && reading == null) return { error: `Enter the reading${t.reading_unit ? ` (${t.reading_unit})` : ''}.` };
  const out = readingOutOfRange(reading, t.reading_min, t.reading_max);
  const note = str(fd, 'note');
  if (out && !note) return { error: `That reading is out of range (${[t.reading_min != null ? `min ${t.reading_min}` : null, t.reading_max != null ? `max ${t.reading_max}` : null].filter(Boolean).join(', ')} ${t.reading_unit ?? ''}). Write what you did about it.` };
  const period = periodStart(date, t.frequency);
  const rows = await sql`INSERT INTO ops_task_completions (template_id, period_date, completed_by, reading, out_of_range, note)
    VALUES (${id}, ${period}, ${user.id}, ${reading}, ${out}, ${note}) ON CONFLICT (template_id, period_date) DO NOTHING RETURNING id`;
  if (!rows.length) return { error: 'Someone has already ticked this.' };
  await audit(user.id, 'task_done', 'ops_task', id, out ? `out of range: ${reading}` : undefined);
  revalidate();
  return { ok: out ? 'Saved and flagged as out of range.' : 'Done ✓' };
}

export async function undoTask(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff();
  const id = num(fd, 'completion_id');
  if (!id) return { error: 'Missing task.' };
  // Only the person who ticked it (or a manager) can untick it, and only within a day and a half.
  const rows = await sql`DELETE FROM ops_task_completions WHERE id = ${id} AND completed_at > now() - interval '36 hours'
    AND (completed_by = ${user.id} OR ${can(user.role, 'manageOperations')}) RETURNING template_id`;
  if (!rows.length) return { error: 'You can only undo your own recent ticks.' };
  await audit(user.id, 'task_undone', 'ops_task_completion', id);
  revalidate();
  return { ok: 'Unticked.' };
}

export async function saveTaskTemplate(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const id = num(fd, 'id');
  const title = str(fd, 'title');
  const frequency = str(fd, 'frequency') as Frequency;
  if (!title) return { error: 'Describe the task.' };
  if (!FREQUENCIES.includes(frequency)) return { error: 'Choose how often.' };
  const requiresReading = str(fd, 'requires_reading') === 'on';
  const min = num(fd, 'reading_min');
  const max = num(fd, 'reading_max');
  if (min != null && max != null && min >= max) return { error: 'The minimum must be below the maximum.' };
  const dueTime = str(fd, 'due_time');
  if (dueTime && !/^\d{2}:\d{2}$/.test(dueTime)) return { error: 'Use a time like 08:30.' };
  const weekday = frequency === 'weekly' ? num(fd, 'weekday') : null;
  const values = {
    area: str(fd, 'area') ?? 'General',
    instructions: str(fd, 'instructions'),
    assigned: num(fd, 'assigned_user_id'),
    unit: requiresReading ? str(fd, 'reading_unit') : null,
    min: requiresReading ? min : null,
    max: requiresReading ? max : null,
  };
  if (id) {
    await sql`UPDATE ops_task_templates SET title = ${title}, area = ${values.area}, frequency = ${frequency}, weekday = ${weekday}, due_time = ${dueTime},
      instructions = ${values.instructions}, assigned_user_id = ${values.assigned}, requires_reading = ${requiresReading}, reading_unit = ${values.unit},
      reading_min = ${values.min}, reading_max = ${values.max}, is_active = ${str(fd, 'is_active') !== 'false'} WHERE id = ${id}`;
    await audit(user.id, 'update', 'ops_task', id);
  } else {
    const [row] = await sql<{ id: number }>`INSERT INTO ops_task_templates (title, area, frequency, weekday, due_time, instructions, assigned_user_id,
        requires_reading, reading_unit, reading_min, reading_max, created_by)
      VALUES (${title}, ${values.area}, ${frequency}, ${weekday}, ${dueTime}, ${values.instructions}, ${values.assigned},
        ${requiresReading}, ${values.unit}, ${values.min}, ${values.max}, ${user.id}) RETURNING id`;
    await audit(user.id, 'create', 'ops_task', row.id);
  }
  revalidate();
  return { ok: id ? 'Task saved.' : 'Task added to the checklist.' };
}

/** Adds the suggested clinic checklist, skipping any task with the same title already there. */
export async function addSuggestedChecklists(_prev: FormState, _fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  let added = 0;
  for (const [i, t] of SUGGESTED_CHECKLISTS.entries()) {
    const rows = await sql`INSERT INTO ops_task_templates (title, area, frequency, weekday, due_time, instructions, requires_reading, reading_unit, reading_min, reading_max, sort_order, created_by)
      SELECT ${t.title}, ${t.area}, ${t.frequency}, ${t.weekday ?? null}, ${t.dueTime ?? null}, ${t.instructions ?? null}, ${!!t.reading},
        ${t.reading?.unit ?? null}, ${t.reading?.min ?? null}, ${t.reading?.max ?? null}, ${i}, ${user.id}
      WHERE NOT EXISTS (SELECT 1 FROM ops_task_templates WHERE title = ${t.title}) RETURNING id`;
    added += rows.length;
  }
  await audit(user.id, 'add_suggested', 'ops_task', null, `${added} added`);
  revalidate();
  return { ok: added ? `${added} suggested tasks added. Edit or hide any you don't need.` : 'The suggested tasks are already there.' };
}
