'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/app/actions/auth';
import { sql, transaction } from '@/lib/db';
import { dateStr, num, str } from '@/lib/form';
import { addDaysISO, formatDate, todayISO } from '@/lib/format';
import { PRIORITY_LABELS, type Priority } from '@/lib/ops-shared';
import { audit, requirePermission, requireStaff } from '@/lib/session';
import { LAUNCH_CARDS, LAUNCH_LISTS } from '@/operations/templates';

const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[];

const boardPath = (id: number) => `/dashboard/operations/projects/${id}`;
const cardPath = (id: number) => `/dashboard/operations/projects/cards/${id}`;

async function logEvent(cardId: number, userId: number, body: string) {
  await sql`INSERT INTO project_card_activity (card_id, user_id, kind, body) VALUES (${cardId}, ${userId}, 'event', ${body})`;
}

function revalidateCard(boardId: number, cardId?: number) {
  revalidatePath(boardPath(boardId));
  revalidatePath('/dashboard/operations/projects');
  revalidatePath('/dashboard/operations');
  if (cardId) revalidatePath(cardPath(cardId));
}

// ---------- Boards and lists (managers) ----------

export async function createBoard(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const title = str(fd, 'title');
  const start = dateStr(fd, 'start_date') ?? todayISO();
  const template = str(fd, 'template') === 'launch' ? 'launch' : 'blank';
  if (!title) return { error: 'Name the board.' };
  let boardId = 0;
  await transaction(async (q) => {
    const [b] = await q<{ id: number }>`INSERT INTO project_boards (title, description, start_date, created_by)
      VALUES (${title}, ${str(fd, 'description')}, ${start}, ${user.id}) RETURNING id`;
    boardId = b.id;
    const listNames = template === 'launch' ? [...LAUNCH_LISTS] : ['To do', 'In progress', 'Done'];
    const listIds = new Map<string, number>();
    for (const [i, name] of listNames.entries()) {
      const [l] = await q<{ id: number }>`INSERT INTO project_lists (board_id, title, position, is_done) VALUES (${b.id}, ${name}, ${i}, ${name === 'Done'}) RETURNING id`;
      listIds.set(name, l.id);
    }
    if (template === 'launch') {
      for (const [i, c] of LAUNCH_CARDS.entries()) {
        const [card] = await q<{ id: number }>`INSERT INTO project_cards (board_id, list_id, title, description, position, start_date, due_date, priority, labels, created_by)
          VALUES (${b.id}, ${listIds.get(c.list)}, ${c.title}, ${c.description ?? null}, ${i},
            ${c.startWeek != null ? addDaysISO(start, c.startWeek * 7) : null}, ${addDaysISO(start, c.dueWeek * 7)},
            ${c.priority ?? 'normal'}, ${[c.label]}, ${user.id}) RETURNING id`;
        for (const [j, item] of (c.checklist ?? []).entries()) {
          await q`INSERT INTO project_checklist_items (card_id, text, position) VALUES (${card.id}, ${item}, ${j})`;
        }
      }
    }
  });
  await audit(user.id, 'create', 'project_board', boardId, template);
  revalidatePath('/dashboard/operations/projects');
  redirect(boardPath(boardId));
}

export async function updateBoard(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const id = num(fd, 'board_id');
  const title = str(fd, 'title');
  if (!id || !title) return { error: 'Name the board.' };
  await sql`UPDATE project_boards SET title = ${title}, description = ${str(fd, 'description')}, start_date = ${dateStr(fd, 'start_date')},
    is_archived = ${str(fd, 'is_archived') === 'true'} WHERE id = ${id}`;
  await audit(user.id, 'update', 'project_board', id);
  revalidateCard(id);
  return { ok: 'Board saved.' };
}

export async function addList(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const boardId = num(fd, 'board_id');
  const title = str(fd, 'title');
  if (!boardId || !title) return { error: 'Name the list.' };
  await sql`INSERT INTO project_lists (board_id, title, position, is_done)
    SELECT ${boardId}, ${title}, COALESCE(MAX(position), -1) + 1, ${str(fd, 'is_done') === 'on'} FROM project_lists WHERE board_id = ${boardId}`;
  await audit(user.id, 'add_list', 'project_board', boardId, title);
  revalidateCard(boardId);
  return { ok: 'List added.' };
}

