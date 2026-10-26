'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/app/actions/auth';
import { BUDGET_UNLOCK_TTL_MS } from '@/lib/auth';
import {
  autoMatch,
  ignoreTxn,
  matchTxnToBill,
  matchTxnToInvoice,
  matchTxnToPendingPayment,
  parseStatementFile,
  recordTxnAsExpense,
  recordTxnAsOtherIncome,
  saveStatement,
  unmatchTxn,
} from '@/lib/bank';
import { getClinicSettings } from '@/lib/billing';
import { markBillPaid, updateCategoryBudget } from '@/lib/budget';
import { sql } from '@/lib/db';
import { fileFrom, saveUpload } from '@/lib/files';
import { dateStr, errorMessage, num, str } from '@/lib/form';
import { parseAmount, todayISO } from '@/lib/format';
import { audit, getSession, requireBudgetUnlocked, requirePermission } from '@/lib/session';

const MAX_PIN_ATTEMPTS = 5;

// ---------- PIN lock ----------

export async function unlockBudget(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const session = await getSession();
  const s = session;
  if (s.pinLockedUntil && s.pinLockedUntil > Date.now()) return { error: 'Too many wrong PINs. Try again in 15 minutes.' };
  const pin = str(fd, 'pin') ?? '';
  const settings = await getClinicSettings();
  if (!settings.budget_pin_hash) return { error: 'No PIN has been set yet. Set one in Clinic settings.' };
  if (!(await bcrypt.compare(pin, settings.budget_pin_hash))) {
    s.pinFailures = (s.pinFailures ?? 0) + 1;
    if (s.pinFailures >= MAX_PIN_ATTEMPTS) {
      s.pinFailures = 0;
      s.pinLockedUntil = Date.now() + 15 * 60 * 1000;
    }
    await session.save();
    await audit(user.id, 'budget_pin_failed', 'budget', null);
    return { error: 'That PIN isn’t right.' };
  }
  s.pinFailures = 0;
  s.budgetUnlockedUntil = Date.now() + BUDGET_UNLOCK_TTL_MS;
  await session.save();
  await audit(user.id, 'budget_unlock', 'budget', null);
  revalidatePath('/dashboard/budget', 'layout');
  return { ok: 'Unlocked.' };
}

export async function lockBudget(): Promise<void> {
  await requirePermission('finance');
  const session = await getSession();
  session.budgetUnlockedUntil = undefined;
  await session.save();
  redirect('/dashboard');
}

export async function setBudgetPin(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const settings = await getClinicSettings();
  const current = str(fd, 'current_pin') ?? '';
  const pin = str(fd, 'pin') ?? '';
  const confirm = str(fd, 'confirm') ?? '';
  if (settings.budget_pin_hash && !(await bcrypt.compare(current, settings.budget_pin_hash))) return { error: 'Your current PIN is incorrect.' };
  if (!/^\d{4,8}$/.test(pin)) return { error: 'Use 4 to 8 digits.' };
  if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return { error: 'Choose a PIN that isn’t a repeated or sequential number.' };
  if (pin !== confirm) return { error: 'The PINs don’t match.' };
  await sql`UPDATE clinic_settings SET budget_pin_hash = ${await bcrypt.hash(pin, 12)} WHERE id = 1`;
  await audit(user.id, 'budget_pin_set', 'budget', null);
  return { ok: 'Budget PIN saved.' };
}

// ---------- Budget categories ----------

export async function saveCategoryBudgets(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBudgetUnlocked();
  for (const [key, value] of fd.entries()) {
    const m = key.match(/^budget_(\d+)$/);
    if (!m) continue;
    const amount = parseAmount(String(value || '0'));
    if (!Number.isFinite(amount) || amount < 0) return { error: 'Budgets must be zero or more.' };
    await updateCategoryBudget(Number(m[1]), amount, user.id);
  }
  revalidatePath('/dashboard/budget');
  return { ok: 'Budgets saved. Each change is logged.' };
}

