import 'server-only';
import { query, sql, transaction } from '@/lib/db';
import { addDaysISO, todayISO } from '@/lib/format';

import {
  computeInvoiceTotals,
  type ClaimStatus,
  type InvoiceInput,
  type InvoiceStatus,
  type PaymentMethod,
} from '@/lib/billing-shared';

export * from '@/lib/billing-shared';

export interface InvoiceRow {
  id: number;
  invoice_number: string;
  family_id: number;
  account_name: string;
  billed_to_name: string;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  insurer_id: number | null;
  insurer_name: string | null;
  insurer_portion: number;
  patient_portion: number;
  notes: string | null;
  void_reason: string | null;
  sent_at: string | null;
  created_at: string;
  patient_paid: number;
  insurer_paid: number;
  patient_balance: number;
  insurer_balance: number;
  days_overdue: number;
  pending_review: number;
}

const INVOICE_SELECT = `
  SELECT i.*, f.account_name, ins.name AS insurer_name,
    COALESCE(pp.patient_paid, 0) AS patient_paid,
    COALESCE(pp.insurer_paid, 0) AS insurer_paid,
    i.patient_portion - COALESCE(pp.patient_paid, 0) AS patient_balance,
    i.insurer_portion - COALESCE(pp.insurer_paid, 0) AS insurer_balance,
    CASE WHEN i.status IN ('issued', 'partially_paid') THEN GREATEST(0, CURRENT_DATE - i.due_date) ELSE 0 END AS days_overdue,
    COALESCE(pp.pending_review, 0) AS pending_review
  FROM invoices i
  JOIN families f ON f.id = i.family_id
  LEFT JOIN insurers ins ON ins.id = i.insurer_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(amount) FILTER (WHERE status = 'confirmed' AND payer_type = 'patient') AS patient_paid,
      SUM(amount) FILTER (WHERE status = 'confirmed' AND payer_type = 'insurer') AS insurer_paid,
      COUNT(*) FILTER (WHERE status = 'pending_review') AS pending_review
    FROM payments WHERE invoice_id = i.id
  ) pp ON true`;

export async function listInvoices(filters: { familyId?: number; status?: string; q?: string } = {}): Promise<InvoiceRow[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filters.familyId) {
    values.push(filters.familyId);
    where.push(`i.family_id = $${values.length}`);
  }
  if (filters.status === 'outstanding') where.push(`i.status IN ('issued', 'partially_paid')`);
  else if (filters.status === 'overdue') where.push(`i.status IN ('issued', 'partially_paid') AND i.due_date < CURRENT_DATE`);
  else if (filters.status === 'insurance') where.push(`i.insurer_id IS NOT NULL AND i.status NOT IN ('draft', 'void')`);
  else if (filters.status === 'review') where.push(`EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id AND p.status = 'pending_review')`);
  else if (filters.status && filters.status !== 'all') {
    values.push(filters.status);
    where.push(`i.status = $${values.length}`);
  }
  if (filters.q) {
    values.push(`%${filters.q}%`);
    where.push(`(i.invoice_number ILIKE $${values.length} OR i.billed_to_name ILIKE $${values.length} OR f.account_name ILIKE $${values.length})`);
  }
  return query<InvoiceRow>(
    `${INVOICE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY i.issue_date DESC, i.id DESC LIMIT 300`,
    values
  );
}

export async function getInvoice(id: number): Promise<InvoiceRow | null> {
  return (await query<InvoiceRow>(`${INVOICE_SELECT} WHERE i.id = $1`, [id]))[0] ?? null;
}

export interface InvoiceItemRow {
  id: number;
  patient_id: number | null;
  patient_name: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  insurance_covered: boolean;
}

export async function getInvoiceItems(invoiceId: number): Promise<InvoiceItemRow[]> {
  return sql<InvoiceItemRow>`
    SELECT it.*, CASE WHEN pt.id IS NULL THEN NULL ELSE pt.first_name || ' ' || pt.last_name END AS patient_name
    FROM invoice_items it LEFT JOIN patients pt ON pt.id = it.patient_id
    WHERE it.invoice_id = ${invoiceId} ORDER BY it.sort_order, it.id
  `;
}

export async function getClinicSettings() {
  return (await sql<{
    legal_name: string;
    address: string;
    email: string | null;
    phone: string | null;
    bank_name: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_swift: string | null;
    invoice_due_days: number;
    tax_rate_percent: number;
    invoice_footer_note: string | null;
    budget_pin_hash: string | null;
    opening_cash_balance: number;
    opening_cash_date: string;
  }>`SELECT * FROM clinic_settings WHERE id = 1`)[0];
}

