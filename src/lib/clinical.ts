import 'server-only';
import { isClinical, type ClinicalRole } from '@/lib/auth';
import { query, sql, transaction } from '@/lib/db';
import type { CurrentUser } from '@/lib/session';
import { DRUGS } from '@/clinical/drugs';
import { LEAFLETS } from '@/clinical/leaflets';
import { PROTOCOLS } from '@/clinical/protocols';
import { TRIAGE_VERSION, type TriageCategory } from '@/clinical/triage';

export type NoteVisibility = 'clinical' | 'staff' | 'patient';
export type NoteType = 'consultation' | 'triage' | 'nursing' | 'procedure' | 'phone' | 'admin' | 'visit_summary' | 'addendum';
export type EncounterStatus = 'waiting' | 'triaged' | 'in_consultation' | 'completed' | 'left' | 'cancelled';

export const VISIBILITY_LABELS: Record<NoteVisibility, { label: string; help: string }> = {
  clinical: { label: 'Clinical staff only', help: 'Doctors, nurses, midwives and pharmacists.' },
  staff: { label: 'All staff', help: 'Also reception and admin. Use for practical information only.' },
  patient: { label: 'Shared with patient', help: "Also shown in the family's patient portal." },
};

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  consultation: 'Consultation',
  triage: 'Triage',
  nursing: 'Nursing',
  procedure: 'Procedure',
  phone: 'Phone / message',
  admin: 'Admin',
  visit_summary: 'Visit summary',
  addendum: 'Addendum',
};

export const ENCOUNTER_STATUS_LABELS: Record<EncounterStatus, string> = {
  waiting: 'Waiting for triage',
  triaged: 'Waiting for clinician',
  in_consultation: 'With clinician',
  completed: 'Completed',
  left: 'Left before seen',
  cancelled: 'Cancelled',
};

/** Which note visibilities a viewer may read. The one rule every query below goes through. */
export function readableVisibilities(viewer: Pick<CurrentUser, 'role' | 'clinicalRole'>): NoteVisibility[] {
  if (viewer.role === 'patient') return ['patient'];
  if (isClinical(viewer.clinicalRole)) return ['clinical', 'staff', 'patient'];
  return ['staff', 'patient'];
}

// ---------- Content approvals ----------

export interface ApprovalInfo {
  version: number;
  approvedBy: string;
  approvedAt: string;
  comments: string | null;
}

export async function getApprovals(): Promise<Map<string, ApprovalInfo>> {
  const rows = await sql<{ kind: string; slug: string; version: number; name: string; approved_at: string; comments: string | null }>`
    SELECT a.kind, a.slug, a.version, u.name, a.approved_at, a.comments FROM content_approvals a JOIN users u ON u.id = a.approved_by`;
  const map = new Map<string, ApprovalInfo>();
  for (const r of rows) map.set(`${r.kind}:${r.slug}:${r.version}`, { version: r.version, approvedBy: r.name, approvedAt: r.approved_at, comments: r.comments });
  return map;
}

export function approvalKey(kind: 'protocol' | 'drug' | 'leaflet' | 'triage', slug: string, version: number) {
  return `${kind}:${slug}:${version}`;
}

export function currentVersion(kind: 'protocol' | 'drug' | 'leaflet' | 'triage', slug: string): number | null {
  if (kind === 'triage') return slug === 'sats' ? TRIAGE_VERSION : null;
  if (kind === 'protocol') return PROTOCOLS.find((p) => p.slug === slug)?.version ?? null;
  if (kind === 'drug') return DRUGS.find((d) => d.code === slug)?.version ?? null;
  return LEAFLETS.find((l) => l.slug === slug)?.version ?? null;
}

// ---------- Encounters ----------

export interface EncounterRow {
  id: number;
  patient_id: number;
  family_id: number;
  first_name: string;
  last_name: string;
  mrn: string;
  date_of_birth: string | null;
  allergies: string | null;
  encounter_type: string;
  status: EncounterStatus;
  presenting_complaint: string;
  protocol_slug: string | null;
  arrived_at: string;
  triage_category: TriageCategory | null;
  triage_score: number | null;
  triage_discriminators: string[];
  triaged_at: string | null;
  triaged_by_name: string | null;
  clinician_id: number | null;
  clinician_name: string | null;
  consultation_started_at: string | null;
  completed_at: string | null;
  diagnosis: string | null;
  disposition: string | null;
  invoice_id: number | null;
  minutes_waiting: number;
}

