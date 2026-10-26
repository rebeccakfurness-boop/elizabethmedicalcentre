import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocateFefo, dueState, periodStart, readingOutOfRange, stockStatus, suggestedOrderQuantity, DEFAULT_LABELS } from '../src/lib/ops-shared';
import { LAUNCH_CARDS, LAUNCH_LISTS, SUGGESTED_CHECKLISTS } from '../src/operations/templates';

test('periods: day, Monday of the week, 1st of the month', () => {
  assert.equal(periodStart('2026-10-28', 'daily'), '2026-10-28');
  assert.equal(periodStart('2026-10-28', 'weekly'), '2026-10-26'); // Wednesday -> Monday
  assert.equal(periodStart('2026-11-01', 'weekly'), '2026-10-26'); // Sunday belongs to the week before
  assert.equal(periodStart('2026-10-26', 'weekly'), '2026-10-26');
  assert.equal(periodStart('2026-10-28', 'monthly'), '2026-10-01');
});

test('readings out of range', () => {
  assert.equal(readingOutOfRange(5, 2, 8), false);
  assert.equal(readingOutOfRange(9.1, 2, 8), true);
  assert.equal(readingOutOfRange(1, 2, null), true);
  assert.equal(readingOutOfRange(null, 2, 8), false);
});

test('stock status and order suggestion', () => {
  assert.equal(stockStatus(0, 5), 'out');
  assert.equal(stockStatus(5, 5), 'low');
  assert.equal(stockStatus(6, 5), 'ok');
  assert.equal(suggestedOrderQuantity(2, 10, 50), 50);
  assert.equal(suggestedOrderQuantity(2, 10, 0), 18);
});

test('first expiry first out', () => {
  const batches = [
    { id: 1, quantity: 5, expiry_date: null, received_at: '2026-01-01' },
    { id: 2, quantity: 3, expiry_date: '2027-03-01', received_at: '2026-02-01' },
    { id: 3, quantity: 4, expiry_date: '2026-12-01', received_at: '2026-03-01' },
  ];
  assert.deepEqual(allocateFefo(batches, 6), [{ batchId: 3, take: 4 }, { batchId: 2, take: 2 }]);
  assert.deepEqual(allocateFefo(batches, 12).map((x) => x.batchId), [3, 2, 1]);
  assert.throws(() => allocateFefo(batches, 13), /Only 12 in stock/);
  assert.deepEqual(allocateFefo(batches, 0.5), [{ batchId: 3, take: 0.5 }]);
});

test('due states', () => {
  assert.equal(dueState('2026-10-25', '2026-10-26', false), 'overdue');
  assert.equal(dueState('2026-10-26', '2026-10-26', false), 'today');
  assert.equal(dueState('2026-11-01', '2026-10-26', false), 'soon');
  assert.equal(dueState('2026-12-01', '2026-10-26', false), 'later');
  assert.equal(dueState('2026-10-01', '2026-10-26', true), 'done');
  assert.equal(dueState(null, '2026-10-26', false), 'none');
});

test('starter content is consistent', () => {
  for (const c of LAUNCH_CARDS) {
    assert.ok((LAUNCH_LISTS as readonly string[]).includes(c.list), c.title);
    assert.ok(DEFAULT_LABELS.includes(c.label), `${c.title}: ${c.label}`);
    assert.ok(c.dueWeek >= (c.startWeek ?? 0), c.title);
  }
  assert.ok(Math.max(...LAUNCH_CARDS.map((c) => c.dueWeek)) >= 26, 'plan runs at least six months');
  for (const t of SUGGESTED_CHECKLISTS) {
    if (t.reading?.min != null && t.reading.max != null) assert.ok(t.reading.min < t.reading.max, t.title);
    if (t.frequency !== 'weekly') assert.equal(t.weekday, undefined, t.title);
  }
});