function validateInvoiceInput(input: InvoiceInput) {
  if (!input.billedToName.trim()) throw new Error('Enter who the invoice is billed to.');
  if (input.items.length === 0) throw new Error('Add at least one line item.');
  for (const it of input.items) {
    if (!it.description.trim()) throw new Error('Every line item needs a description.');
    if (!(it.quantity >= 0) || !(it.unitPrice >= 0)) throw new Error('Quantities and prices must be zero or more.');
  }
  if (input.dueDate < input.issueDate) throw new Error('The due date can’t be before the issue date.');
}

export async function createInvoice(input: InvoiceInput, userId: number, issue: boolean): Promise<number> {
  validateInvoiceInput(input);
  const settings = await getClinicSettings();
  const t = computeInvoiceTotals(input.items, input.discount, settings.tax_rate_percent, !!input.insurerId);
  return transaction(async (q) => {
    const [{ n }] = await q<{ n: number }>`SELECT nextval('invoice_number_seq') AS n`;
    const number = `EMC-${String(n).padStart(5, '0')}`;
    const [{ id }] = await q<{ id: number }>`
      INSERT INTO invoices (invoice_number, family_id, billed_to_name, issue_date, due_date, status, subtotal, discount, tax, total,
                            insurer_id, insurer_portion, patient_portion, notes, created_by)
      VALUES (${number}, ${input.familyId}, ${input.billedToName.trim()}, ${input.issueDate}, ${input.dueDate}, ${issue ? 'issued' : 'draft'},
              ${t.subtotal}, ${t.discount}, ${t.tax}, ${t.total}, ${input.insurerId}, ${t.insurerPortion}, ${t.patientPortion}, ${input.notes}, ${userId})
      RETURNING id`;
    for (const [idx, l] of t.lines.entries()) {
      await q`INSERT INTO invoice_items (invoice_id, patient_id, description, quantity, unit_price, amount, insurance_covered, sort_order)
              VALUES (${id}, ${l.patientId}, ${l.description.trim()}, ${l.quantity}, ${l.unitPrice}, ${l.amount}, ${!!input.insurerId && l.insuranceCovered}, ${idx})`;
    }
    return id;
  });
}

export async function updateInvoice(id: number, input: InvoiceInput): Promise<void> {
  validateInvoiceInput(input);
  const existing = await getInvoice(id);
  if (!existing) throw new Error('Invoice not found.');
  if (existing.status === 'void') throw new Error('A void invoice can’t be edited.');
  const settings = await getClinicSettings();
  const t = computeInvoiceTotals(input.items, input.discount, settings.tax_rate_percent, !!input.insurerId);
  if (t.patientPortion < existing.patient_paid || t.insurerPortion < existing.insurer_paid) {
    throw new Error('The new totals are less than what has already been paid. Refund or remove a payment first.');
  }
  await transaction(async (q) => {
    await q`UPDATE invoices SET billed_to_name = ${input.billedToName.trim()}, issue_date = ${input.issueDate}, due_date = ${input.dueDate},
              subtotal = ${t.subtotal}, discount = ${t.discount}, tax = ${t.tax}, total = ${t.total}, insurer_id = ${input.insurerId},
              insurer_portion = ${t.insurerPortion}, patient_portion = ${t.patientPortion}, notes = ${input.notes}, updated_at = now()
            WHERE id = ${id}`;
    await q`DELETE FROM invoice_items WHERE invoice_id = ${id}`;
    for (const [idx, l] of t.lines.entries()) {
      await q`INSERT INTO invoice_items (invoice_id, patient_id, description, quantity, unit_price, amount, insurance_covered, sort_order)
              VALUES (${id}, ${l.patientId}, ${l.description.trim()}, ${l.quantity}, ${l.unitPrice}, ${l.amount}, ${!!input.insurerId && l.insuranceCovered}, ${idx})`;
    }
  });
  await refreshInvoiceStatus(id);
}

/** Recomputes issued / partially_paid / paid from confirmed payments. Draft and void are left alone. */
export async function refreshInvoiceStatus(invoiceId: number): Promise<void> {
  await sql`
    UPDATE invoices i SET status = CASE
        WHEN paid.total_paid >= i.total THEN 'paid'
        WHEN paid.total_paid > 0 THEN 'partially_paid'
        ELSE 'issued' END,
      updated_at = now()
    FROM (SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE invoice_id = ${invoiceId} AND status = 'confirmed') paid
    WHERE i.id = ${invoiceId} AND i.status NOT IN ('draft', 'void')
  `;
}

