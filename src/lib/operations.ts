import 'server-only';
import { query, sql } from '@/lib/db';
import { addDaysISO, todayISO } from '@/lib/format';
import { periodStart, type Frequency, type Priority } from '@/lib/ops-shared';

// ---------- Checklists ----------

export interface TaskTemplate {
  id: number;
  title: string;
  area: string;
  frequency: Frequency;
  weekday: number | null;
  due_time: string | null;
  instructions: string | null;
  assigned_user_id: number | null;
  assigned_name: string | null;
  requires_reading: boolean;
  reading_unit: string | null;
  reading_min: number | null;
  reading_max: number | null;
  sort_order: number;
  is_active: boolean;
}

export interface ChecklistRow extends TaskTemplate {
  period_date: string;
  completion_id: number | null;
  completed_at: string | null;
  completed_by_name: string | null;
  reading: number | null;
  out_of_range: boolean | null;
  note: string | null;
}

export async function getTaskTemplates(includeInactive = false): Promise<TaskTemplate[]> {
  return query<TaskTemplate>(
    `SELECT t.*, u.name AS assigned_name FROM ops_task_templates t LEFT JOIN users u ON u.id = t.assigned_user_id
     ${includeInactive ? '' : 'WHERE t.is_active'} ORDER BY t.is_active DESC, t.frequency, t.due_time NULLS LAST, t.area, t.sort_order, t.id`
  );
}

/** Every active task with its tick (if any) for the period that contains `date`. */
export async function getChecklist(date: string): Promise<ChecklistRow[]> {
  const periods = { daily: periodStart(date, 'daily'), weekly: periodStart(date, 'weekly'), monthly: periodStart(date, 'monthly') };
  return query<ChecklistRow>(
    `SELECT t.*, u.name AS assigned_name,
       CASE t.frequency WHEN 'daily' THEN $1::date WHEN 'weekly' THEN $2::date ELSE $3::date END::text AS period_date,
       c.id AS completion_id, c.completed_at, cu.name AS completed_by_name, c.reading, c.out_of_range, c.note
     FROM ops_task_templates t
     LEFT JOIN users u ON u.id = t.assigned_user_id
     LEFT JOIN ops_task_completions c ON c.template_id = t.id
       AND c.period_date = CASE t.frequency WHEN 'daily' THEN $1::date WHEN 'weekly' THEN $2::date ELSE $3::date END
     LEFT JOIN users cu ON cu.id = c.completed_by
     WHERE t.is_active AND (t.created_at AT TIME ZONE 'Asia/Makassar')::date <= $1::date
     ORDER BY t.due_time NULLS LAST, t.area, t.sort_order, t.id`,
    [periods.daily, periods.weekly, periods.monthly]
  );
}

/** Completion rate and out-of-range readings for the last `days` days (daily tasks only). */
export async function getChecklistHistory(days = 14) {
  const from = addDaysISO(todayISO(), -(days - 1));
  return sql<{ day: string; due: number; done: number; flagged: number }>`
    SELECT d::date::text AS day,
      (SELECT COUNT(*)::int FROM ops_task_templates t WHERE t.frequency = 'daily' AND t.is_active AND (t.created_at AT TIME ZONE 'Asia/Makassar')::date <= d::date) AS due,
      (SELECT COUNT(*)::int FROM ops_task_completions c JOIN ops_task_templates t ON t.id = c.template_id
         WHERE t.frequency = 'daily' AND c.period_date = d::date) AS done,
      (SELECT COUNT(*)::int FROM ops_task_completions c WHERE c.period_date = d::date AND c.out_of_range) AS flagged
    FROM generate_series(${from}::date, ${todayISO()}::date, interval '1 day') d
    ORDER BY d DESC`;
}

export async function getReadingLog(templateId: number, limit = 60) {
  return sql<{ period_date: string; reading: number | null; out_of_range: boolean; note: string | null; completed_at: string; name: string }>`
    SELECT c.period_date::text, c.reading, c.out_of_range, c.note, c.completed_at, u.name
    FROM ops_task_completions c JOIN users u ON u.id = c.completed_by
    WHERE c.template_id = ${templateId} ORDER BY c.period_date DESC LIMIT ${limit}`;
}

// ---------- Inventory ----------

