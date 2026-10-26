import * as XLSX from 'xlsx';

// Pure bank-statement parsing (no database), so it can be tested on its own.

export interface ParsedTransaction {
  date: string;
  description: string;
  counterparty: string;
  amount: number;
  direction: 'credit' | 'debit';
}

export interface ParsedStatement {
  accountLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  transactions: ParsedTransaction[];
}

// ---------- Parsing ----------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, agt: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Indonesian bank exports use day-first dates; ISO and Excel serials are handled too. A date
 * with no year (BCA's "dd/mm") takes fallbackYear. */
export function parseStatementDate(value: unknown, fallbackYear: number): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const d = XLSX.SSF.parse_date_code(value);
    return d ? iso(d.y, d.m, d.d) : null;
  }
  const s = String(value).trim().replace(/^'/, '');
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-/ .]([A-Za-z]{3})[A-Za-z]*[-/ .,]*(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (m) return iso(fallbackYear, +m[2], +m[1]);
  return null;
}

/** "1,500,000.00", "1.500.000,00", "Rp 250.000", "(75,000)", "-75000", "1,500,000.00 CR" */
export function parseStatementAmount(value: unknown): { amount: number; sign: 1 | -1 | 0; marker: 'CR' | 'DB' | null } | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return { amount: Math.abs(Math.round(value)), sign: value < 0 ? -1 : 1, marker: null };
  let s = String(value).trim().toUpperCase();
  let marker: 'CR' | 'DB' | null = null;
  if (/\b(CR|K|KREDIT|CREDIT)\s*$/.test(s)) marker = 'CR';
  if (/\b(DB|D|DEBIT|DEBET)\s*$/.test(s)) marker = 'DB';
  s = s.replace(/[A-Z]+/g, '').trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  s = s.replace(/\s/g, '');
  if (!/\d/.test(s)) return null;
  // Decide which separator is the decimal point: the last one, if followed by 1-2 digits.
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  let intPart = s;
  if (lastSep >= 0 && /^\d{1,2}$/.test(s.slice(lastSep + 1))) intPart = s.slice(0, lastSep);
  const digits = intPart.replace(/[.,]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const amount = Number(digits);
  return { amount, sign: amount === 0 ? 0 : negative ? -1 : 1, marker };
}

const HEADER_PATTERNS = {
  date: /^(tanggal|tgl|date|transaction date|tanggal transaksi|posting date|value date|trx date)/i,
  description: /(keterangan|description|remark|uraian|details?|narrative|berita|particulars|transaksi)/i,
  debit: /^(debit|debet|db|withdrawal|keluar|mutasi debet|money out|paid out)/i,
  credit: /^(credit|kredit|cr|deposit|masuk|mutasi kredit|money in|paid in)/i,
  amount: /^(amount|jumlah|nominal|mutasi|nilai)/i,
  direction: /^(db\/cr|d\/k|dk|type|jenis|cr\/db|debit\/credit)/i,
};

/** Column-detecting parser for CSV/XLSX exports from Indonesian and international banks.
 * Returns null when it can't confidently find a date column and an amount column. */
export function parseStatementTable(rows: unknown[][], fallbackYear: number): ParsedTransaction[] | null {
  for (let h = 0; h < Math.min(rows.length, 30); h++) {
    const header = rows[h].map((c) => String(c ?? '').trim());
    // Each column is claimed once, in this order, so e.g. "Tanggal Transaksi" can't also be
    // taken as the description column.
    const taken = new Set<number>();
    const find = (re: RegExp) => {
      const i = header.findIndex((c, idx) => !taken.has(idx) && re.test(c));
      if (i >= 0) taken.add(i);
      return i;
    };
    const date = find(HEADER_PATTERNS.date);
    const direction = find(HEADER_PATTERNS.direction);
    const debit = find(HEADER_PATTERNS.debit);
    const credit = find(HEADER_PATTERNS.credit);
    const amount = find(HEADER_PATTERNS.amount);
    const description = find(HEADER_PATTERNS.description);
    const cols = { date, description, debit, credit, amount, direction };
    if (cols.date < 0 || (cols.amount < 0 && (cols.debit < 0 || cols.credit < 0))) continue;

    const out: ParsedTransaction[] = [];
    for (const row of rows.slice(h + 1)) {
      const date = parseStatementDate(row[cols.date], fallbackYear);
      if (!date) continue;
      const description = cols.description >= 0 ? String(row[cols.description] ?? '').trim() : '';
      let amount = 0;
      let direction: 'credit' | 'debit' | null = null;
      if (cols.debit >= 0 && cols.credit >= 0) {
        const cr = parseStatementAmount(row[cols.credit]);
        const db = parseStatementAmount(row[cols.debit]);
        if (cr && cr.amount > 0) { amount = cr.amount; direction = 'credit'; }
        else if (db && db.amount > 0) { amount = db.amount; direction = 'debit'; }
      } else {
        const a = parseStatementAmount(row[cols.amount]);
        if (!a || a.amount === 0) continue;
        amount = a.amount;
        const dirCell = cols.direction >= 0 ? String(row[cols.direction] ?? '').trim().toUpperCase() : '';
        if (a.marker === 'CR' || /^(CR|K|C|KREDIT|CREDIT)$/.test(dirCell)) direction = 'credit';
        else if (a.marker === 'DB' || /^(DB|D|DEBIT|DEBET)$/.test(dirCell)) direction = 'debit';
        else direction = a.sign < 0 ? 'debit' : 'credit';
      }
      if (!direction || amount <= 0) continue;
      out.push({ date, description: description || '(no description)', counterparty: guessCounterparty(description), amount, direction });
    }
    if (out.length > 0) return out;
  }
  return null;
}

export function guessCounterparty(description: string): string {
  // e.g. "TRSF E-BANKING CR 0105/FTSCY/WS95031 1500000.00 JOHN SMITH" -> "JOHN SMITH"
  const words = description
    .replace(/\b(TRSF|TRF|E-BANKING|BI-FAST|FTSCY|WS\d*|TRANSFER|KE|DARI|FROM|TO|CR|DB)\b/gi, ' ')
    .replace(/[\d/.,:-]+/g, ' ');
  return words.replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function readSpreadsheetRows(buffer: Buffer): unknown[][] {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });
}

