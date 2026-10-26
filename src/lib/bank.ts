import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { parseStatementTable, readSpreadsheetRows, type ParsedStatement, type ParsedTransaction } from '@/lib/bank-parse';
import { query, sql, transaction } from '@/lib/db';
import { getInvoice, recordInvoicePayment, refreshInvoiceStatus, setPaymentStatus } from '@/lib/billing';
import { markBillPaid } from '@/lib/budget';

const STATEMENT_SCHEMA = {
  type: 'object',
  properties: {
    accountLabel: { type: 'string', description: 'Bank and account name/number as shown on the statement' },
    periodStart: { type: 'string', description: 'Statement start date as YYYY-MM-DD, or empty string if not shown' },
    periodEnd: { type: 'string', description: 'Statement end date as YYYY-MM-DD, or empty string if not shown' },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          description: { type: 'string', description: 'The transaction remark, as close to verbatim as possible' },
          counterparty: { type: 'string', description: 'Who the money came from or went to, if stated; otherwise empty string' },
          amount: { type: 'number', description: 'Always positive, in whole rupiah' },
          direction: { type: 'string', enum: ['credit', 'debit'], description: 'credit = money in, debit = money out' },
        },
        required: ['date', 'description', 'counterparty', 'amount', 'direction'],
        additionalProperties: false,
      },
    },
  },
  required: ['accountLabel', 'periodStart', 'periodEnd', 'transactions'],
  additionalProperties: false,
};

/** Transcribes a PDF statement (or a spreadsheet the column detector couldn't read) with Claude.
 * Literal transcription only: matching and categorising stay a human step. */
async function parseWithClaude(content: Anthropic.Beta.BetaContentBlockParam): Promise<ParsedStatement> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Reading PDF statements needs ANTHROPIC_API_KEY to be set. Upload the CSV or Excel export from internet banking instead.');
  }
  const client = new Anthropic();
  try {
    const stream = client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: STATEMENT_SCHEMA } },
      system:
        'You transcribe bank statements into structured data. Extract every transaction line exactly as it appears, in order. ' +
        'Do not summarise, merge, skip or invent transactions, and do not guess what a payment was for. ' +
        'Exclude opening/closing balance lines and running-balance columns.',
      messages: [{ role: 'user', content: [content, { type: 'text', text: 'Transcribe every transaction on this bank statement.' }] }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') throw new Error('The statement could not be read automatically. Try the CSV export instead.');
    if (message.stop_reason === 'max_tokens') throw new Error('This statement is too long to read in one go. Upload it one month at a time.');
    const text = message.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
    if (!text) throw new Error('No transactions came back from the statement reader.');
    const parsed = JSON.parse(text) as { accountLabel: string; periodStart: string; periodEnd: string; transactions: ParsedTransaction[] };
    return {
      accountLabel: parsed.accountLabel,
      periodStart: parsed.periodStart || null,
      periodEnd: parsed.periodEnd || null,
      transactions: parsed.transactions.filter((t) => t.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date)).map((t) => ({ ...t, amount: Math.round(t.amount) })),
    };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('ANTHROPIC_API_KEY is invalid.');
    if (err instanceof Anthropic.RateLimitError) throw new Error('The statement reader is busy. Try again in a minute.');
    if (err instanceof Anthropic.APIError) throw new Error(`Statement reader error (${err.status}): ${err.message}`);
    throw err;
  }
}

export async function parseStatementFile(buffer: Buffer, fileName: string, contentType: string, fallbackYear: number): Promise<ParsedStatement> {
  const isPdf = contentType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    return parseWithClaude({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } });
  }
  const rows = readSpreadsheetRows(buffer);
  const transactions = parseStatementTable(rows, fallbackYear);
  if (transactions && transactions.length > 0) {
    const dates = transactions.map((t) => t.date).sort();
    return { accountLabel: fileName.replace(/\.[^.]+$/, ''), periodStart: dates[0], periodEnd: dates[dates.length - 1], transactions };
  }
  const csv = rows.map((r) => r.map((c) => String(c ?? '')).join(',')).join('\n').slice(0, 200_000);
  return parseWithClaude({ type: 'text', text: csv });
}

