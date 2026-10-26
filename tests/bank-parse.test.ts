import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { parseStatementAmount, parseStatementDate, parseStatementTable, readSpreadsheetRows } from '../src/lib/bank-parse';

test('amounts in Indonesian and international formats', () => {
  assert.equal(parseStatementAmount('1,500,000.00')?.amount, 1500000);
  assert.equal(parseStatementAmount('1.500.000,00')?.amount, 1500000);
  assert.equal(parseStatementAmount('Rp 250.000')?.amount, 250000);
  assert.deepEqual(parseStatementAmount('(75,000)'), { amount: 75000, sign: -1, marker: null });
  assert.equal(parseStatementAmount('-75000')?.sign, -1);
  assert.equal(parseStatementAmount('1,500,000.00 CR')?.marker, 'CR');
  assert.equal(parseStatementAmount('10,000.00 DB')?.marker, 'DB');
  assert.equal(parseStatementAmount(''), null);
});

test('dates are day-first', () => {
  assert.equal(parseStatementDate('05/03/2026', 2026), '2026-03-05');
  assert.equal(parseStatementDate('2026-03-05', 2026), '2026-03-05');
  assert.equal(parseStatementDate('05 Mar 2026', 2026), '2026-03-05');
  assert.equal(parseStatementDate('05 Mei 2026', 2026), '2026-05-05');
  assert.equal(parseStatementDate('05/03', 2025), '2025-03-05');
  assert.equal(parseStatementDate('31/02/2026', 2026), null);
});

test('BCA-style export with CR/DB on the amount', () => {
  const rows = [
    ['Informasi Rekening - Mutasi Rekening'],
    ['Tanggal Transaksi', 'Keterangan', 'Cabang', 'Jumlah', 'Saldo'],
    ["'05/10/2026", 'TRSF E-BANKING CR 0510/FTSCY JOHN SMITH', '0000', '1,500,000.00 CR', '10,000,000.00'],
    ["'06/10/2026", 'BIAYA ADM', '0000', '10,000.00 DB', '9,990,000.00'],
    ['Saldo Awal', '', '', '', '8,500,000.00'],
  ];
  const txns = parseStatementTable(rows, 2026)!;
  assert.equal(txns.length, 2);
  assert.deepEqual(
    txns.map((t) => [t.date, t.direction, t.amount, t.description]),
    [
      ['2026-10-05', 'credit', 1500000, 'TRSF E-BANKING CR 0510/FTSCY JOHN SMITH'],
      ['2026-10-06', 'debit', 10000, 'BIAYA ADM'],
    ]
  );
});

test('Mandiri-style export with separate debit and credit columns', () => {
  const rows = [
    ['Date', 'Remarks', 'Debit', 'Credit', 'Balance'],
    ['01/10/2026', 'Rent October', '15.000.000,00', '0,00', '35.000.000,00'],
    ['02/10/2026', 'Transfer from Allianz', '0,00', '2.400.000,00', '37.400.000,00'],
  ];
  const txns = parseStatementTable(rows, 2026)!;
  assert.deepEqual(txns.map((t) => [t.direction, t.amount]), [['debit', 15000000], ['credit', 2400000]]);
});

test('signed single amount column, read from a real xlsx file', () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Posting date', 'Description', 'Amount'],
    ['2026-10-01', 'Card purchase', -125000],
    ['2026-10-02', 'Interest', 3200],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const txns = parseStatementTable(readSpreadsheetRows(buf), 2026)!;
  assert.deepEqual(txns.map((t) => [t.date, t.direction, t.amount]), [['2026-10-01', 'debit', 125000], ['2026-10-02', 'credit', 3200]]);
});

test('unrecognised layout returns null so the AI reader can take over', () => {
  assert.equal(parseStatementTable([['foo', 'bar'], ['1', '2']], 2026), null);
});

test('counterparty is pulled out of a BCA transfer remark', async () => {
  const { guessCounterparty } = await import('../src/lib/bank-parse');
  assert.equal(guessCounterparty('TRSF E-BANKING CR 0510/FTSCY/WS95031 1500000.00 JOHN SMITH'), 'JOHN SMITH');
});
