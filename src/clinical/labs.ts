// Blood and urine tests the clinic orders most, with typical adult reference ranges.
// Labs differ: when a report gives its own range, that range is saved with the result and wins.
// DRAFT content: needs review by the medical director against the labs the clinic uses.

export type Sex = 'male' | 'female' | 'other' | null;

export interface Analyte {
  code: string;
  name: string;
  unit?: string;
  /** Numeric reference range. `female` overrides it for female patients. */
  low?: number;
  high?: number;
  female?: { low?: number; high?: number };
  /** Values beyond these are flagged LL / HH (act today). */
  criticalLow?: number;
  criticalHigh?: number;
  /** Qualitative result: the choices, and which of them are abnormal. */
  options?: string[];
  abnormal?: string[];
}

export interface LabTest {
  code: string;
  name: string;
  group: string;
  sample: string;
  turnaround: string;
  analytes: Analyte[];
}

const POS_NEG = ['Negative', 'Positive', 'Equivocal'];
const REACTIVE = ['Non-reactive', 'Reactive', 'Indeterminate'];
const DIPSTICK = ['Negative', 'Trace', '+', '++', '+++'];
const notNegative = (opts: string[]) => opts.filter((o) => !/^(negative|non-reactive|normal)$/i.test(o));

export const LAB_TESTS: LabTest[] = [
  {
    code: 'fbc',
    name: 'Full blood count',
    group: 'Haematology',
    sample: 'EDTA (purple top)',
    turnaround: 'Same day',
    analytes: [
      { code: 'hb', name: 'Haemoglobin', unit: 'g/dL', low: 13.0, high: 17.0, female: { low: 12.0, high: 15.5 }, criticalLow: 7.0 },
      { code: 'hct', name: 'Haematocrit', unit: '%', low: 40, high: 50, female: { low: 36, high: 46 } },
      { code: 'wbc', name: 'White cell count', unit: '×10⁹/L', low: 4.0, high: 11.0, criticalLow: 1.0, criticalHigh: 30 },
      { code: 'neut', name: 'Neutrophils', unit: '×10⁹/L', low: 2.0, high: 7.5, criticalLow: 0.5 },
      { code: 'lymph', name: 'Lymphocytes', unit: '×10⁹/L', low: 1.0, high: 4.0 },
      { code: 'plt', name: 'Platelets', unit: '×10⁹/L', low: 150, high: 400, criticalLow: 50, criticalHigh: 1000 },
    ],
  },
  {
    code: 'dengue_ns1',
    name: 'Dengue NS1 antigen',
    group: 'Tropical infections',
    sample: 'Serum (red/gold top)',
    turnaround: '1 hour (rapid test)',
    analytes: [{ code: 'ns1', name: 'Dengue NS1', options: POS_NEG, abnormal: notNegative(POS_NEG) }],
  },
  {
    code: 'dengue_serology',
    name: 'Dengue IgM / IgG',
    group: 'Tropical infections',
    sample: 'Serum (red/gold top)',
    turnaround: '1 hour (rapid test)',
    analytes: [
      { code: 'dengue_igm', name: 'Dengue IgM', options: POS_NEG, abnormal: notNegative(POS_NEG) },
      { code: 'dengue_igg', name: 'Dengue IgG', options: POS_NEG, abnormal: notNegative(POS_NEG) },
    ],
  },
  {
    code: 'malaria',
    name: 'Malaria rapid test',
    group: 'Tropical infections',
    sample: 'EDTA (purple top) or finger prick',
    turnaround: '30 minutes',
    analytes: [
      {
        code: 'malaria_rdt',
        name: 'Malaria RDT',
        options: ['Negative', 'P. falciparum', 'P. vivax / non-falciparum', 'Mixed'],
        abnormal: ['P. falciparum', 'P. vivax / non-falciparum', 'Mixed'],
      },
    ],
  },
  {
    code: 'typhoid',
    name: 'Typhoid rapid test (Tubex / IgM)',
    group: 'Tropical infections',
    sample: 'Serum (red/gold top)',
    turnaround: 'Same day',
    analytes: [{ code: 'typhoid', name: 'Typhoid IgM', options: POS_NEG, abnormal: notNegative(POS_NEG) }],
  },
  {
    code: 'lepto',
    name: 'Leptospirosis IgM',
    group: 'Tropical infections',
    sample: 'Serum (red/gold top)',
    turnaround: '1–2 days',
    analytes: [{ code: 'lepto_igm', name: 'Leptospira IgM', options: POS_NEG, abnormal: notNegative(POS_NEG) }],
  },
  {
    code: 'chik',
    name: 'Chikungunya IgM',
    group: 'Tropical infections',
    sample: 'Serum (red/gold top)',
    turnaround: '1–2 days',
    analytes: [{ code: 'chik_igm', name: 'Chikungunya IgM', options: POS_NEG, abnormal: notNegative(POS_NEG) }],
  },
  {
    code: 'crp',
    name: 'C-reactive protein',
    group: 'Chemistry',
    sample: 'Serum (red/gold top)',
    turnaround: 'Same day',
    analytes: [{ code: 'crp', name: 'CRP', unit: 'mg/L', high: 5 }],
  },
  {
    code: 'uec',
    name: 'Electrolytes, urea & creatinine',
    group: 'Chemistry',
    sample: 'Serum (red/gold top)',
    turnaround: 'Same day',
    analytes: [
      { code: 'na', name: 'Sodium', unit: 'mmol/L', low: 135, high: 145, criticalLow: 120, criticalHigh: 160 },
      { code: 'k', name: 'Potassium', unit: 'mmol/L', low: 3.5, high: 5.2, criticalLow: 2.5, criticalHigh: 6.5 },
      { code: 'cl', name: 'Chloride', unit: 'mmol/L', low: 98, high: 107 },
      { code: 'urea', name: 'Urea', unit: 'mmol/L', low: 2.5, high: 7.8, criticalHigh: 30 },
      { code: 'creat', name: 'Creatinine', unit: 'µmol/L', low: 60, high: 110, female: { low: 45, high: 90 }, criticalHigh: 500 },
    ],
  },
  {
    code: 'lft',
    name: 'Liver function tests',
    group: 'Chemistry',
    sample: 'Serum (red/gold top)',
    turnaround: 'Same day',
    analytes: [
      { code: 'alt', name: 'ALT', unit: 'U/L', high: 40, criticalHigh: 1000 },
      { code: 'ast', name: 'AST', unit: 'U/L', high: 40, criticalHigh: 1000 },
      { code: 'alp', name: 'Alkaline phosphatase', unit: 'U/L', low: 30, high: 120 },
      { code: 'bili', name: 'Bilirubin (total)', unit: 'µmol/L', high: 21 },
      { code: 'alb', name: 'Albumin', unit: 'g/L', low: 35, high: 50 },
    ],
  },
  {
    code: 'glucose',
    name: 'Blood glucose',
    group: 'Chemistry',
    sample: 'Fluoride (grey top) or finger prick',
    turnaround: '15 minutes',
    analytes: [{ code: 'glu', name: 'Glucose', unit: 'mmol/L', low: 3.9, high: 7.8, criticalLow: 3.0, criticalHigh: 25 }],
  },
  {
    code: 'hba1c',
    name: 'HbA1c',
    group: 'Chemistry',
    sample: 'EDTA (purple top)',
    turnaround: '1–2 days',
    analytes: [{ code: 'hba1c', name: 'HbA1c', unit: '%', high: 5.6 }],
  },
  {
    code: 'lipids',
    name: 'Cholesterol (lipid profile)',
    group: 'Chemistry',
    sample: 'Serum, fasting preferred',
    turnaround: '1–2 days',
    analytes: [
      { code: 'chol', name: 'Total cholesterol', unit: 'mmol/L', high: 5.2 },
      { code: 'ldl', name: 'LDL cholesterol', unit: 'mmol/L', high: 3.4 },
      { code: 'hdl', name: 'HDL cholesterol', unit: 'mmol/L', low: 1.0 },
      { code: 'tg', name: 'Triglycerides', unit: 'mmol/L', high: 1.7 },
    ],
  },
  {
    code: 'troponin',
    name: 'Troponin',
    group: 'Chemistry',
    sample: 'Serum or point-of-care',
    turnaround: '30 minutes',
    analytes: [{ code: 'trop', name: 'Troponin I (hs)', unit: 'ng/L', high: 26, criticalHigh: 100 }],
  },
  {
    code: 'inr',
    name: 'INR / clotting',
    group: 'Haematology',
    sample: 'Citrate (light blue top)',
    turnaround: 'Same day',
    analytes: [{ code: 'inr', name: 'INR', low: 0.8, high: 1.2, criticalHigh: 5 }],
  },
  {
    code: 'blood_group',
    name: 'Blood group',
    group: 'Haematology',
    sample: 'EDTA (purple top)',
    turnaround: 'Same day',
    analytes: [{ code: 'abo', name: 'Blood group', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], abnormal: [] }],
  },
  {
    code: 'urinalysis',
    name: 'Urine dipstick',
    group: 'Urine & stool',
    sample: 'Midstream urine',
    turnaround: '5 minutes',
    analytes: [
      { code: 'u_leuc', name: 'Leucocytes', options: DIPSTICK, abnormal: notNegative(DIPSTICK) },
      { code: 'u_nit', name: 'Nitrites', options: POS_NEG, abnormal: notNegative(POS_NEG) },
      { code: 'u_blood', name: 'Blood', options: DIPSTICK, abnormal: notNegative(DIPSTICK) },
      { code: 'u_prot', name: 'Protein', options: DIPSTICK, abnormal: notNegative(DIPSTICK) },
      { code: 'u_glu', name: 'Glucose', options: DIPSTICK, abnormal: notNegative(DIPSTICK) },
      { code: 'u_ket', name: 'Ketones', options: DIPSTICK, abnormal: notNegative(DIPSTICK) },
    ],
  },
  {
    code: 'urine_culture',
    name: 'Urine culture',
    group: 'Urine & stool',
    sample: 'Midstream urine (sterile pot)',
    turnaround: '2–3 days',
    analytes: [{ code: 'u_culture', name: 'Urine culture and sensitivities' }],
  },
  {
    code: 'pregnancy',
    name: 'Pregnancy test (hCG)',
    group: 'Urine & stool',
    sample: 'Urine',
    turnaround: '5 minutes',
    analytes: [{ code: 'hcg', name: 'hCG', options: ['Negative', 'Positive'], abnormal: [] }],
  },
  {
    code: 'stool',
    name: 'Stool microscopy & culture',
    group: 'Urine & stool',
    sample: 'Stool pot',
    turnaround: '2–3 days',
    analytes: [{ code: 'stool_mcs', name: 'Stool microscopy and culture' }],
  },
  {
    code: 'hiv',
    name: 'HIV antibody/antigen',
    group: 'Sexual health & screening',
    sample: 'Serum (red/gold top)',
    turnaround: 'Same day',
    analytes: [{ code: 'hiv', name: 'HIV Ag/Ab', options: REACTIVE, abnormal: notNegative(REACTIVE) }],
  },
  {
    code: 'hbsag',
    name: 'Hepatitis B surface antigen',
    group: 'Sexual health & screening',
    sample: 'Serum (red/gold top)',
    turnaround: 'Same day',
    analytes: [{ code: 'hbsag', name: 'HBsAg', options: REACTIVE, abnormal: notNegative(REACTIVE) }],
  },
  {
    code: 'syphilis',
    name: 'Syphilis (TPHA / RPR)',
    group: 'Sexual health & screening',
    sample: 'Serum (red/gold top)',
    turnaround: '1–2 days',
    analytes: [{ code: 'syph', name: 'Syphilis serology', options: REACTIVE, abnormal: notNegative(REACTIVE) }],
  },
];

