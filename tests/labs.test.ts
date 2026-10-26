import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANALYTES_BY_CODE, flagResult, LAB_TESTS, LAB_TESTS_BY_CODE, parseRange, PROTOCOL_TESTS } from '../src/clinical/labs';
import { PROTOCOLS_BY_SLUG } from '../src/clinical/protocols';
import { REFERRAL_TEMPLATES, SPECIALTIES } from '../src/clinical/referrals';

test('lab catalogue codes are unique', () => {
  assert.equal(new Set(LAB_TESTS.map((t) => t.code)).size, LAB_TESTS.length);
  const analytes = LAB_TESTS.flatMap((t) => t.analytes.map((a) => a.code));
  assert.equal(new Set(analytes).size, analytes.length);
  assert.equal(ANALYTES_BY_CODE.size, analytes.length);
});

test('protocol test suggestions point at real protocols and tests', () => {
  for (const [slug, codes] of Object.entries(PROTOCOL_TESTS)) {
    assert.ok(PROTOCOLS_BY_SLUG.has(slug), slug);
    for (const c of codes) assert.ok(LAB_TESTS_BY_CODE.has(c), `${slug}: ${c}`);
  }
});

test('abnormal options are a subset of the options', () => {
  for (const a of ANALYTES_BY_CODE.values()) {
    if (a.abnormal) for (const x of a.abnormal) assert.ok(a.options?.includes(x), `${a.code}: ${x}`);
  }
});

test('numeric flags use catalogue ranges and critical limits', () => {
  assert.equal(flagResult('plt', '220', 'male'), null);
  assert.equal(flagResult('plt', '95', 'male'), 'L');
  assert.equal(flagResult('plt', '35', 'male'), 'LL');
  assert.equal(flagResult('k', '6.8', null), 'HH');
  assert.equal(flagResult('k', '5.5', null), 'H');
  assert.equal(flagResult('crp', '<1', null), null);
});

test('female ranges apply', () => {
  assert.equal(flagResult('hb', '12.5', 'female'), null);
  assert.equal(flagResult('hb', '12.5', 'male'), 'L');
});

test('lab report range beats catalogue range, but not critical limits', () => {
  assert.equal(flagResult('plt', '140', 'male', '130-400'), null);
  assert.equal(flagResult('plt', '30', 'male', '10-400'), 'LL');
  assert.equal(flagResult(null, '12', null, '0 – 10'), 'H');
});

test('qualitative results', () => {
  assert.equal(flagResult('ns1', 'Positive', null), 'A');
  assert.equal(flagResult('ns1', 'negative', null), null);
  assert.equal(flagResult('hcg', 'Positive', 'female'), null);
  assert.equal(flagResult(null, 'Non-reactive', null), null);
  assert.equal(flagResult(null, 'E. coli isolated', null), 'A');
});

test('range parsing', () => {
  assert.deepEqual(parseRange('3.5 - 5.2'), { low: 3.5, high: 5.2 });
  assert.deepEqual(parseRange('3,5–5,2'), { low: 3.5, high: 5.2 });
  assert.deepEqual(parseRange('< 5'), { high: 5 });
  assert.deepEqual(parseRange('>1.0'), { low: 1 });
  assert.equal(parseRange('Negative'), null);
});

test('referral templates are complete', () => {
  assert.equal(new Set(REFERRAL_TEMPLATES.map((t) => t.slug)).size, REFERRAL_TEMPLATES.length);
  for (const t of REFERRAL_TEMPLATES) {
    assert.ok(t.opening.includes('{patient}'), t.slug);
    if (t.kind !== 'other') assert.ok(SPECIALTIES[t.kind].length > 0);
  }
});

test('PDF text keeps to characters the PDF font can draw', async () => {
  const { pdfText } = await import('../src/lib/pdf/text');
  assert.equal(pdfText('Platelets 42 ×10⁹/L'), 'Platelets 42 ×10^9/L');
  assert.equal(pdfText('SpO₂ 97%, glucose ≤ 3'), 'SpO2 97%, glucose <= 3');
  assert.equal(pdfText('‼ Critical – “check” µmol/L 37°C'), ' Critical – “check” µmol/L 37°C');
});
