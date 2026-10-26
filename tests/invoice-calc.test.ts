import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeInvoiceTotals } from '../src/lib/billing-shared';

const line = (unitPrice: number, insuranceCovered: boolean, quantity = 1) => ({ patientId: null, description: 'x', quantity, unitPrice, insuranceCovered });

test('no insurance: family pays everything', () => {
  const t = computeInvoiceTotals([line(450000, true), line(100000, false, 2)], 0, 0, false);
  assert.equal(t.subtotal, 650000);
  assert.equal(t.total, 650000);
  assert.equal(t.insurerPortion, 0);
  assert.equal(t.patientPortion, 650000);
});

test('insurance covers only ticked lines', () => {
  const t = computeInvoiceTotals([line(500000, true), line(100000, false)], 0, 0, true);
  assert.equal(t.insurerPortion, 500000);
  assert.equal(t.patientPortion, 100000);
});

test('discount and tax are shared in proportion and portions add up to the total', () => {
  const t = computeInvoiceTotals([line(500000, true), line(100000, false)], 60000, 11, true);
  assert.equal(t.discount, 60000);
  assert.equal(t.tax, Math.round(540000 * 0.11));
  assert.equal(t.total, 540000 + t.tax);
  assert.equal(t.insurerPortion + t.patientPortion, t.total);
  assert.equal(t.insurerPortion, Math.round((t.total * 5) / 6));
});

test('discount can never exceed the subtotal', () => {
  const t = computeInvoiceTotals([line(100000, false)], 999999, 0, false);
  assert.equal(t.total, 0);
});