export const LAB_TESTS_BY_CODE = new Map(LAB_TESTS.map((t) => [t.code, t]));
export const ANALYTES_BY_CODE = new Map(LAB_TESTS.flatMap((t) => t.analytes.map((a) => [a.code, { ...a, testCode: t.code }] as const)));

/** Labs the clinic commonly uses; staff can type any other. */
export const LAB_DESTINATIONS = ['In-house (point of care)', 'Prodia', 'Kimia Farma', 'RSUD Praya laboratory', 'RSUD Provinsi NTB laboratory'];

/** Tests to suggest when a visit follows a protocol. */
export const PROTOCOL_TESTS: Record<string, string[]> = {
  'fever-adult': ['fbc', 'dengue_ns1', 'malaria', 'crp'],
  dengue: ['fbc', 'dengue_ns1', 'dengue_serology', 'lft'],
  'fever-child': ['fbc', 'dengue_ns1', 'crp', 'urinalysis'],
  'diarrhoea-adult': ['uec', 'fbc', 'stool'],
  'gastro-child': ['uec', 'glucose'],
  uti: ['urinalysis', 'urine_culture', 'pregnancy'],
  methanol: ['uec', 'glucose'],
  'chest-pain': ['troponin', 'fbc', 'uec'],
  'skin-infection': ['fbc', 'crp', 'glucose'],
  'heat-illness': ['uec', 'glucose', 'fbc'],
};

