// Triage based on the South African Triage Scale (SATS): an early-warning score (TEWS) from
// vital signs, overridden upwards by clinical discriminators. SATS was designed for
// resource-limited emergency settings, which suits a walk-in clinic in Lombok.
//
// CLINICAL SAFETY: this is decision support, not a decision. The final category is always the
// triaging clinician's call, and they can raise it. Bump TRIAGE_VERSION whenever the rules
// change so the medical director re-approves them (content_approvals, kind = 'triage').

export const TRIAGE_VERSION = 1;

export type TriageCategory = 'red' | 'orange' | 'yellow' | 'green';

export const TRIAGE_ORDER: TriageCategory[] = ['red', 'orange', 'yellow', 'green'];

export const TRIAGE_INFO: Record<TriageCategory, { label: string; target: string; targetMinutes: number; className: string }> = {
  red: { label: 'Emergency', target: 'Immediately', targetMinutes: 0, className: 'bg-red-600 text-white' },
  orange: { label: 'Very urgent', target: 'Within 10 minutes', targetMinutes: 10, className: 'bg-orange-500 text-white' },
  yellow: { label: 'Urgent', target: 'Within 60 minutes', targetMinutes: 60, className: 'bg-yellow-300 text-yellow-950' },
  green: { label: 'Routine', target: 'Within 4 hours', targetMinutes: 240, className: 'bg-emerald-600 text-white' },
};

export interface Vitals {
  ageYears: number | null;
  heartRate?: number | null;
  respRate?: number | null;
  systolicBp?: number | null;
  temperature?: number | null;
  spo2?: number | null;
  avpu?: 'alert' | 'confused' | 'voice' | 'pain' | 'unresponsive' | null;
  mobility?: 'walking' | 'with_help' | 'stretcher' | null;
  trauma?: boolean;
  glucose?: number | null; // mmol/L
  painScore?: number | null;
}

export interface Discriminator {
  code: string;
  label: string;
  category: TriageCategory;
  group: string;
}

// Discriminators grouped for the triage screen. Lombok-specific additions are marked in the group.
export const DISCRIMINATORS: Discriminator[] = [
  // Emergency (red)
  { code: 'airway', label: 'Airway compromised or obstructed', category: 'red', group: 'Emergency signs' },
  { code: 'breathing', label: 'Breathing inadequate / severe respiratory distress', category: 'red', group: 'Emergency signs' },
  { code: 'shock', label: 'Shock (cold, clammy, weak rapid pulse)', category: 'red', group: 'Emergency signs' },
  { code: 'seizure_now', label: 'Seizure happening now', category: 'red', group: 'Emergency signs' },
  { code: 'arrest', label: 'Cardiac or respiratory arrest', category: 'red', group: 'Emergency signs' },
  { code: 'burn_airway', label: 'Burn to face or inhalation injury', category: 'red', group: 'Emergency signs' },
  { code: 'anaphylaxis', label: 'Anaphylaxis (allergy with breathing or circulation problem)', category: 'red', group: 'Emergency signs' },
  { code: 'heat_stroke', label: 'Heat stroke (hot and confused or collapsed)', category: 'red', group: 'Emergency signs' },
  // Very urgent (orange)
  { code: 'sob_acute', label: 'Shortness of breath, acute', category: 'orange', group: 'Very urgent' },
  { code: 'chest_pain', label: 'Chest pain (possible heart or lung cause)', category: 'orange', group: 'Very urgent' },
  { code: 'haemorrhage_uncontrolled', label: 'Bleeding not controlled by pressure', category: 'orange', group: 'Very urgent' },
  { code: 'focal_neuro', label: 'New weakness, numbness, speech or facial droop', category: 'orange', group: 'Very urgent' },
  { code: 'reduced_consciousness', label: 'Reduced level of consciousness / post-ictal', category: 'orange', group: 'Very urgent' },
  { code: 'head_injury_lof', label: 'Head injury with loss of consciousness or vomiting', category: 'orange', group: 'Very urgent' },
  { code: 'compound_fracture', label: 'Open fracture or dislocation of a large joint', category: 'orange', group: 'Very urgent' },
  { code: 'threatened_limb', label: 'Threatened limb (cold, pale or pulseless)', category: 'orange', group: 'Very urgent' },
  { code: 'burn_major', label: 'Burn >20% body, circumferential, electrical or chemical', category: 'orange', group: 'Very urgent' },
  { code: 'poisoning', label: 'Poisoning or overdose', category: 'orange', group: 'Very urgent' },
  { code: 'methanol', label: 'Arak/local spirit drunk + blurred vision, breathlessness or severe headache (methanol)', category: 'orange', group: 'Very urgent · Lombok' },
  { code: 'dengue_warning', label: 'Fever with dengue warning signs (severe abdominal pain, persistent vomiting, bleeding gums/nose, lethargy)', category: 'orange', group: 'Very urgent · Lombok' },
  { code: 'marine_systemic', label: 'Marine sting with severe pain, sweating, vomiting or breathing difficulty', category: 'orange', group: 'Very urgent · Lombok' },
  { code: 'vomit_blood', label: 'Vomiting fresh blood', category: 'orange', group: 'Very urgent' },
  { code: 'pregnancy_abdo', label: 'Pregnant with abdominal pain or trauma', category: 'orange', group: 'Very urgent' },
  { code: 'infant_fever', label: 'Baby under 3 months with temperature ≥38 °C', category: 'orange', group: 'Very urgent' },
  { code: 'pain_severe', label: 'Severe pain (8–10/10)', category: 'orange', group: 'Very urgent' },
  // Urgent (yellow)
  { code: 'haemorrhage_controlled', label: 'Bleeding controlled', category: 'yellow', group: 'Urgent' },
  { code: 'closed_fracture', label: 'Suspected closed fracture', category: 'yellow', group: 'Urgent' },
  { code: 'burn_other', label: 'Other burn (including exhaust pipe burn)', category: 'yellow', group: 'Urgent' },
  { code: 'abdo_pain', label: 'Abdominal pain', category: 'yellow', group: 'Urgent' },
  { code: 'vomit_persistent', label: 'Persistent vomiting / unable to keep fluids down', category: 'yellow', group: 'Urgent' },
  { code: 'dehydration', label: 'Signs of dehydration', category: 'yellow', group: 'Urgent' },
  { code: 'pregnancy_bleed', label: 'Pregnant with vaginal bleeding', category: 'yellow', group: 'Urgent' },
  { code: 'animal_bite', label: 'Dog, cat or monkey bite or scratch (rabies risk)', category: 'yellow', group: 'Urgent · Lombok' },
  { code: 'marine_sting', label: 'Jellyfish, sea urchin, stonefish or stingray injury', category: 'yellow', group: 'Urgent · Lombok' },
  { code: 'pain_moderate', label: 'Moderate pain (5–7/10)', category: 'yellow', group: 'Urgent' },
];

