import 'server-only';
import { query, sql } from '@/lib/db';

export interface BudgetCategory {
  id: number;
  name: string;
  kind: 'expense' | 'revenue';
  monthly_budget: number;
  is_archived: boolean;
  sort_order: number;
}

export async function getCategories(includeArchived = false): Promise<BudgetCategory[]> {
  return sql<BudgetCategory>`SELECT * FROM budget_categories WHERE (${includeArchived} OR NOT is_archived) ORDER BY kind DESC, sort_order, name`;
}

export function monthRange(month: string): { start: string; end: string } {
  // month = "YYYY-MM"; end is exclusive
  const [y, m] = month.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, end: next };
}

/** Revenue category for a payment: its own category if set, otherwise insurer payments count as
 * insurance reimbursements and everything else against an invoice as consultations. */
const REVENUE_CATEGORY_SQL = `
  COALESCE(p.category_id,
    CASE WHEN p.payer_type = 'insurer'
      THEN (SELECT id FROM budget_categories WHERE name = 'Insurance reimbursements')
      ELSE (SELECT id FROM budget_categories WHERE name = 'Consultations & treatments') END)`;

export interface CategoryActual extends BudgetCategory {
  actual: number;
}

export async function getMonthActuals(month: string): Promise<CategoryActual[]> {
  const { start, end } = monthRange(month);
  return query<CategoryActual>(
    `SELECT c.*,
       CASE WHEN c.kind = 'expense'
         THEN COALESCE((SELECT SUM(b.amount) FROM bills b WHERE b.category_id = c.id AND b.status = 'paid' AND b.paid_at >= $1 AND b.paid_at < $2), 0)
         ELSE COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.status = 'confirmed' AND p.paid_at >= $1 AND p.paid_at < $2 AND ${REVENUE_CATEGORY_SQL} = c.id), 0)
       END AS actual
     FROM budget_categories c WHERE NOT c.is_archived
     ORDER BY c.kind DESC, c.sort_order, c.name`,
    [start, end]
  );
}

export async function getCashPosition() {
  return (await query<{ opening: number; opening_date: string; received: number; paid_out: number; cash: number; uncategorised_bills: number }>(
    `SELECT s.opening_cash_balance AS opening, s.opening_cash_date AS opening_date,
       COALESCE((SELECT SUM(amount) FROM payments WHERE status = 'confirmed' AND paid_at >= s.opening_cash_date), 0) AS received,
       COALESCE((SELECT SUM(amount) FROM bills WHERE status = 'paid' AND paid_at >= s.opening_cash_date), 0) AS paid_out,
       s.opening_cash_balance
         + COALESCE((SELECT SUM(amount) FROM payments WHERE status = 'confirmed' AND paid_at >= s.opening_cash_date), 0)
         - COALESCE((SELECT SUM(amount) FROM bills WHERE status = 'paid' AND paid_at >= s.opening_cash_date), 0) AS cash,
       (SELECT COUNT(*)::int FROM bills WHERE status = 'paid' AND category_id IS NULL) AS uncategorised_bills
     FROM clinic_settings s WHERE s.id = 1`
  ))[0];
}

/** Revenue vs expenses for the last N months, oldest first. */
export async function getMonthlyTrend(months: number): Promise<{ month: string; revenue: number; expenses: number }[]> {
  return query(
    `WITH m AS (
       SELECT to_char(d, 'YYYY-MM') AS month, d::date AS start, (d + interval '1 month')::date AS finish
       FROM generate_series(date_trunc('month', CURRENT_DATE) - make_interval(months => $1 - 1), date_trunc('month', CURRENT_DATE), interval '1 month') d
     )
     SELECT m.month,
       COALESCE((SELECT SUM(amount) FROM payments WHERE status = 'confirmed' AND paid_at >= m.start AND paid_at < m.finish), 0)::bigint AS revenue,
       COALESCE((SELECT SUM(amount) FROM bills WHERE status = 'paid' AND paid_at >= m.start AND paid_at < m.finish), 0)::bigint AS expenses
     FROM m ORDER BY m.month`,
    [months]
  );
}

export async function updateCategoryBudget(id: number, newValue: number, userId: number): Promise<void> {
  const cat = (await sql<BudgetCategory>`SELECT * FROM budget_categories WHERE id = ${id}`)[0];
  if (!cat) throw new Error('Category not found.');
  if (cat.monthly_budget === newValue) return;
  await sql`INSERT INTO budget_category_history (category_id, old_value, new_value, changed_by) VALUES (${id}, ${cat.monthly_budget}, ${newValue}, ${userId})`;
  await sql`UPDATE budget_categories SET monthly_budget = ${newValue} WHERE id = ${id}`;
}

