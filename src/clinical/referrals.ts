// Referral letter templates. The letter form is pre-filled from the visit; each template sets
// the wording, default urgency and what the receiving clinician is asked to do.

export type ReferralKind = 'hospital' | 'specialist' | 'allied_health' | 'imaging' | 'other';
export type ReferralUrgency = 'routine' | 'soon' | 'urgent' | 'emergency';

export const REFERRAL_KIND_LABELS: Record<ReferralKind, string> = {
  hospital: 'Hospital',
  specialist: 'Specialist',
  allied_health: 'Allied health',
  imaging: 'Imaging / radiology',
  other: 'Other',
};

export const URGENCY_LABELS: Record<ReferralUrgency, { label: string; help: string }> = {
  emergency: { label: 'Emergency', help: 'Transfer now' },
  urgent: { label: 'Urgent', help: 'Within 24 hours' },
  soon: { label: 'Soon', help: 'Within 2 weeks' },
  routine: { label: 'Routine', help: 'Next available appointment' },
};

export const SPECIALTIES: Record<Exclude<ReferralKind, 'other'>, string[]> = {
  hospital: ['Emergency department', 'Internal medicine', 'Paediatrics', 'Obstetrics & gynaecology', 'Surgery', 'Orthopaedics', 'Intensive care'],
  specialist: [
    'Internal medicine',
    'Paediatrics',
    'Obstetrics & gynaecology',
    'General surgery',
    'Orthopaedics',
    'ENT',
    'Ophthalmology',
    'Dermatology',
    'Cardiology',
    'Neurology',
    'Psychiatry',
    'Infectious diseases',
    'Dental / oral surgery',
  ],
  allied_health: ['Physiotherapy', 'Dietitian', 'Psychology / counselling', 'Wound care nursing', 'Occupational therapy', 'Speech therapy', 'Pharmacist'],
  imaging: ['X-ray', 'Ultrasound', 'CT', 'MRI'],
};

export interface ReferralTemplate {
  slug: string;
  title: string;
  kind: ReferralKind;
  urgency: ReferralUrgency;
  description: string;
  /** Opening sentence after "Dear …". {patient} and {age} are filled in. */
  opening: string;
  /** Default wording for "What I am asking". */
  request: string;
  /** Section headings, so the same fields read naturally for each kind of letter. */
  headings: { reason: string; history: string; examination: string; management: string };
  /** Hints shown under the fields. */
  hints?: Partial<Record<'history' | 'examination' | 'management' | 'request', string>>;
}

const STANDARD_HEADINGS = { reason: 'Reason for referral', history: 'History', examination: 'Examination and observations', management: 'Management so far' };

export const REFERRAL_TEMPLATES: ReferralTemplate[] = [
  {
    slug: 'emergency-transfer',
    title: 'Emergency transfer to hospital',
    kind: 'hospital',
    urgency: 'emergency',
    description: 'Patient is being transferred now. Hand the printed letter to the ambulance crew.',
    opening: 'I am transferring {patient} ({age}) to your emergency department for urgent assessment.',
    request: 'Please assess and manage urgently. I have spoken to the receiving team by phone.',
    headings: { reason: 'Reason for transfer', history: 'History', examination: 'Condition at transfer (ABCDE and latest observations)', management: 'Treatment given before transfer' },
    hints: {
      examination: 'Airway, breathing, circulation, disability, exposure; latest set of observations with time.',
      management: 'Fluids, drugs with doses and times, IV access, oxygen. Mode of transport and who is escorting.',
    },
  },
  {
    slug: 'hospital-admission',
    title: 'Hospital admission (not an emergency)',
    kind: 'hospital',
    urgency: 'urgent',
    description: 'For example dengue with warning signs, dehydration needing IV fluids, or a fracture needing a plaster.',
    opening: 'Thank you for seeing {patient} ({age}), who I am referring for admission and inpatient care.',
    request: 'Please assess for admission and ongoing management.',
    headings: STANDARD_HEADINGS,
  },
  {
    slug: 'specialist',
    title: 'Specialist opinion',
    kind: 'specialist',
    urgency: 'soon',
    description: 'Outpatient review by a specialist.',
    opening: 'Thank you for seeing {patient} ({age}). I would be grateful for your opinion.',
    request: 'Please assess and advise on further investigation and management.',
    headings: STANDARD_HEADINGS,
    hints: { request: 'The specific question you want answered, e.g. "Does this need surgical repair?"' },
  },
  {
    slug: 'allied-health',
    title: 'Allied health referral',
    kind: 'allied_health',
    urgency: 'routine',
    description: 'Physiotherapy, dietitian, psychology, wound care and similar.',
    opening: 'Thank you for seeing {patient} ({age}) for assessment and treatment.',
    request: 'Please assess and treat as appropriate.',
    headings: { reason: 'Reason for referral', history: 'Relevant history', examination: 'Current function and findings', management: 'Precautions and goals' },
    hints: { management: 'Anything to avoid (weight-bearing limits, wound status), and what the patient hopes to achieve.' },
  },
  {
    slug: 'imaging',
    title: 'Imaging request (X-ray, ultrasound, CT)',
    kind: 'imaging',
    urgency: 'urgent',
    description: 'Request for imaging with a clear clinical question.',
    opening: 'Please perform imaging for {patient} ({age}).',
    request: 'Please send the report to the clinic by email.',
    headings: { reason: 'Examination requested and clinical question', history: 'Clinical history', examination: 'Relevant findings', management: 'Safety information' },
    hints: { management: 'Pregnancy status, kidney function and contrast allergy where relevant.' },
  },
  {
    slug: 'rabies-pep',
    title: 'Rabies post-exposure treatment',
    kind: 'hospital',
    urgency: 'urgent',
    description: 'For rabies immunoglobulin and/or vaccine doses the clinic cannot give.',
    opening: 'I am referring {patient} ({age}) for rabies post-exposure prophylaxis following an animal exposure.',
    request: 'Please give rabies immunoglobulin (if available) and continue the vaccine course.',
    headings: { reason: 'Exposure', history: 'Details of the exposure', examination: 'Wound(s)', management: 'Treatment given so far' },
    hints: {
      history: 'Animal, date and place, provoked or not, whether the animal can be observed. WHO category.',
      management: 'Wound washing, vaccine doses given (date, product, route), tetanus status.',
    },
  },
];

export const REFERRAL_TEMPLATES_BY_SLUG = new Map(REFERRAL_TEMPLATES.map((t) => [t.slug, t]));

export function fillOpening(t: ReferralTemplate, patient: string, age: number | null): string {
  return t.opening.replace('{patient}', patient).replace('{age}', age != null ? `aged ${age}` : 'age unknown');
}