export interface Supplier {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface InventoryItem {
  id: number;
  name: string;
  sku: string | null;
  category: string;
  unit: string;
  location: string | null;
  reorder_level: number;
  reorder_quantity: number;
  supplier_id: number | null;
  supplier_name: string | null;
  unit_cost: number;
  track_expiry: boolean;
  notes: string | null;
  is_active: boolean;
  quantity: number;
  next_expiry: string | null;
  on_order: number;
}

const ITEM_SELECT = `
  SELECT i.*, i.reorder_level::float AS reorder_level, i.reorder_quantity::float AS reorder_quantity, s.name AS supplier_name,
    COALESCE((SELECT SUM(b.quantity) FROM inventory_batches b WHERE b.item_id = i.id), 0)::float AS quantity,
    (SELECT MIN(b.expiry_date)::text FROM inventory_batches b WHERE b.item_id = i.id AND b.quantity > 0) AS next_expiry,
    COALESCE((SELECT SUM(l.quantity - l.received_quantity) FROM purchase_order_lines l JOIN purchase_orders o ON o.id = l.order_id
      WHERE l.item_id = i.id AND o.status IN ('ordered', 'partially_received')), 0)::float AS on_order
  FROM inventory_items i LEFT JOIN suppliers s ON s.id = i.supplier_id`;

export async function listInventory(includeInactive = false): Promise<InventoryItem[]> {
  return query<InventoryItem>(`${ITEM_SELECT} ${includeInactive ? '' : 'WHERE i.is_active'} ORDER BY i.category, i.name`);
}

export async function getInventoryItem(id: number): Promise<InventoryItem | null> {
  return (await query<InventoryItem>(`${ITEM_SELECT} WHERE i.id = $1`, [id]))[0] ?? null;
}

export interface Batch {
  id: number;
  item_id: number;
  batch_no: string | null;
  expiry_date: string | null;
  quantity: number;
  received_at: string;
}

export async function getBatches(itemId: number): Promise<Batch[]> {
  return sql<Batch>`SELECT id, item_id, batch_no, expiry_date::text, quantity::float AS quantity, received_at FROM inventory_batches
    WHERE item_id = ${itemId} AND quantity > 0 ORDER BY expiry_date NULLS LAST, received_at`;
}

export async function getMovements(itemId: number, limit = 100) {
  return sql<{ id: number; kind: string; quantity: number; reason: string | null; created_at: string; user_name: string | null; batch_no: string | null; expiry_date: string | null; purchase_order_id: number | null }>`
    SELECT m.id, m.kind, m.quantity::float AS quantity, m.reason, m.created_at, u.name AS user_name, b.batch_no, b.expiry_date::text, m.purchase_order_id
    FROM inventory_movements m LEFT JOIN users u ON u.id = m.user_id LEFT JOIN inventory_batches b ON b.id = m.batch_id
    WHERE m.item_id = ${itemId} ORDER BY m.created_at DESC, m.id DESC LIMIT ${limit}`;
}

/** Batches still in stock that expire within `days` days (or already have). */
export async function getExpiringBatches(days = 60) {
  return sql<{ batch_id: number; item_id: number; name: string; unit: string; batch_no: string | null; expiry_date: string; quantity: number }>`
    SELECT b.id AS batch_id, i.id AS item_id, i.name, i.unit, b.batch_no, b.expiry_date::text, b.quantity::float AS quantity
    FROM inventory_batches b JOIN inventory_items i ON i.id = b.item_id
    WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date <= ${addDaysISO(todayISO(), days)}::date AND i.is_active
    ORDER BY b.expiry_date`;
}

export async function getSuppliers(includeInactive = false): Promise<Supplier[]> {
  return includeInactive
    ? sql<Supplier>`SELECT * FROM suppliers ORDER BY is_active DESC, name`
    : sql<Supplier>`SELECT * FROM suppliers WHERE is_active ORDER BY name`;
}

export const INVENTORY_CATEGORIES = ['Medicines', 'Consumables', 'Wound care', 'IV & injections', 'Point-of-care tests', 'PPE & cleaning', 'Office & reception', 'Equipment parts'];

export type PoStatus = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  partially_received: 'Part received',
  received: 'Received',
  cancelled: 'Cancelled',
};