export type Flag = 'L' | 'H' | 'LL' | 'HH' | 'A' | null;

export const FLAG_LABELS: Record<Exclude<Flag, null>, string> = {
  L: 'Low',
  H: 'High',
  LL: 'Critically low',
  HH: 'Critically high',
  A: 'Abnormal',
};

export function rangeFor(a: Analyte, sex: Sex): { low?: number; high?: number } {
  return sex === 'female' && a.female ? { low: a.female.low ?? a.low, high: a.female.high ?? a.high } : { low: a.low, high: a.high };
}

export function rangeText(a: Analyte, sex: Sex): string | null {
  if (a.options) return a.abnormal?.length ? `${a.options[0]}` : null;
  const { low, high } = rangeFor(a, sex);
  if (low != null && high != null) return `${low}–${high}`;
  if (high != null) return `< ${high}`;
  if (low != null) return `> ${low}`;
  return null;
}

/** Parses "3.5–5.2", "3.5-5.2", "<5", "> 1.0" from a lab report. */
export function parseRange(text: string | null | undefined): { low?: number; high?: number } | null {
  if (!text) return null;
  const t = text.replace(/,/g, '.').trim();
  const between = t.match(/^(-?\d+(?:\.\d+)?)\s*[-–—]\s*(-?\d+(?:\.\d+)?)/);
  if (between) return { low: Number(between[1]), high: Number(between[2]) };
  const below = t.match(/^(?:<|≤|<=|up to)\s*(-?\d+(?:\.\d+)?)/i);
  if (below) return { high: Number(below[1]) };
  const above = t.match(/^(?:>|≥|>=)\s*(-?\d+(?:\.\d+)?)/);
  if (above) return { low: Number(above[1]) };
  return null;
}

