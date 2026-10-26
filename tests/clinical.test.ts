import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allergyWarnings, DRUGS, DRUGS_BY_CODE } from '../src/clinical/drugs';
import { LEAFLETS_BY_SLUG } from '../src/clinical/leaflets';
import { PROTOCOLS, suggestProtocols } from '../src/clinical/protocols';
import { adultTews, computeTriage, DISCRIMINATORS } from '../src/clinical/triage';

test('every protocol references real drugs and leaflets', () => {
  for (const p of PROTOCOLS) {
    for (const d of p.prescribing) assert.ok(DRUGS_BY_CODE.has(d.drugCode), `${p.slug} → missing drug ${d.drugCode}`);
    for (const l of p.leaflets) assert.ok(LEAFLETS_BY_SLUG.has(l), `${p.slug} → missing leaflet ${l}`);
  }
});

test('codes and slugs are unique', () => {
  assert.equal(new Set(DRUGS.map((d) => d.code)).size, DRUGS.length);
  assert.equal(new Set(PROTOCOLS.map((p) => p.slug)).size, PROTOCOLS.length);
  assert.equal(new Set(DISCRIMINATORS.map((d) => d.code)).size, DISCRIMINATORS.length);
});

test('adult TEWS: normal observations score 0 (green)', () => {
  const r = computeTriage({ ageYears: 30, heartRate: 80, respRate: 14, systolicBp: 120, temperature: 37, avpu: 'alert', mobility: 'walking' }, []);
  assert.equal(r.tews, 0);
  assert.equal(r.category, 'green');
});

test('adult TEWS: septic picture scores red', () => {
  // HR 135 (3) + RR 32 (3) + SBP 85 (1) + temp 39.5 (2) + confused (1) + walking (0) = 10
  const t = adultTews({ ageYears: 40, heartRate: 135, respRate: 32, systolicBp: 85, temperature: 39.5, avpu: 'confused', mobility: 'walking' });
  assert.equal(t?.score, 10);
  assert.equal(computeTriage({ ageYears: 40, heartRate: 135, respRate: 32, systolicBp: 85, temperature: 39.5, avpu: 'confused', mobility: 'walking' }, []).category, 'red');
});

test('discriminators raise the category but never lower it', () => {
  const calm = { ageYears: 25, heartRate: 80, respRate: 14, systolicBp: 120, temperature: 37, avpu: 'alert' as const, mobility: 'walking' as const };
  assert.equal(computeTriage(calm, ['animal_bite']).category, 'yellow');
  assert.equal(computeTriage(calm, ['methanol']).category, 'orange');
  assert.equal(computeTriage(calm, ['anaphylaxis', 'animal_bite']).category, 'red');
});

test('low SpO2 and hypoglycaemia', () => {
  assert.equal(computeTriage({ ageYears: 50, heartRate: 80, respRate: 14, spo2: 89 }, []).category, 'orange');
  assert.equal(computeTriage({ ageYears: 50, heartRate: 80, respRate: 14, glucose: 2.5 }, []).category, 'red');
});

test('children use age-based ranges, and infant fever is very urgent', () => {
  assert.equal(computeTriage({ ageYears: 4, heartRate: 110, respRate: 24, temperature: 37.5, avpu: 'alert' }, []).category, 'green');
  assert.equal(computeTriage({ ageYears: 4, heartRate: 160, respRate: 24 }, []).category, 'orange');
  assert.equal(computeTriage({ ageYears: 0.1, heartRate: 150, respRate: 40, temperature: 38.2 }, []).category, 'orange');
  assert.equal(computeTriage({ ageYears: 5, heartRate: 110, respRate: 24, systolicBp: 70 }, []).category, 'red');
});

test('allergy checks catch class and cross-reactivity', () => {
  assert.equal(allergyWarnings('Amoxicillin', 'amoxicillin', 'Penicillin – rash')[0]?.severity, 'block');
  assert.equal(allergyWarnings('Cefalexin', 'cefalexin', 'penicillin anaphylaxis')[0]?.severity, 'caution');
  assert.equal(allergyWarnings('Ibuprofen', 'ibuprofen', 'NSAIDs (asthma)')[0]?.severity, 'block');
  assert.equal(allergyWarnings('Paracetamol', 'paracetamol', 'Penicillin').length, 0);
  assert.equal(allergyWarnings('Amoxicillin', 'amoxicillin', null).length, 0);
});

test('protocol suggestions match common Lombok complaints', () => {
  assert.equal(suggestProtocols('Dog bite on left hand')[0]?.slug, 'animal-bite');
  assert.equal(suggestProtocols('Stepped on sea urchin at Gerupuk')[0]?.slug, 'marine-stings');
  assert.equal(suggestProtocols('Fell off motorbike, road rash on leg')[0]?.slug, 'road-trauma');
  assert.equal(suggestProtocols('Blurred vision after drinking arak')[0]?.slug, 'methanol');
});