export async function updateList(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const id = num(fd, 'list_id');
  const [list] = id ? await sql<{ board_id: number; position: number }>`SELECT board_id, position FROM project_lists WHERE id = ${id}` : [];
  if (!list) return { error: 'List not found.' };
  if (str(fd, 'intent') === 'delete') {
    const [{ n }] = await sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM project_cards WHERE list_id = ${id} AND NOT is_archived`;
    if (n) return { error: 'Move or archive the cards in this list first.' };
    await sql`UPDATE project_cards SET list_id = (SELECT id FROM project_lists WHERE board_id = ${list.board_id} AND id <> ${id} ORDER BY position LIMIT 1) WHERE list_id = ${id}`;
    await sql`DELETE FROM project_lists WHERE id = ${id}`;
  } else {
    const title = str(fd, 'title');
    if (!title) return { error: 'Name the list.' };
    const move = str(fd, 'move');
    await sql`UPDATE project_lists SET title = ${title}, is_done = ${str(fd, 'is_done') === 'on'} WHERE id = ${id}`;
    if (move === 'left' || move === 'right') {
      const [neighbour] = move === 'left'
        ? await sql<{ id: number; position: number }>`SELECT id, position FROM project_lists WHERE board_id = ${list.board_id} AND position < ${list.position} ORDER BY position DESC LIMIT 1`
        : await sql<{ id: number; position: number }>`SELECT id, position FROM project_lists WHERE board_id = ${list.board_id} AND position > ${list.position} ORDER BY position LIMIT 1`;
      if (neighbour) {
        await sql`UPDATE project_lists SET position = ${neighbour.position} WHERE id = ${id}`;
        await sql`UPDATE project_lists SET position = ${list.position} WHERE id = ${neighbour.id}`;
      }
    }
  }
  await audit(user.id, 'update_list', 'project_board', list.board_id);
  revalidateCard(list.board_id);
  return { ok: 'Saved.' };
}

// ---------- Cards (everyone) ----------

export async function createCard(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff();
  const listId = num(fd, 'list_id');
  const title = str(fd, 'title');
  if (!listId || !title) return { error: 'Give the card a title.' };
  const [list] = await sql<{ board_id: number; is_done: boolean }>`SELECT board_id, is_done FROM project_lists WHERE id = ${listId}`;
  if (!list) return { error: 'List not found.' };
  const [card] = await sql<{ id: number }>`INSERT INTO project_cards (board_id, list_id, title, position, due_date, created_by, completed_at)
    SELECT ${list.board_id}, ${listId}, ${title}, COALESCE(MAX(position), -1) + 1, ${dateStr(fd, 'due_date')}, ${user.id}, ${list.is_done ? new Date() : null}
    FROM project_cards WHERE list_id = ${listId} RETURNING id`;
  if (str(fd, 'assign_me') === 'on') await sql`INSERT INTO project_card_assignees (card_id, user_id) VALUES (${card.id}, ${user.id})`;
  await logEvent(card.id, user.id, 'created this card');
  revalidateCard(list.board_id, card.id);
  return { ok: 'Card added.' };
}

/**
 * Drag and drop: puts the card in `listId` and renumbers that list in the order the board shows.
 * Called directly from the board, not through a form.
 */
export async function moveCard(cardId: number, listId: number, orderedIds: number[]): Promise<{ error?: string }> {
  const user = await requireStaff();
  const [card] = await sql<{ board_id: number; list_id: number; from_title: string }>`
    SELECT c.board_id, c.list_id, l.title AS from_title FROM project_cards c JOIN project_lists l ON l.id = c.list_id WHERE c.id = ${cardId}`;
  const [to] = await sql<{ board_id: number; title: string; is_done: boolean }>`SELECT board_id, title, is_done FROM project_lists WHERE id = ${listId}`;
  if (!card || !to || card.board_id !== to.board_id) return { error: 'That move isn’t possible.' };
  const ids = orderedIds.filter((n) => Number.isInteger(n));
  if (!ids.includes(cardId)) ids.push(cardId);
  await transaction(async (q) => {
    await q`UPDATE project_cards SET list_id = ${listId}, updated_at = now(),
      completed_at = CASE WHEN ${to.is_done} THEN COALESCE(completed_at, now()) ELSE NULL END WHERE id = ${cardId}`;
    await q`UPDATE project_cards c SET position = x.ord FROM unnest(${ids}::int[]) WITH ORDINALITY AS x(id, ord)
      WHERE c.id = x.id AND c.list_id = ${listId}`;
  });
  if (card.list_id !== listId) await logEvent(cardId, user.id, `moved this card from ${card.from_title} to ${to.title}`);
  revalidateCard(card.board_id, cardId);
  return {};
}

export async function updateCard(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff();
  const id = num(fd, 'card_id');
  if (!id) return { error: 'Card not found.' };
  const [card] = await sql<{ board_id: number; list_id: number; title: string; due_date: string | null; priority: Priority }>`
    SELECT board_id, list_id, title, due_date, priority FROM project_cards WHERE id = ${id}`;
  if (!card) return { error: 'Card not found.' };
  const title = str(fd, 'title');
  const priority = str(fd, 'priority') as Priority;
  if (!title) return { error: 'Give the card a title.' };
  if (!PRIORITIES.includes(priority)) return { error: 'Choose a priority.' };
  const start = dateStr(fd, 'start_date');
  const due = dateStr(fd, 'due_date');
  if (start && due && start > due) return { error: 'The start date is after the deadline.' };
  const labels = [...new Set(fd.getAll('labels').map(String).map((l) => l.trim()).filter(Boolean))];
  const extraLabel = str(fd, 'new_label');
  if (extraLabel) labels.push(extraLabel);
  const assignees = [...new Set(fd.getAll('assignees').map(Number).filter(Boolean))];
  const listId = num(fd, 'list_id') ?? card.list_id;
  const [list] = await sql<{ board_id: number; title: string; is_done: boolean }>`SELECT board_id, title, is_done FROM project_lists WHERE id = ${listId}`;
  if (!list || list.board_id !== card.board_id) return { error: 'Choose a list on this board.' };

  const before = await sql<{ user_id: number; name: string }>`SELECT a.user_id, u.name FROM project_card_assignees a JOIN users u ON u.id = a.user_id WHERE a.card_id = ${id}`;
  const names = assignees.length ? await sql<{ id: number; name: string }>`SELECT id, name FROM users WHERE id = ANY(${assignees}) AND role <> 'patient'` : [];
  await transaction(async (q) => {
    await q`UPDATE project_cards SET title = ${title}, description = ${str(fd, 'description')}, start_date = ${start}, due_date = ${due},
      priority = ${priority}, labels = ${labels}, updated_at = now(),
      position = CASE WHEN list_id = ${listId} THEN position ELSE (SELECT COALESCE(MAX(position), -1) + 1 FROM project_cards WHERE list_id = ${listId}) END,
      list_id = ${listId}, completed_at = CASE WHEN ${list.is_done} THEN COALESCE(completed_at, now()) ELSE NULL END
      WHERE id = ${id}`;
    await q`DELETE FROM project_card_assignees WHERE card_id = ${id} AND NOT (user_id = ANY(${names.map((n) => n.id)}))`;
    for (const n of names) await q`INSERT INTO project_card_assignees (card_id, user_id) VALUES (${id}, ${n.id}) ON CONFLICT DO NOTHING`;
  });

  // History of what changed, so the team can see who did what.
  const added = names.filter((n) => !before.some((b) => b.user_id === n.id)).map((n) => n.name);
  const removed = before.filter((b) => !names.some((n) => n.id === b.user_id)).map((b) => b.name);
  if (added.length) await logEvent(id, user.id, `assigned ${added.join(', ')}`);
  if (removed.length) await logEvent(id, user.id, `removed ${removed.join(', ')}`);
  if ((card.due_date ?? null) !== (due ?? null)) await logEvent(id, user.id, due ? `set the deadline to ${formatDate(due)}` : 'removed the deadline');
  if (card.priority !== priority) await logEvent(id, user.id, `changed priority to ${PRIORITY_LABELS[priority]}`);
  if (card.list_id !== listId) await logEvent(id, user.id, `moved this card to ${list.title}`);
  revalidateCard(card.board_id, id);
  return { ok: 'Card saved.' };
}

export async function setCardArchived(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff();
  const id = num(fd, 'card_id');
  const archive = str(fd, 'archive') === 'true';
  const [card] = id ? await sql<{ board_id: number }>`UPDATE project_cards SET is_archived = ${archive}, updated_at = now() WHERE id = ${id} RETURNING board_id` : [];
  if (!card) return { error: 'Card not found.' };
  await logEvent(id!, user.id, archive ? 'archived this card' : 'restored this card');
  revalidateCard(card.board_id, id!);
  return { ok: archive ? 'Card archived.' : 'Card restored.' };
}

async function cardBoard(cardId: number) {
  return (await sql<{ board_id: number }>`SELECT board_id FROM project_cards WHERE id = ${cardId}`)[0]?.board_id ?? null;
}

export async function addComment(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff();
  const id = num(fd, 'card_id');
  const body = str(fd, 'body');
  const boardId = id ? await cardBoard(id) : null;
  if (!id || !boardId) return { error: 'Card not found.' };
  if (!body) return { error: 'Write a comment.' };
  await sql`INSERT INTO project_card_activity (card_id, user_id, kind, body) VALUES (${id}, ${user.id}, 'comment', ${body})`;
  await sql`UPDATE project_cards SET updated_at = now() WHERE id = ${id}`;
  revalidateCard(boardId, id);
  return { ok: 'Comment added.' };
}

// ---------- Checklist ----------

export async function addChecklistItem(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff();
  const id = num(fd, 'card_id');
  const text = str(fd, 'text');
  const boardId = id ? await cardBoard(id) : null;
  if (!id || !boardId) return { error: 'Card not found.' };
  if (!text) return { error: 'Describe the step.' };
  const assignee = num(fd, 'assignee_id');
  await sql`INSERT INTO project_checklist_items (card_id, text, assignee_id, due_date, position)
    SELECT ${id}, ${text}, ${assignee}, ${dateStr(fd, 'due_date')}, COALESCE(MAX(position), -1) + 1 FROM project_checklist_items WHERE card_id = ${id}`;
  if (assignee) {
    const [u] = await sql<{ name: string }>`SELECT name FROM users WHERE id = ${assignee}`;
    if (u) await logEvent(id, user.id, `gave “${text}” to ${u.name}`);
  }
  revalidateCard(boardId, id);
  return { ok: 'Added.' };
}

/** Ticks or unticks a checklist item. Called directly from the checkbox. */
export async function setChecklistItemDone(itemId: number, done: boolean): Promise<{ error?: string }> {
  const user = await requireStaff();
  const [item] = await sql<{ card_id: number; text: string; board_id: number }>`
    UPDATE project_checklist_items i SET is_done = ${done}, done_by = ${done ? user.id : null}, done_at = ${done ? new Date() : null}
    FROM project_cards c WHERE i.id = ${itemId} AND c.id = i.card_id RETURNING i.card_id, i.text, c.board_id`;
  if (!item) return { error: 'Item not found.' };
  await logEvent(item.card_id, user.id, `${done ? 'completed' : 'reopened'} “${item.text}”`);
  revalidateCard(item.board_id, item.card_id);
  return {};
}

export async function deleteChecklistItem(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireStaff();
  const id = num(fd, 'item_id');
  const [item] = id ? await sql<{ card_id: number }>`DELETE FROM project_checklist_items WHERE id = ${id} RETURNING card_id` : [];
  if (!item) return { error: 'Item not found.' };
  const boardId = await cardBoard(item.card_id);
  if (boardId) revalidateCard(boardId, item.card_id);
  return { ok: 'Removed.' };
}