export async function issueInvoice(id: number): Promise<void> {
  await sql`UPDATE invoices SET status = 'issued', updated_at = now() WHERE id = ${id} AND status = 'draft'`;
  await refreshInvoiceStatus(id);
}

export async function voidInvoice(id: number, reason: string): Promise<void> {
  const inv = await getInvoice(id);
  if (!inv) throw new Error('Invoice not found.');
  if (inv.patient_paid + inv.insurer_paid > 0) throw new Error('This invoice has payments recorded. Remove them before voiding.');
  await sql`UPDATE invoices SET status = 'void', void_reason = ${reason || null}, updated_at = now() WHERE id = ${id}`;
}

export async function deleteDraftInvoice(id: number): Promise<void> {
  const inv = await getInvoice(id);
  if (!inv || inv.status !== 'draft') throw new Error('Only draft invoices can be deleted.');
  await sql`DELETE FROM invoices WHERE id = ${id}`;
}

export interface PaymentRow {
  id: number;
  family_id: number | null;
  account_name: string | null;
  invoice_id: number | null;
  invoice_number: string | null;
  claim_id: number | null;
  payer_type: 'patient' | 'insurer' | 'other';
  amount: number;
  method: PaymentMethod;
  paid_at: string;
  reference: string | null;
  proof_file_id: number | null;
  bank_transaction_id: number | null;
  category_id: number | null;
  category_name: string | null;
  status: 'confirmed' | 'pending_review' | 'rejected';
  submitted_by_patient: boolean;
  notes: string | null;
  created_at: string;
}

export async function listPayments(filters: { familyId?: number; invoiceId?: number; status?: string; limit?: number } = {}): Promise<PaymentRow[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filters.familyId) { values.push(filters.familyId); where.push(`p.family_id = $${values.length}`); }
  if (filters.invoiceId) { values.push(filters.invoiceId); where.push(`p.invoice_id = $${values.length}`); }
  if (filters.status) { values.push(filters.status); where.push(`p.status = $${values.length}`); }
  values.push(filters.limit ?? 300);
  return query<PaymentRow>(
    `SELECT p.*, f.account_name, i.invoice_number, c.name AS category_name
     FROM payments p
     LEFT JOIN families f ON f.id = p.family_id
     LEFT JOIN invoices i ON i.id = p.invoice_id
     LEFT JOIN budget_categories c ON c.id = p.category_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY p.paid_at DESC, p.id DESC LIMIT $${values.length}`,
    values
  );
}

export interface RecordPaymentInput {
  invoiceId: number;
  payerType: 'patient' | 'insurer';
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  proofFileId?: number | null;
  bankTransactionId?: number | null;
  claimId?: number | null;
  status?: 'confirmed' | 'pending_review';
  submittedByPatient?: boolean;
}

export async function recordInvoicePayment(input: RecordPaymentInput, userId: number | null): Promise<number> {
  const inv = await getInvoice(input.invoiceId);
  if (!inv) throw new Error('Invoice not found.');
  if (inv.status === 'void' || inv.status === 'draft') throw new Error('Issue the invoice before recording a payment.');
  if (!(input.amount > 0)) throw new Error('Enter an amount greater than zero.');
  const outstanding = input.payerType === 'insurer' ? inv.insurer_balance : inv.patient_balance;
  if (input.amount > outstanding) {
    throw new Error(`That is more than the ${input.payerType === 'insurer' ? 'insurer' : 'patient'} still owes on this invoice.`);
  }
  const rows = await sql<{ id: number }>`
    INSERT INTO payments (family_id, invoice_id, claim_id, payer_type, amount, method, paid_at, reference, notes, proof_file_id,
                          bank_transaction_id, status, submitted_by_patient, recorded_by)
    VALUES (${inv.family_id}, ${inv.id}, ${input.claimId ?? null}, ${input.payerType}, ${input.amount}, ${input.method}, ${input.paidAt},
            ${input.reference}, ${input.notes}, ${input.proofFileId ?? null}, ${input.bankTransactionId ?? null},
            ${input.status ?? 'confirmed'}, ${input.submittedByPatient ?? false}, ${userId})
    RETURNING id`;
  await refreshInvoiceStatus(inv.id);
  if (input.payerType === 'insurer') await syncClaimPaid(inv.id);
  return rows[0].id;
}