export async function addCategory(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireBudgetUnlocked();
  const name = str(fd, 'name');
  const kind = str(fd, 'kind') === 'revenue' ? 'revenue' : 'expense';
  if (!name) return { error: 'Enter a category name.' };
  try {
    await sql`INSERT INTO budget_categories (name, kind, monthly_budget, sort_order) VALUES (${name}, ${kind}, ${Math.max(0, parseAmount(str(fd, 'monthly_budget') ?? '0') || 0)}, 100)`;
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath('/dashboard/budget/setup');
  return { ok: 'Category added.' };
}

export async function archiveCategory(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireBudgetUnlocked();
  const id = num(fd, 'id');
  const archived = str(fd, 'archived') === 'true';
  if (!id) return { error: 'Missing category.' };
  await sql`UPDATE budget_categories SET is_archived = ${archived} WHERE id = ${id}`;
  revalidatePath('/dashboard/budget/setup');
  return { ok: archived ? 'Category archived. Past entries keep it.' : 'Category restored.' };
}

export async function saveOpeningBalance(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBudgetUnlocked();
  const amount = parseAmount(str(fd, 'opening_cash_balance'));
  const date = dateStr(fd, 'opening_cash_date');
  if (!Number.isFinite(amount) || !date) return { error: 'Enter the opening balance and the date it was taken.' };
  await sql`UPDATE clinic_settings SET opening_cash_balance = ${amount}, opening_cash_date = ${date} WHERE id = 1`;
  await audit(user.id, 'set_opening_balance', 'budget', null, `${amount} @ ${date}`);
  revalidatePath('/dashboard/budget');
  return { ok: 'Opening balance saved.' };
}

// ---------- Bills ----------

export async function createBill(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBudgetUnlocked();
  const vendor = str(fd, 'vendor');
  const amount = parseAmount(str(fd, 'amount'));
  const issueDate = dateStr(fd, 'issue_date') ?? todayISO();
  const alreadyPaid = str(fd, 'already_paid') === 'on';
  if (!vendor) return { error: 'Who is the bill from?' };
  if (!(amount > 0)) return { error: 'Enter the bill amount.' };
  try {
    const file = fileFrom(fd, 'file');
    const stored = file ? await saveUpload(file, { folder: 'bills', uploadedBy: user.id }) : null;
    await sql`INSERT INTO bills (vendor, bill_reference, category_id, issue_date, due_date, amount, status, paid_at, payment_method, file_id, notes, created_by)
      VALUES (${vendor}, ${str(fd, 'bill_reference')}, ${num(fd, 'category_id')}, ${issueDate}, ${dateStr(fd, 'due_date')}, ${amount},
              ${alreadyPaid ? 'paid' : 'unpaid'}, ${alreadyPaid ? dateStr(fd, 'paid_at') ?? issueDate : null}, ${alreadyPaid ? str(fd, 'payment_method') ?? 'bank_transfer' : null},
              ${stored?.id ?? null}, ${str(fd, 'notes')}, ${user.id})`;
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath('/dashboard/budget/bills');
  return { ok: alreadyPaid ? 'Expense recorded.' : 'Bill added to the list to pay.' };
}

export async function payBill(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBudgetUnlocked();
  const id = num(fd, 'id');
  if (!id) return { error: 'Missing bill.' };
  try {
    await markBillPaid(id, dateStr(fd, 'paid_at') ?? todayISO(), str(fd, 'payment_method') ?? 'bank_transfer');
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await audit(user.id, 'pay', 'bill', id);
  revalidatePath('/dashboard/budget/bills');
  return { ok: 'Marked as paid.' };
}

export async function updateBill(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBudgetUnlocked();
  const id = num(fd, 'id');
  const vendor = str(fd, 'vendor');
  const amount = parseAmount(str(fd, 'amount'));
  if (!id || !vendor || !(amount > 0)) return { error: 'Vendor and amount are required.' };
  const file = fileFrom(fd, 'file');
  const stored = file ? await saveUpload(file, { folder: 'bills', uploadedBy: user.id }) : null;
  await sql`UPDATE bills SET vendor = ${vendor}, bill_reference = ${str(fd, 'bill_reference')}, category_id = ${num(fd, 'category_id')},
    issue_date = ${dateStr(fd, 'issue_date') ?? todayISO()}, due_date = ${dateStr(fd, 'due_date')}, amount = ${amount}, notes = ${str(fd, 'notes')},
    file_id = COALESCE(${stored?.id ?? null}, file_id) WHERE id = ${id}`;
  await audit(user.id, 'update', 'bill', id);
  revalidatePath(`/dashboard/budget/bills/${id}`);
  return { ok: 'Bill saved.' };
}

export async function setBillStatus(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBudgetUnlocked();
  const id = num(fd, 'id');
  const status = str(fd, 'status');
  if (!id || !status || !['unpaid', 'void'].includes(status)) return { error: 'Invalid change.' };
  const bill = (await sql<{ bank_transaction_id: number | null }>`SELECT bank_transaction_id FROM bills WHERE id = ${id}`)[0];
  if (bill?.bank_transaction_id) return { error: 'This bill is matched to a bank line. Unmatch it on the bank statements page first.' };
  await sql`UPDATE bills SET status = ${status}, paid_at = NULL, payment_method = NULL WHERE id = ${id}`;
  await audit(user.id, `bill_${status}`, 'bill', id);
  revalidatePath(`/dashboard/budget/bills/${id}`);
  return { ok: status === 'void' ? 'Bill voided.' : 'Bill marked unpaid.' };
}

export async function logOtherIncome(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBudgetUnlocked();
  const amount = parseAmount(str(fd, 'amount'));
  const categoryId = num(fd, 'category_id');
  if (!(amount > 0) || !categoryId) return { error: 'Enter the amount and category.' };
  await sql`INSERT INTO payments (payer_type, amount, method, paid_at, reference, category_id, notes, recorded_by)
    VALUES ('other', ${amount}, ${str(fd, 'method') ?? 'cash'}, ${dateStr(fd, 'paid_at') ?? todayISO()}, ${str(fd, 'reference')}, ${categoryId}, ${str(fd, 'notes')}, ${user.id})`;
  revalidatePath('/dashboard/budget');
  return { ok: 'Income recorded.' };
}

// ---------- Bank statements ----------

export async function uploadStatement(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBudgetUnlocked();
  const file = fileFrom(fd, 'statement');
  if (!file) return { error: 'Choose a statement file.' };
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseStatementFile(buffer, file.name, file.type, new Date().getFullYear());
    if (parsed.transactions.length === 0) return { error: 'No transactions were found in that file.' };
    const stored = await saveUpload(file, { folder: 'statements', uploadedBy: user.id });
    const result = await saveStatement(parsed, stored.id, user.id);
    const matched = str(fd, 'auto_match') === 'on' ? await autoMatch(user.id) : 0;
    await audit(user.id, 'upload', 'bank_statement', result.statementId, `${result.inserted} lines`);
    revalidatePath('/dashboard/budget/bank');
    return {
      ok: `Imported ${result.inserted} transactions${result.duplicates ? ` (${result.duplicates} already imported were skipped)` : ''}${matched ? `; ${matched} matched automatically` : ''}.`,
    };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function runAutoMatch(_prev: FormState): Promise<FormState> {
  const user = await requireBudgetUnlocked();
  const n = await autoMatch(user.id);
  revalidatePath('/dashboard/budget/bank');
  return { ok: n ? `Matched ${n} transaction${n === 1 ? '' : 's'}.` : 'No confident matches found. Match the rest by hand.' };
}

export async function matchTransaction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBudgetUnlocked();
  const txnId = num(fd, 'txn_id');
  const target = str(fd, 'target'); // e.g. "invoice_patient:12", "bill:4", "income:3", "expense:7", "ignore"
  if (!txnId || !target) return { error: 'Choose what this transaction is.' };
  const [kind, idStr] = target.split(':');
  const id = Number(idStr);
  try {
    if (kind === 'invoice_patient') await matchTxnToInvoice(txnId, id, 'patient', user.id);
    else if (kind === 'invoice_insurer') await matchTxnToInvoice(txnId, id, 'insurer', user.id);
    else if (kind === 'pending_payment') await matchTxnToPendingPayment(txnId, id);
    else if (kind === 'bill') await matchTxnToBill(txnId, id);
    else if (kind === 'income') await recordTxnAsOtherIncome(txnId, id, user.id);
    else if (kind === 'expense') await recordTxnAsExpense(txnId, id, str(fd, 'vendor') ?? '', user.id);
    else if (kind === 'ignore') await ignoreTxn(txnId, str(fd, 'reason') ?? 'Not clinic business');
    else return { error: 'Choose what this transaction is.' };
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await audit(user.id, `match_${kind}`, 'bank_transaction', txnId, idStr);
  revalidatePath('/dashboard/budget/bank');
  return { ok: 'Done.' };
}

export async function unmatchTransaction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBudgetUnlocked();
  const txnId = num(fd, 'txn_id');
  if (!txnId) return { error: 'Missing transaction.' };
  await unmatchTxn(txnId);
  await audit(user.id, 'unmatch', 'bank_transaction', txnId);
  revalidatePath('/dashboard/budget/bank');
  return { ok: 'Unmatched.' };
}

export async function deleteStatement(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBudgetUnlocked();
  const id = num(fd, 'id');
  if (!id) return { error: 'Missing statement.' };
  const matched = await sql`SELECT 1 FROM bank_transactions WHERE statement_id = ${id} AND status = 'matched' LIMIT 1`;
  if (matched.length) return { error: 'Some lines on this statement are matched. Unmatch them first.' };
  await sql`DELETE FROM bank_statements WHERE id = ${id}`;
  await audit(user.id, 'delete', 'bank_statement', id);
  revalidatePath('/dashboard/budget/bank');
  return { ok: 'Statement removed.' };
}

// ---------- Clinic settings ----------

export async function saveClinicSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const legal = str(fd, 'legal_name');
  const address = str(fd, 'address');
  if (!legal || !address) return { error: 'Name and address are required.' };
  const due = num(fd, 'invoice_due_days') ?? 14;
  const tax = num(fd, 'tax_rate_percent') ?? 0;
  if (tax < 0 || tax > 100) return { error: 'Tax rate must be between 0 and 100.' };
  await sql`UPDATE clinic_settings SET legal_name = ${legal}, address = ${address}, email = ${str(fd, 'email')}, phone = ${str(fd, 'phone')},
    bank_name = ${str(fd, 'bank_name')}, bank_account_name = ${str(fd, 'bank_account_name')}, bank_account_number = ${str(fd, 'bank_account_number')},
    bank_swift = ${str(fd, 'bank_swift')}, invoice_due_days = ${due}, tax_rate_percent = ${tax}, invoice_footer_note = ${str(fd, 'invoice_footer_note')}
    WHERE id = 1`;
  await audit(user.id, 'update', 'clinic_settings', 1);
  revalidatePath('/dashboard/settings');
  return { ok: 'Settings saved.' };
}