export async function getCategoryHistory(limit = 30) {
  return sql<{ id: number; category_name: string; old_value: number; new_value: number; changed_by_name: string | null; changed_at: string }>`
    SELECT h.id, c.name AS category_name, h.old_value, h.new_value, u.name AS changed_by_name, h.changed_at
    FROM budget_category_history h JOIN budget_categories c ON c.id = h.category_id LEFT JOIN users u ON u.id = h.changed_by
    ORDER BY h.changed_at DESC LIMIT ${limit}
  `;
}

// ---------- Bills (money out) ----------

export interface BillRow {
  id: number;
  vendor: string;
  bill_reference: string | null;
  category_id: number | null;
  category_name: string | null;
  issue_date: string;
  due_date: string | null;
  amount: number;
  status: 'unpaid' | 'paid' | 'void';
  paid_at: string | null;
  payment_method: string | null;
  file_id: number | null;
  file_name: string | null;
  bank_transaction_id: number | null;
  notes: string | null;
  days_overdue: number;
}

export async function listBills(filter: string = 'unpaid'): Promise<BillRow[]> {
  const where =
    filter === 'unpaid' ? `b.status = 'unpaid'` :
    filter === 'overdue' ? `b.status = 'unpaid' AND b.due_date < CURRENT_DATE` :
    filter === 'paid' ? `b.status = 'paid'` : `true`;
  return query<BillRow>(
    `SELECT b.*, c.name AS category_name, f.file_name,
       CASE WHEN b.status = 'unpaid' AND b.due_date IS NOT NULL THEN GREATEST(0, CURRENT_DATE - b.due_date) ELSE 0 END AS days_overdue
     FROM bills b LEFT JOIN budget_categories c ON c.id = b.category_id LEFT JOIN files f ON f.id = b.file_id
     WHERE ${where}
     ORDER BY CASE WHEN b.status = 'unpaid' THEN 0 ELSE 1 END, COALESCE(b.due_date, b.issue_date), b.id DESC LIMIT 300`
  );
}

export async function getBill(id: number): Promise<BillRow | null> {
  return (await query<BillRow>(
    `SELECT b.*, c.name AS category_name, f.file_name, 0 AS days_overdue
     FROM bills b LEFT JOIN budget_categories c ON c.id = b.category_id LEFT JOIN files f ON f.id = b.file_id WHERE b.id = $1`,
    [id]
  ))[0] ?? null;
}

export async function markBillPaid(id: number, paidAt: string, method: string, bankTransactionId: number | null = null): Promise<void> {
  const bill = await getBill(id);
  if (!bill) throw new Error('Bill not found.');
  if (bill.status !== 'unpaid') throw new Error('This bill isn’t awaiting payment.');
  await sql`UPDATE bills SET status = 'paid', paid_at = ${paidAt}, payment_method = ${method}, bank_transaction_id = ${bankTransactionId} WHERE id = ${id}`;
}

// ---------- Transaction log ----------

export interface LedgerRow {
  kind: 'in' | 'out';
  id: number;
  date: string;
  description: string;
  category: string | null;
  amount: number;
  method: string | null;
  file_id: number | null;
  link: string;
}

export async function getLedger(from: string, to: string, q: string): Promise<LedgerRow[]> {
  return query<LedgerRow>(
    `SELECT * FROM (
       SELECT 'in' AS kind, p.id, p.paid_at AS date,
         COALESCE(i.invoice_number || ' · ', '') || COALESCE(f.account_name, '') || CASE WHEN p.payer_type = 'insurer' THEN ' (insurer)' ELSE '' END
           || COALESCE(' · ' || p.notes, '') AS description,
         c.name AS category, p.amount, p.method, p.proof_file_id AS file_id,
         CASE WHEN p.invoice_id IS NULL THEN '/dashboard/budget/transactions' ELSE '/dashboard/invoices/' || p.invoice_id END AS link
       FROM payments p
       LEFT JOIN invoices i ON i.id = p.invoice_id LEFT JOIN families f ON f.id = p.family_id
       LEFT JOIN budget_categories c ON c.id = ${REVENUE_CATEGORY_SQL}
       WHERE p.status = 'confirmed'
       UNION ALL
       SELECT 'out', b.id, b.paid_at, b.vendor || COALESCE(' · ' || b.bill_reference, ''), c.name, b.amount, b.payment_method, b.file_id,
         '/dashboard/bills/' || b.id
       FROM bills b LEFT JOIN budget_categories c ON c.id = b.category_id WHERE b.status = 'paid'
     ) t
     WHERE t.date >= $1 AND t.date <= $2 AND ($3 = '' OR t.description ILIKE '%' || $3 || '%' OR t.category ILIKE '%' || $3 || '%')
     ORDER BY t.date DESC, t.id DESC LIMIT 500`,
    [from, to, q]
  );
}