export async function setPaymentStatus(paymentId: number, status: 'confirmed' | 'rejected'): Promise<void> {
  const p = (await sql<{ invoice_id: number | null; amount: number; payer_type: string }>`SELECT invoice_id, amount, payer_type FROM payments WHERE id = ${paymentId}`)[0];
  if (!p) throw new Error('Payment not found.');
  if (status === 'confirmed' && p.invoice_id) {
    const inv = await getInvoice(p.invoice_id);
    const outstanding = p.payer_type === 'insurer' ? inv!.insurer_balance : inv!.patient_balance;
    if (p.amount > outstanding) throw new Error('Confirming this would overpay the invoice.');
  }
  await sql`UPDATE payments SET status = ${status} WHERE id = ${paymentId}`;
  if (p.invoice_id) await refreshInvoiceStatus(p.invoice_id);
}

export async function deletePayment(paymentId: number): Promise<void> {
  const p = (await sql<{ invoice_id: number | null; bank_transaction_id: number | null }>`SELECT invoice_id, bank_transaction_id FROM payments WHERE id = ${paymentId}`)[0];
  if (!p) return;
  await sql`DELETE FROM payments WHERE id = ${paymentId}`;
  if (p.bank_transaction_id) await sql`UPDATE bank_transactions SET status = 'unmatched', matched_note = NULL WHERE id = ${p.bank_transaction_id}`;
  if (p.invoice_id) {
    await refreshInvoiceStatus(p.invoice_id);
    await syncClaimPaid(p.invoice_id);
  }
}

// ---------- Insurance claims ----------

export interface ClaimRow {
  id: number;
  invoice_id: number;
  invoice_number: string;
  family_id: number;
  insurer_id: number;
  insurer_name: string;
  patient_id: number | null;
  patient_name: string | null;
  claim_reference: string | null;
  policy_number: string | null;
  amount_claimed: number;
  amount_approved: number | null;
  status: ClaimStatus;
  submitted_at: string | null;
  decided_at: string | null;
  notes: string | null;
  insurer_paid: number;
  created_at: string;
}

const CLAIM_SELECT = `
  SELECT c.*, i.invoice_number, i.family_id, ins.name AS insurer_name,
    CASE WHEN pt.id IS NULL THEN NULL ELSE pt.first_name || ' ' || pt.last_name END AS patient_name,
    COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = c.invoice_id AND p.payer_type = 'insurer' AND p.status = 'confirmed'), 0) AS insurer_paid
  FROM insurance_claims c
  JOIN invoices i ON i.id = c.invoice_id
  JOIN insurers ins ON ins.id = c.insurer_id
  LEFT JOIN patients pt ON pt.id = c.patient_id`;

export async function listClaims(filters: { status?: string; familyId?: number; invoiceId?: number } = {}): Promise<ClaimRow[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filters.status === 'open') where.push(`c.status IN ('draft', 'submitted', 'approved', 'partially_approved')`);
  else if (filters.status && filters.status !== 'all') { values.push(filters.status); where.push(`c.status = $${values.length}`); }
  if (filters.familyId) { values.push(filters.familyId); where.push(`i.family_id = $${values.length}`); }
  if (filters.invoiceId) { values.push(filters.invoiceId); where.push(`c.invoice_id = $${values.length}`); }
  return query<ClaimRow>(`${CLAIM_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.created_at DESC LIMIT 300`, values);
}

export async function getClaim(id: number): Promise<ClaimRow | null> {
  return (await query<ClaimRow>(`${CLAIM_SELECT} WHERE c.id = $1`, [id]))[0] ?? null;
}

export async function createClaimForInvoice(invoiceId: number): Promise<number> {
  const inv = await getInvoice(invoiceId);
  if (!inv) throw new Error('Invoice not found.');
  if (!inv.insurer_id || inv.insurer_portion <= 0) throw new Error('This invoice has no insurance-covered amount.');
  const existing = await listClaims({ invoiceId });
  if (existing.some((c) => c.status !== 'rejected')) throw new Error('This invoice already has an open claim.');
  const items = await getInvoiceItems(invoiceId);
  const patientId = items.find((i) => i.insurance_covered && i.patient_id)?.patient_id ?? null;
  const policy = patientId
    ? (await sql<{ insurance_policy_number: string | null }>`SELECT insurance_policy_number FROM patients WHERE id = ${patientId}`)[0]?.insurance_policy_number ?? null
    : null;
  const rows = await sql<{ id: number }>`
    INSERT INTO insurance_claims (invoice_id, insurer_id, patient_id, policy_number, amount_claimed)
    VALUES (${invoiceId}, ${inv.insurer_id}, ${patientId}, ${policy}, ${inv.insurer_balance})
    RETURNING id`;
  return rows[0].id;
}