const ENCOUNTER_SELECT = `
  SELECT e.*, p.family_id, p.first_name, p.last_name, p.mrn, p.date_of_birth, p.allergies,
    tu.name AS triaged_by_name, cu.name AS clinician_name,
    FLOOR(EXTRACT(EPOCH FROM (COALESCE(e.consultation_started_at, now()) - e.arrived_at)) / 60)::int AS minutes_waiting
  FROM encounters e
  JOIN patients p ON p.id = e.patient_id
  LEFT JOIN users tu ON tu.id = e.triaged_by
  LEFT JOIN users cu ON cu.id = e.clinician_id`;

/** Today's board: everyone still in the clinic, most urgent first, then longest waiting. */
export async function getQueue(): Promise<EncounterRow[]> {
  return query<EncounterRow>(
    `${ENCOUNTER_SELECT}
     WHERE e.status IN ('waiting', 'triaged', 'in_consultation')
        OR (e.status IN ('completed', 'left') AND e.completed_at >= now() - interval '12 hours')
     ORDER BY CASE e.status WHEN 'in_consultation' THEN 1 WHEN 'triaged' THEN 0 WHEN 'waiting' THEN 0 ELSE 2 END,
       CASE e.triage_category WHEN 'red' THEN 0 WHEN 'orange' THEN 1 WHEN 'yellow' THEN 2 WHEN 'green' THEN 3 ELSE 1 END,
       e.arrived_at`
  );
}

export async function getEncounter(id: number): Promise<EncounterRow | null> {
  return (await query<EncounterRow>(`${ENCOUNTER_SELECT} WHERE e.id = $1`, [id]))[0] ?? null;
}

export async function getPatientEncounters(patientId: number): Promise<EncounterRow[]> {
  return query<EncounterRow>(`${ENCOUNTER_SELECT} WHERE e.patient_id = $1 ORDER BY e.arrived_at DESC LIMIT 100`, [patientId]);
}

export async function getFamilyEncounters(familyId: number): Promise<EncounterRow[]> {
  return query<EncounterRow>(`${ENCOUNTER_SELECT} WHERE p.family_id = $1 AND e.status = 'completed' ORDER BY e.arrived_at DESC LIMIT 100`, [familyId]);
}

export interface ObservationRow {
  id: number;
  taken_at: string;
  taken_by_name: string | null;
  heart_rate: number | null;
  resp_rate: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  temperature: number | null;
  spo2: number | null;
  avpu: string | null;
  mobility: string | null;
  pain_score: number | null;
  glucose: number | null;
  weight_kg: number | null;
  trauma: boolean;
  tews: number | null;
}

export async function getObservations(encounterId: number): Promise<ObservationRow[]> {
  return sql<ObservationRow>`
    SELECT o.*, u.name AS taken_by_name FROM observations o LEFT JOIN users u ON u.id = o.taken_by
    WHERE o.encounter_id = ${encounterId} ORDER BY o.taken_at DESC`;
}

// ---------- Notes ----------