export async function saveStatement(parsed: ParsedStatement, fileId: number | null, userId: number): Promise<{ statementId: number; inserted: number; duplicates: number }> {
  return transaction(async (q) => {
    const [{ id }] = await q<{ id: number }>`
      INSERT INTO bank_statements (file_id, account_label, period_start, period_end, uploaded_by)
      VALUES (${fileId}, ${parsed.accountLabel}, ${parsed.periodStart}, ${parsed.periodEnd}, ${userId}) RETURNING id`;
    let inserted = 0;
    let duplicates = 0;
    for (const t of parsed.transactions) {
      // Skip a line already imported from an overlapping statement.
      const dup = await q`SELECT 1 FROM bank_transactions WHERE txn_date = ${t.date} AND amount = ${t.amount} AND direction = ${t.direction} AND description = ${t.description} LIMIT 1`;
      if (dup.length) { duplicates++; continue; }
      await q`INSERT INTO bank_transactions (statement_id, txn_date, description, counterparty, amount, direction)
              VALUES (${id}, ${t.date}, ${t.description}, ${t.counterparty || null}, ${t.amount}, ${t.direction})`;
      inserted++;
    }
    return { statementId: id, inserted, duplicates };
  });
}

// ---------- Matching ----------

export interface BankTxnRow {
  id: number;
  statement_id: number;
  txn_date: string;
  description: string;
  counterparty: string | null;
  amount: number;
  direction: 'credit' | 'debit';
  status: 'unmatched' | 'matched' | 'ignored';
  matched_note: string | null;
}

export async function listBankTransactions(status: string): Promise<BankTxnRow[]> {
  return query<BankTxnRow>(
    `SELECT * FROM bank_transactions WHERE ($1 = 'all' OR status = $1) ORDER BY txn_date DESC, id DESC LIMIT 500`,
    [status]
  );
}

export async function listStatements() {
  return sql<{ id: number; account_label: string | null; period_start: string | null; period_end: string | null; created_at: string; file_id: number | null; txns: number; unmatched: number }>`
    SELECT s.*, (SELECT COUNT(*)::int FROM bank_transactions t WHERE t.statement_id = s.id) AS txns,
      (SELECT COUNT(*)::int FROM bank_transactions t WHERE t.statement_id = s.id AND t.status = 'unmatched') AS unmatched
    FROM bank_statements s ORDER BY s.created_at DESC LIMIT 50
  `;
}

export interface MatchCandidate {
  kind: 'invoice_patient' | 'invoice_insurer' | 'pending_payment' | 'bill';
  id: number;
  label: string;
  detail: string;
  amount: number;
  score: number;
}

function nameScore(haystack: string, name: string | null): number {
  if (!name) return 0;
  const words = name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const h = haystack.toLowerCase();
  return words.filter((w) => h.includes(w)).length;
}