export function parseNumber(value: string): number | null {
  const m = value.replace(/,/g, '.').match(/^[<>≤≥]?\s*(-?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/**
 * Flags a result. A range typed from the lab report takes precedence over the catalogue range;
 * critical limits always come from the catalogue.
 */
export function flagResult(analyteCode: string | null, value: string, sex: Sex, reportRange?: string | null): Flag {
  const a = analyteCode ? ANALYTES_BY_CODE.get(analyteCode) : undefined;
  const v = value.trim();
  if (!v) return null;
  if (a?.options) {
    return a.abnormal?.some((x) => x.toLowerCase() === v.toLowerCase()) ? 'A' : null;
  }
  const n = parseNumber(v);
  if (n == null) {
    return /positive|reactive|detected|grown|isolated/i.test(v) && !/non-?reactive|not detected|no growth/i.test(v) ? 'A' : null;
  }
  if (a?.criticalLow != null && n < a.criticalLow) return 'LL';
  if (a?.criticalHigh != null && n > a.criticalHigh) return 'HH';
  const range = parseRange(reportRange) ?? (a ? rangeFor(a, sex) : null);
  if (!range) return null;
  if (range.low != null && n < range.low) return 'L';
  if (range.high != null && n > range.high) return 'H';
  return null;
}

/** Free rows on the results form for anything on a report that isn't in the catalogue. */
export const EXTRA_RESULT_ROWS = 4;