export interface PurchaseOrder {
  id: number;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_email: string | null;
  supplier_phone: string | null;
  status: PoStatus;
  ordered_at: string | null;
  expected_date: string | null;
  received_at: string | null;
  notes: string | null;
  bill_id: number | null;
  created_by_name: string | null;
  created_at: string;
  line_count: number;
  total: number;
}

const PO_SELECT = `
  SELECT o.*, o.expected_date::text AS expected_date, s.name AS supplier_name, s.email AS supplier_email, s.phone AS supplier_phone, u.name AS created_by_name,
    (SELECT COUNT(*)::int FROM purchase_order_lines l WHERE l.order_id = o.id) AS line_count,
    COALESCE((SELECT SUM(l.quantity * l.unit_cost) FROM purchase_order_lines l WHERE l.order_id = o.id), 0)::float AS total
  FROM purchase_orders o LEFT JOIN suppliers s ON s.id = o.supplier_id LEFT JOIN users u ON u.id = o.created_by`;

export async function listPurchaseOrders(open = true): Promise<PurchaseOrder[]> {
  return query<PurchaseOrder>(
    `${PO_SELECT} ${open ? `WHERE o.status IN ('draft', 'ordered', 'partially_received')` : ''} ORDER BY o.created_at DESC LIMIT 100`
  );
}

export async function getPurchaseOrder(id: number): Promise<PurchaseOrder | null> {
  return (await query<PurchaseOrder>(`${PO_SELECT} WHERE o.id = $1`, [id]))[0] ?? null;
}

export async function getPurchaseOrderLines(orderId: number) {
  return sql<{ id: number; item_id: number; name: string; unit: string; track_expiry: boolean; quantity: number; received_quantity: number; unit_cost: number }>`
    SELECT l.id, l.item_id, i.name, i.unit, i.track_expiry, l.quantity::float AS quantity, l.received_quantity::float AS received_quantity, l.unit_cost::float AS unit_cost
    FROM purchase_order_lines l JOIN inventory_items i ON i.id = l.item_id WHERE l.order_id = ${orderId} ORDER BY i.name`;
}

// ---------- Projects ----------

export interface Board {
  id: number;
  title: string;
  description: string | null;
  start_date: string | null;
  is_archived: boolean;
  created_at: string;
  card_count: number;
  done_count: number;
  overdue_count: number;
}

export interface BoardList {
  id: number;
  board_id: number;
  title: string;
  position: number;
  is_done: boolean;
}

export interface CardSummary {
  id: number;
  board_id: number;
  board_title: string;
  list_id: number;
  list_title: string;
  list_is_done: boolean;
  title: string;
  position: number;
  start_date: string | null;
  due_date: string | null;
  priority: Priority;
  labels: string[];
  completed_at: string | null;
  assignees: { id: number; name: string }[];
  checklist_total: number;
  checklist_done: number;
  comment_count: number;
}

export interface StaffMember {
  id: number;
  name: string;
}

export async function getStaffMembers(): Promise<StaffMember[]> {
  return sql<StaffMember>`SELECT id, name FROM users WHERE role <> 'patient' AND is_active ORDER BY name`;
}

export async function listBoards(includeArchived = false): Promise<Board[]> {
  return query<Board>(
    `SELECT b.*, b.start_date::text AS start_date,
       (SELECT COUNT(*)::int FROM project_cards c WHERE c.board_id = b.id AND NOT c.is_archived) AS card_count,
       (SELECT COUNT(*)::int FROM project_cards c JOIN project_lists l ON l.id = c.list_id WHERE c.board_id = b.id AND NOT c.is_archived AND l.is_done) AS done_count,
       (SELECT COUNT(*)::int FROM project_cards c JOIN project_lists l ON l.id = c.list_id
          WHERE c.board_id = b.id AND NOT c.is_archived AND NOT l.is_done AND c.due_date < $1::date) AS overdue_count
     FROM project_boards b ${includeArchived ? '' : 'WHERE NOT b.is_archived'} ORDER BY b.is_archived, b.created_at DESC`,
    [todayISO()]
  );
}

export async function getBoard(id: number) {
  const [board] = await sql<Board>`SELECT *, start_date::text AS start_date, 0 AS card_count, 0 AS done_count, 0 AS overdue_count FROM project_boards WHERE id = ${id}`;
  if (!board) return null;
  const lists = await sql<BoardList>`SELECT * FROM project_lists WHERE board_id = ${id} ORDER BY position, id`;
  return { board, lists };
}