const RANK: Record<TriageCategory, number> = { red: 0, orange: 1, yellow: 2, green: 3 };
export const worst = (a: TriageCategory, b: TriageCategory): TriageCategory => (RANK[a] <= RANK[b] ? a : b);

/** Adult TEWS (age 12 and over). Returns null when there aren't enough vital signs to score. */
export function adultTews(v: Vitals): { score: number; parts: Record<string, number> } | null {
  const parts: Record<string, number> = {};
  if (v.mobility) parts.mobility = v.mobility === 'walking' ? 0 : v.mobility === 'with_help' ? 1 : 2;
  if (v.respRate != null) {
    const r = v.respRate;
    parts.respRate = r < 9 ? 2 : r <= 14 ? 0 : r <= 20 ? 1 : r <= 29 ? 2 : 3;
  }
  if (v.heartRate != null) {
    const h = v.heartRate;
    parts.heartRate = h < 41 ? 2 : h <= 50 ? 1 : h <= 100 ? 0 : h <= 110 ? 1 : h <= 129 ? 2 : 3;
  }
  if (v.systolicBp != null) {
    const s = v.systolicBp;
    parts.systolicBp = s < 71 ? 3 : s <= 80 ? 2 : s <= 100 ? 1 : s <= 199 ? 0 : 2;
  }
  if (v.temperature != null) {
    const t = v.temperature;
    parts.temperature = t < 35 ? 2 : t <= 38.4 ? 0 : 2;
  }
  if (v.avpu) parts.avpu = { alert: 0, confused: 1, voice: 1, pain: 2, unresponsive: 3 }[v.avpu];
  parts.trauma = v.trauma ? 1 : 0;
  // Need at least heart rate, resp rate and one of BP/AVPU to give a meaningful score.
  if (parts.heartRate == null || parts.respRate == null) return null;
  return { score: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

export function tewsCategory(score: number): TriageCategory {
  if (score >= 7) return 'red';
  if (score >= 5) return 'orange';
  if (score >= 3) return 'yellow';
  return 'green';
}

// Normal awake ranges for children (PALS). Outside range = flag; far outside = very urgent.
const PAED_RANGES: { maxAge: number; hr: [number, number]; rr: [number, number]; minSbp: number }[] = [
  { maxAge: 1, hr: [100, 160], rr: [30, 53], minSbp: 70 },
  { maxAge: 3, hr: [98, 140], rr: [22, 37], minSbp: 72 },
  { maxAge: 6, hr: [80, 120], rr: [20, 28], minSbp: 76 },
  { maxAge: 12, hr: [75, 118], rr: [18, 25], minSbp: 80 },
];

function paediatricFlags(v: Vitals): { category: TriageCategory; reasons: string[] } {
  const age = v.ageYears ?? 0;
  const band = PAED_RANGES.find((b) => age < b.maxAge) ?? PAED_RANGES[PAED_RANGES.length - 1];
  const reasons: string[] = [];
  let cat: TriageCategory = 'green';
  const flag = (c: TriageCategory, why: string) => {
    cat = worst(cat, c);
    reasons.push(why);
  };
  const minSbp = age >= 1 && age <= 10 ? 70 + 2 * Math.floor(age) : band.minSbp;
  if (v.heartRate != null) {
    if (v.heartRate > band.hr[1] * 1.2 || v.heartRate < band.hr[0] * 0.8) flag('orange', `Heart rate ${v.heartRate} well outside normal for age (${band.hr[0]}–${band.hr[1]})`);
    else if (v.heartRate > band.hr[1] || v.heartRate < band.hr[0]) flag('yellow', `Heart rate ${v.heartRate} outside normal for age (${band.hr[0]}–${band.hr[1]})`);
  }
  if (v.respRate != null) {
    if (v.respRate > band.rr[1] * 1.25 || v.respRate < band.rr[0] * 0.75) flag('orange', `Breathing rate ${v.respRate} well outside normal for age (${band.rr[0]}–${band.rr[1]})`);
    else if (v.respRate > band.rr[1] || v.respRate < band.rr[0]) flag('yellow', `Breathing rate ${v.respRate} outside normal for age (${band.rr[0]}–${band.rr[1]})`);
  }
  if (v.systolicBp != null && v.systolicBp < minSbp) flag('red', `Systolic BP ${v.systolicBp} below ${minSbp} (hypotension for age)`);
  if (v.temperature != null && v.temperature >= 38 && age < 0.25) flag('orange', 'Baby under 3 months with fever');
  if (v.temperature != null && v.temperature < 35) flag('orange', `Temperature ${v.temperature} °C (hypothermia)`);
  if (v.avpu && v.avpu !== 'alert') flag(v.avpu === 'pain' || v.avpu === 'unresponsive' ? 'red' : 'orange', `Responds to ${v.avpu}, not alert`);
  return { category: cat, reasons };
}

export interface TriageResult {
  category: TriageCategory;
  tews: number | null;
  reasons: string[];
  scoredAs: 'adult' | 'child';
}

/** Combines the vital-sign score with any ticked discriminators; the most urgent wins. */
export function computeTriage(v: Vitals, discriminatorCodes: string[]): TriageResult {
  const reasons: string[] = [];
  let category: TriageCategory = 'green';
  let tews: number | null = null;
  const isChild = v.ageYears != null && v.ageYears < 12;

  if (isChild) {
    const p = paediatricFlags(v);
    category = worst(category, p.category);
    reasons.push(...p.reasons);
  } else {
    const t = adultTews(v);
    if (t) {
      tews = t.score;
      const c = tewsCategory(t.score);
      category = worst(category, c);
      reasons.push(`TEWS ${t.score} → ${TRIAGE_INFO[c].label}`);
    } else {
      reasons.push('Not enough vital signs for an early-warning score: record heart rate and breathing rate.');
    }
  }

  // Vital-sign discriminators that apply at any age.
  if (v.spo2 != null && v.spo2 < 92) {
    category = worst(category, 'orange');
    reasons.push(`Oxygen saturation ${v.spo2}% (below 92%)`);
  }
  if (v.glucose != null && v.glucose < 3) {
    category = worst(category, 'red');
    reasons.push(`Blood glucose ${v.glucose} mmol/L (hypoglycaemia)`);
  }
  if (v.temperature != null && v.temperature >= 40 && v.avpu && v.avpu !== 'alert') {
    category = worst(category, 'red');
    reasons.push('Temperature ≥40 °C with altered consciousness (possible heat stroke)');
  }
  if (v.painScore != null) {
    if (v.painScore >= 8) {
      category = worst(category, 'orange');
      reasons.push(`Severe pain ${v.painScore}/10`);
    } else if (v.painScore >= 5) {
      category = worst(category, 'yellow');
      reasons.push(`Moderate pain ${v.painScore}/10`);
    }
  }

  for (const code of discriminatorCodes) {
    const d = DISCRIMINATORS.find((x) => x.code === code);
    if (!d) continue;
    category = worst(category, d.category);
    reasons.push(`${d.label} → ${TRIAGE_INFO[d.category].label}`);
  }

  return { category, tews, reasons, scoredAs: isChild ? 'child' : 'adult' };
}