/** Ranked suggestions for one bank line: exact amount first, then name/number overlap. */
export async function getMatchCandidates(txn: BankTxnRow): Promise<MatchCandidate[]> {
  const text = `${txn.description} ${txn.counterparty ?? ''}`;
  const out: MatchCandidate[] = [];
  if (txn.direction === 'credit') {
    const invoices = await query<{ id: number; invoice_number: string; billed_to_name: string; account_name: string; insurer_name: string | null; pb: number; ib: number }>(
      `SELECT i.id, i.invoice_number, i.billed_to_name, f.account_name, ins.name AS insurer_name,
         i.patient_portion - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = i.id AND p.status = 'confirmed' AND p.payer_type = 'patient'), 0) AS pb,
         i.insurer_portion - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = i.id AND p.status = 'confirmed' AND p.payer_type = 'insurer'), 0) AS ib
       FROM invoices i JOIN families f ON f.id = i.family_id LEFT JOIN insurers ins ON ins.id = i.insurer_id
       WHERE i.status IN ('issued', 'partially_paid')`
    );
    for (const inv of invoices) {
      const numberHit = text.toUpperCase().includes(inv.invoice_number.toUpperCase()) ? 5 : 0;
      if (inv.pb > 0) {
        const score = (inv.pb === txn.amount ? 10 : txn.amount < inv.pb ? 1 : 0) + numberHit + nameScore(text, inv.billed_to_name) + nameScore(text, inv.account_name);
        if (score > 0 && txn.amount <= inv.pb) out.push({ kind: 'invoice_patient', id: inv.id, label: `${inv.invoice_number} · ${inv.billed_to_name}`, detail: 'Patient balance', amount: inv.pb, score });
      }
      if (inv.ib > 0) {
        const score = (inv.ib === txn.amount ? 10 : txn.amount < inv.ib ? 1 : 0) + numberHit + nameScore(text, inv.insurer_name);
        if (score > 0 && txn.amount <= inv.ib) out.push({ kind: 'invoice_insurer', id: inv.id, label: `${inv.invoice_number} · ${inv.insurer_name}`, detail: 'Insurer balance', amount: inv.ib, score });
      }
    }
    const pending = await sql<{ id: number; amount: number; invoice_number: string | null; account_name: string | null; paid_at: string }>`
      SELECT p.id, p.amount, i.invoice_number, f.account_name, p.paid_at FROM payments p
      LEFT JOIN invoices i ON i.id = p.invoice_id LEFT JOIN families f ON f.id = p.family_id
      WHERE p.status = 'pending_review' AND p.bank_transaction_id IS NULL`;
    for (const p of pending) {
      const score = (p.amount === txn.amount ? 12 : 0) + nameScore(text, p.account_name);
      if (score > 0) out.push({ kind: 'pending_payment', id: p.id, label: `Patient-reported payment · ${p.account_name ?? ''}`, detail: `${p.invoice_number ?? ''} · reported ${p.paid_at}`, amount: p.amount, score });
    }
  } else {
    const bills = await sql<{ id: number; vendor: string; bill_reference: string | null; amount: number; due_date: string | null }>`
      SELECT id, vendor, bill_reference, amount, due_date FROM bills WHERE status = 'unpaid'`;
    for (const b of bills) {
      const score = (b.amount === txn.amount ? 10 : 0) + nameScore(text, b.vendor) + (b.bill_reference && text.includes(b.bill_reference) ? 5 : 0);
      if (score > 0) out.push({ kind: 'bill', id: b.id, label: `${b.vendor}${b.bill_reference ? ' · ' + b.bill_reference : ''}`, detail: b.due_date ? `Due ${b.due_date}` : 'Unpaid bill', amount: b.amount, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}

async function getTxn(id: number): Promise<BankTxnRow> {
  const t = (await sql<BankTxnRow>`SELECT * FROM bank_transactions WHERE id = ${id}`)[0];
  if (!t) throw new Error('Bank transaction not found.');
  if (t.status !== 'unmatched') throw new Error('This bank line has already been dealt with.');
  return t;
}

async function markMatched(id: number, note: string) {
  await sql`UPDATE bank_transactions SET status = 'matched', matched_note = ${note} WHERE id = ${id}`;
}

export async function matchTxnToInvoice(txnId: number, invoiceId: number, payerType: 'patient' | 'insurer', userId: number): Promise<void> {
  const t = await getTxn(txnId);
  if (t.direction !== 'credit') throw new Error('Only money in can be matched to an invoice.');
  const inv = await getInvoice(invoiceId);
  if (!inv) throw new Error('Invoice not found.');
  await recordInvoicePayment(
    { invoiceId, payerType, amount: t.amount, method: payerType === 'insurer' ? 'insurance' : 'bank_transfer', paidAt: t.txn_date, reference: t.description.slice(0, 120), notes: 'Matched from bank statement', bankTransactionId: t.id },
    userId
  );
  await markMatched(t.id, `${inv.invoice_number} (${payerType})`);
}

export async function matchTxnToPendingPayment(txnId: number, paymentId: number): Promise<void> {
  const t = await getTxn(txnId);
  const p = (await sql<{ amount: number; status: string }>`SELECT amount, status FROM payments WHERE id = ${paymentId}`)[0];
  if (!p || p.status !== 'pending_review') throw new Error('That payment isn’t awaiting review.');
  if (p.amount !== t.amount) throw new Error('The amounts don’t match.');
  await sql`UPDATE payments SET bank_transaction_id = ${t.id}, paid_at = ${t.txn_date} WHERE id = ${paymentId}`;
  await setPaymentStatus(paymentId, 'confirmed');
  await markMatched(t.id, `Confirmed patient payment #${paymentId}`);
}

export async function matchTxnToBill(txnId: number, billId: number): Promise<void> {
  const t = await getTxn(txnId);
  if (t.direction !== 'debit') throw new Error('Only money out can be matched to a bill.');
  const bill = (await sql<{ amount: number; vendor: string }>`SELECT amount, vendor FROM bills WHERE id = ${billId}`)[0];
  if (!bill) throw new Error('Bill not found.');
  if (bill.amount !== t.amount) throw new Error('The amounts don’t match. Edit the bill amount first if it was paid differently.');
  await markBillPaid(billId, t.txn_date, 'bank_transfer', t.id);
  await markMatched(t.id, `Bill: ${bill.vendor}`);
}

/** Money in that isn't an invoice payment (e.g. pharmacy cash deposit, interest). */
export async function recordTxnAsOtherIncome(txnId: number, categoryId: number, userId: number): Promise<void> {
  const t = await getTxn(txnId);
  if (t.direction !== 'credit') throw new Error('This is money out.');
  await sql`INSERT INTO payments (payer_type, amount, method, paid_at, reference, bank_transaction_id, category_id, notes, recorded_by)
            VALUES ('other', ${t.amount}, 'bank_transfer', ${t.txn_date}, ${t.description.slice(0, 120)}, ${t.id}, ${categoryId}, 'From bank statement', ${userId})`;
  await markMatched(t.id, 'Other income');
}

/** Money out with no bill on file (bank fees, card purchases): records it as a paid expense. */
export async function recordTxnAsExpense(txnId: number, categoryId: number, vendor: string, userId: number): Promise<void> {
  const t = await getTxn(txnId);
  if (t.direction !== 'debit') throw new Error('This is money in.');
  await sql`INSERT INTO bills (vendor, category_id, issue_date, amount, status, paid_at, payment_method, bank_transaction_id, created_from_bank, notes, created_by)
            VALUES (${vendor || t.counterparty || t.description.slice(0, 60)}, ${categoryId}, ${t.txn_date}, ${t.amount}, 'paid', ${t.txn_date}, 'bank_transfer', ${t.id}, true, ${t.description}, ${userId})`;
  await markMatched(t.id, 'Expense');
}

export async function ignoreTxn(txnId: number, reason: string): Promise<void> {
  await getTxn(txnId);
  await sql`UPDATE bank_transactions SET status = 'ignored', matched_note = ${reason || 'Ignored'} WHERE id = ${txnId}`;
}

/** Undoes a match: removes the payment/expense it created and reopens the bank line. */
export async function unmatchTxn(txnId: number): Promise<void> {
  const payment = (await sql<{ id: number; invoice_id: number | null; submitted_by_patient: boolean }>`SELECT id, invoice_id, submitted_by_patient FROM payments WHERE bank_transaction_id = ${txnId}`)[0];
  if (payment) {
    if (payment.submitted_by_patient) {
      await sql`UPDATE payments SET bank_transaction_id = NULL, status = 'pending_review' WHERE id = ${payment.id}`;
    } else {
      await sql`DELETE FROM payments WHERE id = ${payment.id}`;
    }
    if (payment.invoice_id) await refreshInvoiceStatus(payment.invoice_id);
  }
  const bill = (await sql<{ id: number; created_from_bank: boolean }>`SELECT id, created_from_bank FROM bills WHERE bank_transaction_id = ${txnId}`)[0];
  if (bill?.created_from_bank) {
    await sql`DELETE FROM bills WHERE id = ${bill.id}`;
  } else if (bill) {
    await sql`UPDATE bills SET status = 'unpaid', paid_at = NULL, payment_method = NULL, bank_transaction_id = NULL WHERE id = ${bill.id}`;
  }
  await sql`UPDATE bank_transactions SET status = 'unmatched', matched_note = NULL WHERE id = ${txnId}`;
}

/** Matches every unmatched line that has exactly one exact-amount candidate with a name or
 * invoice-number hit, so it's very unlikely to be wrong. Everything else is left for a person. */
export async function autoMatch(userId: number): Promise<number> {
  const txns = await listBankTransactions('unmatched');
  let matched = 0;
  for (const t of txns) {
    const c = (await getMatchCandidates(t)).filter((x) => x.amount === t.amount && x.score >= 11);
    if (c.length !== 1) continue;
    const m = c[0];
    try {
      if (m.kind === 'invoice_patient') await matchTxnToInvoice(t.id, m.id, 'patient', userId);
      else if (m.kind === 'invoice_insurer') await matchTxnToInvoice(t.id, m.id, 'insurer', userId);
      else if (m.kind === 'pending_payment') await matchTxnToPendingPayment(t.id, m.id);
      else if (m.kind === 'bill') await matchTxnToBill(t.id, m.id);
      matched++;
    } catch {
      // leave it for manual review
    }
  }
  return matched;
}