export async function updateClaim(id: number, input: { status: ClaimStatus; claimReference: string | null; policyNumber: string | null; amountApproved: number | null; submittedAt: string | null; decidedAt: string | null; notes: string | null }): Promise<void> {
  await sql`UPDATE insurance_claims SET status = ${input.status}, claim_reference = ${input.claimReference}, policy_number = ${input.policyNumber},
            amount_approved = ${input.amountApproved}, submitted_at = ${input.submittedAt}, decided_at = ${input.decidedAt},
            notes = ${input.notes}, updated_at = now() WHERE id = ${id}`;
}

/** After a rejection or partial approval, moves whatever the insurer won't pay onto the patient. */
export async function shiftInsurerShortfallToPatient(claimId: number): Promise<number> {
  const claim = await getClaim(claimId);
  if (!claim) throw new Error('Claim not found.');
  const inv = await getInvoice(claim.invoice_id);
  if (!inv) throw new Error('Invoice not found.');
  const insurerWillPay = claim.status === 'rejected' ? claim.insurer_paid : Math.max(claim.insurer_paid, claim.amount_approved ?? 0);
  const newInsurerPortion = Math.min(inv.insurer_portion, Math.max(insurerWillPay, inv.insurer_paid));
  const shortfall = inv.insurer_portion - newInsurerPortion;
  if (shortfall <= 0) throw new Error('There’s no shortfall to move.');
  await sql`UPDATE invoices SET insurer_portion = ${newInsurerPortion}, patient_portion = total - ${newInsurerPortion}, updated_at = now() WHERE id = ${inv.id}`;
  await sql`UPDATE insurance_claims SET notes = COALESCE(notes || E'\n', '') || ${`${todayISO()}: Rp ${shortfall.toLocaleString('id-ID')} moved to the patient's balance.`} WHERE id = ${claimId}`;
  await refreshInvoiceStatus(inv.id);
  return shortfall;
}

/** Marks a claim paid once the insurer's payments cover what was approved (or claimed). */
async function syncClaimPaid(invoiceId: number): Promise<void> {
  const claims = await listClaims({ invoiceId });
  for (const c of claims) {
    if (c.status === 'rejected' || c.status === 'draft') continue;
    const target = c.amount_approved ?? c.amount_claimed;
    if (c.insurer_paid >= target && c.status !== 'paid') {
      await sql`UPDATE insurance_claims SET status = 'paid', updated_at = now() WHERE id = ${c.id}`;
    }
  }
}

export function defaultDueDate(issueDate: string, dueDays: number): string {
  return addDaysISO(issueDate, dueDays);
}

export async function getFinanceSummary() {
  return (await query<{
    outstanding_patient: number;
    outstanding_insurer: number;
    overdue_count: number;
    overdue_amount: number;
    pending_review: number;
    open_claims: number;
    unpaid_bills: number;
    unpaid_bills_amount: number;
    unmatched_txns: number;
  }>(`
    WITH inv AS (
      SELECT i.*,
        i.patient_portion - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = i.id AND p.status = 'confirmed' AND p.payer_type = 'patient'), 0) AS pb,
        i.insurer_portion - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = i.id AND p.status = 'confirmed' AND p.payer_type = 'insurer'), 0) AS ib
      FROM invoices i WHERE i.status IN ('issued', 'partially_paid')
    )
    SELECT
      COALESCE((SELECT SUM(pb) FROM inv), 0) AS outstanding_patient,
      COALESCE((SELECT SUM(ib) FROM inv), 0) AS outstanding_insurer,
      (SELECT COUNT(*)::int FROM inv WHERE due_date < CURRENT_DATE) AS overdue_count,
      COALESCE((SELECT SUM(pb + ib) FROM inv WHERE due_date < CURRENT_DATE), 0) AS overdue_amount,
      (SELECT COUNT(*)::int FROM payments WHERE status = 'pending_review') AS pending_review,
      (SELECT COUNT(*)::int FROM insurance_claims WHERE status IN ('draft', 'submitted', 'approved', 'partially_approved')) AS open_claims,
      (SELECT COUNT(*)::int FROM bills WHERE status = 'unpaid') AS unpaid_bills,
      COALESCE((SELECT SUM(amount) FROM bills WHERE status = 'unpaid'), 0) AS unpaid_bills_amount,
      (SELECT COUNT(*)::int FROM bank_transactions WHERE status = 'unmatched') AS unmatched_txns
  `))[0];
}