export interface NoteRow {
  id: number;
  patient_id: number;
  encounter_id: number | null;
  author_id: number;
  author_name: string;
  author_clinical_role: ClinicalRole | null;
  note_type: NoteType;
  visibility: NoteVisibility;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  body: string | null;
  amends_note_id: number | null;
  dictated: boolean;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

const NOTE_SELECT = `
  SELECT n.*, u.name AS author_name, u.clinical_role AS author_clinical_role
  FROM clinical_notes n JOIN users u ON u.id = n.author_id`;

export async function getNotesForPatient(patientId: number, viewer: Pick<CurrentUser, 'role' | 'clinicalRole'>): Promise<NoteRow[]> {
  return query<NoteRow>(
    `${NOTE_SELECT} WHERE n.patient_id = $1 AND n.visibility = ANY($2) AND (n.signed_at IS NOT NULL OR $3)
     ORDER BY n.created_at DESC LIMIT 300`,
    [patientId, readableVisibilities(viewer), isClinical(viewer.clinicalRole)]
  );
}

export async function getNotesForEncounter(encounterId: number, viewer: Pick<CurrentUser, 'role' | 'clinicalRole'>): Promise<NoteRow[]> {
  return query<NoteRow>(
    `${NOTE_SELECT} WHERE n.encounter_id = $1 AND n.visibility = ANY($2) AND (n.signed_at IS NOT NULL OR $3)
     ORDER BY n.created_at`,
    [encounterId, readableVisibilities(viewer), isClinical(viewer.clinicalRole)]
  );
}

export async function getNote(id: number): Promise<NoteRow | null> {
  return (await query<NoteRow>(`${NOTE_SELECT} WHERE n.id = $1`, [id]))[0] ?? null;
}

/** Shared notes a family may see in the portal (signed, visibility = patient). */
export async function getPatientPortalNotes(familyId: number): Promise<(NoteRow & { patient_name: string })[]> {
  return query(
    `SELECT n.*, u.name AS author_name, u.clinical_role AS author_clinical_role, p.first_name || ' ' || p.last_name AS patient_name
     FROM clinical_notes n JOIN users u ON u.id = n.author_id JOIN patients p ON p.id = n.patient_id
     WHERE p.family_id = $1 AND n.visibility = 'patient' AND n.signed_at IS NOT NULL
     ORDER BY n.created_at DESC LIMIT 100`,
    [familyId]
  );
}

// ---------- Prescriptions ----------

export interface PrescriptionRow {
  id: number;
  patient_id: number;
  encounter_id: number | null;
  prescriber_id: number;
  prescriber_name: string;
  registration_number: string | null;
  status: 'draft' | 'issued' | 'cancelled';
  leaflet_slugs: string[];
  notes: string | null;
  allergy_override_reason: string | null;
  issued_at: string | null;
  created_at: string;
}

export interface PrescriptionItemRow {
  id: number;
  prescription_id: number;
  drug_code: string | null;
  drug_name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string | null;
  quantity: string | null;
  instructions: string | null;
}

const RX_SELECT = `SELECT r.*, u.name AS prescriber_name, u.registration_number FROM prescriptions r JOIN users u ON u.id = r.prescriber_id`;

export async function getPrescription(id: number): Promise<PrescriptionRow | null> {
  return (await query<PrescriptionRow>(`${RX_SELECT} WHERE r.id = $1`, [id]))[0] ?? null;
}

export async function getEncounterPrescriptions(encounterId: number): Promise<PrescriptionRow[]> {
  return query<PrescriptionRow>(`${RX_SELECT} WHERE r.encounter_id = $1 ORDER BY r.created_at`, [encounterId]);
}

export async function getPatientPrescriptions(patientId: number): Promise<PrescriptionRow[]> {
  return query<PrescriptionRow>(`${RX_SELECT} WHERE r.patient_id = $1 AND r.status <> 'draft' ORDER BY r.created_at DESC`, [patientId]);
}

export async function getFamilyPrescriptions(familyId: number): Promise<(PrescriptionRow & { patient_name: string })[]> {
  return query(
    `SELECT r.*, u.name AS prescriber_name, u.registration_number, p.first_name || ' ' || p.last_name AS patient_name
     FROM prescriptions r JOIN users u ON u.id = r.prescriber_id JOIN patients p ON p.id = r.patient_id
     WHERE p.family_id = $1 AND r.status = 'issued' ORDER BY r.issued_at DESC`,
    [familyId]
  );
}

export async function getPrescriptionItems(prescriptionIds: number[]): Promise<PrescriptionItemRow[]> {
  if (!prescriptionIds.length) return [];
  return sql<PrescriptionItemRow>`SELECT * FROM prescription_items WHERE prescription_id = ANY(${prescriptionIds}) ORDER BY sort_order, id`;
}

/** Returns the open draft prescription for a visit, creating one if needed. */
export async function ensureDraftPrescription(encounterId: number, patientId: number, prescriberId: number): Promise<number> {
  return transaction(async (q) => {
    const existing = await q<{ id: number }>`SELECT id FROM prescriptions WHERE encounter_id = ${encounterId} AND status = 'draft' AND prescriber_id = ${prescriberId} LIMIT 1`;
    if (existing[0]) return existing[0].id;
    const [row] = await q<{ id: number }>`INSERT INTO prescriptions (patient_id, encounter_id, prescriber_id) VALUES (${patientId}, ${encounterId}, ${prescriberId}) RETURNING id`;
    return row.id;
  });
}