const CARD_SELECT = `
  SELECT c.id, c.board_id, b.title AS board_title, c.list_id, l.title AS list_title, l.is_done AS list_is_done, c.title, c.position,
    c.start_date::text AS start_date, c.due_date::text AS due_date, c.priority, c.labels, c.completed_at,
    COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name) ORDER BY u.name)
      FROM project_card_assignees a JOIN users u ON u.id = a.user_id WHERE a.card_id = c.id), '[]') AS assignees,
    (SELECT COUNT(*)::int FROM project_checklist_items i WHERE i.card_id = c.id) AS checklist_total,
    (SELECT COUNT(*)::int FROM project_checklist_items i WHERE i.card_id = c.id AND i.is_done) AS checklist_done,
    (SELECT COUNT(*)::int FROM project_card_activity a WHERE a.card_id = c.id AND a.kind = 'comment') AS comment_count
  FROM project_cards c JOIN project_lists l ON l.id = c.list_id JOIN project_boards b ON b.id = c.board_id`;

export async function getBoardCards(boardId: number): Promise<CardSummary[]> {
  return query<CardSummary>(`${CARD_SELECT} WHERE c.board_id = $1 AND NOT c.is_archived ORDER BY l.position, c.position, c.id`, [boardId]);
}

/** Open cards assigned to a person (directly or through a checklist item), across all boards. */
export async function getMyCards(userId: number): Promise<CardSummary[]> {
  return query<CardSummary>(
    `${CARD_SELECT} WHERE NOT c.is_archived AND NOT b.is_archived AND NOT l.is_done
       AND (EXISTS (SELECT 1 FROM project_card_assignees a WHERE a.card_id = c.id AND a.user_id = $1)
         OR EXISTS (SELECT 1 FROM project_checklist_items i WHERE i.card_id = c.id AND i.assignee_id = $1 AND NOT i.is_done))
     ORDER BY c.due_date NULLS LAST, c.id`,
    [userId]
  );
}

export async function getCardSummary(id: number): Promise<CardSummary | null> {
  return (await query<CardSummary>(`${CARD_SELECT} WHERE c.id = $1`, [id]))[0] ?? null;
}

export async function getCardDetail(id: number) {
  const card = await getCardSummary(id);
  if (!card) return null;
  const [[extra], checklist, activity] = await Promise.all([
    sql<{ description: string | null; is_archived: boolean; created_at: string; created_by_name: string | null }>`
      SELECT c.description, c.is_archived, c.created_at, u.name AS created_by_name FROM project_cards c LEFT JOIN users u ON u.id = c.created_by WHERE c.id = ${id}`,
    sql<{ id: number; text: string; is_done: boolean; done_at: string | null; done_by_name: string | null; assignee_id: number | null; assignee_name: string | null; due_date: string | null }>`
      SELECT i.id, i.text, i.is_done, i.done_at, d.name AS done_by_name, i.assignee_id, a.name AS assignee_name, i.due_date::text AS due_date
      FROM project_checklist_items i LEFT JOIN users d ON d.id = i.done_by LEFT JOIN users a ON a.id = i.assignee_id
      WHERE i.card_id = ${id} ORDER BY i.position, i.id`,
    sql<{ id: number; kind: 'comment' | 'event'; body: string; created_at: string; user_id: number | null; user_name: string | null }>`
      SELECT a.id, a.kind, a.body, a.created_at, a.user_id, u.name AS user_name FROM project_card_activity a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.card_id = ${id} ORDER BY a.created_at DESC, a.id DESC`,
  ]);
  return { card: { ...card, ...extra }, checklist, activity };
}

/** Cards due in the next `days` days or overdue, for the operations overview. */
export async function getUpcomingCards(days = 14): Promise<CardSummary[]> {
  return query<CardSummary>(
    `${CARD_SELECT} WHERE NOT c.is_archived AND NOT b.is_archived AND NOT l.is_done AND c.due_date <= $1::date ORDER BY c.due_date, c.id LIMIT 30`,
    [addDaysISO(todayISO(), days)]
  );
}
