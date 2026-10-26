import 'server-only';
import { query, sql } from '@/lib/db';
import type { ClinicalRole } from '@/lib/auth';
import { getEncounter, getObservations, getPrescriptionItems } from '@/lib/clinical';
import { formatDate } from '@/lib/format';
import { getLabResults, getPatientLabOrders, testNames, type LabOrderRow } from '@/lib/labs';
import { getPatient } from '@/lib/patients';
import type { ReferralKind, ReferralUrgency } from '@/clinical/referrals';
import { REFERRAL_TEMPLATES_BY_SLUG } from '@/clinical/referrals';

export type ReferralStatus = 'draft' | 'finalised' | 'sent' | 'completed' | 'cancelled';

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  draft: 'Draft',
  finalised: 'Signed: ready to send',
  sent: 'Sent',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export interface ReferralContact {
  id: number;
  name: string;
  organisation: string | null;
  kind: ReferralKind;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface ReferralRow {
  id: number;
  patient_id: number;
  family_id: number;
  first_name: string;
  last_name: string;
  mrn: string;
  date_of_birth: string | null;
  encounter_id: number | null;
  author_id: number;
  author_name: string;
  author_email: string;
  author_clinical_role: ClinicalRole | null;
  author_registration: string | null;
  contact_id: number | null;
  template: string;
  recipient_name: string;
  recipient_organisation: string | null;
  recipient_email: string | null;
  specialty: string | null;
  urgency: ReferralUrgency;
  reason: string | null;
  history: string | null;
  examination: string | null;
  investigations: string | null;
  medications: string | null;
  allergies: string | null;
  management: string | null;
  request: string | null;
  attach_note_ids: number[];
  attach_lab_order_ids: number[];
  consent_confirmed: boolean;
  status: ReferralStatus;
  finalised_at: string | null;
  sent_at: string | null;
  sent_to: string | null;
  shared_with_patient: boolean;
  outcome_notes: string | null;
  reply_file_id: number | null;
  created_at: string;
  updated_at: string;
}

const REFERRAL_SELECT = `
  SELECT r.*, p.family_id, p.first_name, p.last_name, p.mrn, p.date_of_birth,
    u.name AS author_name, u.email AS author_email, u.clinical_role AS author_clinical_role, u.registration_number AS author_registration
  FROM referrals r JOIN patients p ON p.id = r.patient_id JOIN users u ON u.id = r.author_id`;

export async function getReferral(id: number): Promise<ReferralRow | null> {
  return (await query<ReferralRow>(`${REFERRAL_SELECT} WHERE r.id = $1`, [id]))[0] ?? null;
}

export async function listReferrals(status?: string): Promise<ReferralRow[]> {
  if (status === 'open') {
    return query<ReferralRow>(`${REFERRAL_SELECT} WHERE r.status IN ('draft', 'finalised', 'sent') ORDER BY r.updated_at DESC LIMIT 200`);
  }
  return query<ReferralRow>(`${REFERRAL_SELECT} ORDER BY r.updated_at DESC LIMIT 200`);
}

export async function getPatientReferrals(patientId: number): Promise<ReferralRow[]> {
  return query<ReferralRow>(`${REFERRAL_SELECT} WHERE r.patient_id = $1 ORDER BY r.created_at DESC`, [patientId]);
}

export async function getEncounterReferrals(encounterId: number): Promise<ReferralRow[]> {
  return query<ReferralRow>(`${REFERRAL_SELECT} WHERE r.encounter_id = $1 ORDER BY r.created_at`, [encounterId]);
}

export async function getPortalReferrals(familyId: number): Promise<(ReferralRow & { patient_name: string })[]> {
  return query(
    `SELECT x.*, x.first_name || ' ' || x.last_name AS patient_name FROM (${REFERRAL_SELECT}) x
     WHERE x.family_id = $1 AND x.shared_with_patient AND x.status IN ('finalised', 'sent', 'completed') ORDER BY x.created_at DESC`,
    [familyId]
  );
}

export async function getContacts(includeInactive = false): Promise<ReferralContact[]> {
  return includeInactive
    ? sql<ReferralContact>`SELECT * FROM referral_contacts ORDER BY is_active DESC, kind, organisation NULLS LAST, name`
    : sql<ReferralContact>`SELECT * FROM referral_contacts WHERE is_active ORDER BY kind, organisation NULLS LAST, name`;
}

/** Recent lab orders with results, for the "Investigations" section and attachments. */
export async function getRecentLabOrdersWithResults(patientId: number, days = 60): Promise<LabOrderRow[]> {
  const all = await getPatientLabOrders(patientId);
  const cutoff = Date.now() - days * 86400000;
  return all.filter((o) => o.result_count > 0 && o.status !== 'cancelled' && new Date(o.created_at).getTime() >= cutoff);
}

export async function summariseLabOrders(orders: LabOrderRow[]): Promise<string> {
  const results = await getLabResults(orders.map((o) => o.id));
  return orders
    .map((o) => {
      const rs = results.filter((r) => r.order_id === o.id);
      const values = rs.map((r) => `${r.name} ${r.value}${r.unit ? ` ${r.unit}` : ''}${r.flag ? ` (${r.flag === 'A' ? 'abnormal' : r.flag})` : ''}`).join(', ');
      return `${formatDate(o.collected_at ?? o.created_at)} ${testNames(o)}: ${values}`;
    })
    .join('\n');
}

export interface ReferralDraft {
  urgency: ReferralUrgency;
  specialty: string | null;
  reason: string;
  history: string;
  examination: string;
  investigations: string;
  medications: string;
  allergies: string;
  management: string;
  request: string;
  attachNoteIds: number[];
  attachLabOrderIds: number[];
}

/**
 * Pre-fills a letter from the visit: diagnosis, the doctor's SOAP note, latest observations,
 * recent results, medicines and allergies. The clinician edits everything before signing.
 */
export async function buildReferralDraft(templateSlug: string, patientId: number, encounterId: number | null): Promise<ReferralDraft> {
  const template = REFERRAL_TEMPLATES_BY_SLUG.get(templateSlug);
  if (!template) throw new Error('Choose a referral template.');
  const patient = await getPatient(patientId);
  if (!patient) throw new Error('Patient not found.');
  const enc = encounterId ? await getEncounter(encounterId) : null;

  const notes = enc
    ? await sql<{ id: number; subjective: string | null; objective: string | null; assessment: string | null; plan: string | null; body: string | null; note_type: string }>`
        SELECT id, subjective, objective, assessment, plan, body, note_type FROM clinical_notes
        WHERE encounter_id = ${enc.id} AND signed_at IS NOT NULL AND note_type IN ('consultation', 'triage', 'nursing', 'procedure')
        ORDER BY created_at`
    : [];
  const soap = [...notes].reverse().find((n) => n.note_type === 'consultation');
  const obs = enc ? (await getObservations(enc.id))[0] : undefined;
  const obsLine = obs
    ? [
        obs.heart_rate != null ? `HR ${obs.heart_rate}` : null,
        obs.resp_rate != null ? `RR ${obs.resp_rate}` : null,
        obs.systolic_bp != null ? `BP ${obs.systolic_bp}/${obs.diastolic_bp ?? '?'}` : null,
        obs.temperature != null ? `T ${obs.temperature}°C` : null,
        obs.spo2 != null ? `SpO₂ ${obs.spo2}%` : null,
        obs.avpu ? `AVPU ${obs.avpu}` : null,
        obs.glucose != null ? `glucose ${obs.glucose} mmol/L` : null,
        obs.weight_kg != null ? `weight ${obs.weight_kg} kg` : null,
      ]
        .filter(Boolean)
        .join(', ') + ` (${new Date(obs.taken_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' })})`
    : '';

  const rxItems = enc
    ? await getPrescriptionItems(
        (await sql<{ id: number }>`SELECT id FROM prescriptions WHERE encounter_id = ${enc.id} AND status = 'issued'`).map((r) => r.id)
      )
    : [];
  const meds = [
    patient.current_medications ? `Regular: ${patient.current_medications}` : null,
    ...rxItems.map((i) => `${i.drug_name} ${i.dose} ${i.route} ${i.frequency}${i.duration ? ` for ${i.duration}` : ''} (prescribed today)`),
  ].filter(Boolean);

  const labOrders = await getRecentLabOrdersWithResults(patientId);
  const triage = enc?.triage_category ? `Triage: ${enc.triage_category.toUpperCase()}${enc.triage_score != null ? ` (TEWS ${enc.triage_score})` : ''}.` : '';

  return {
    urgency: template.urgency,
    specialty: null,
    reason: enc ? (enc.diagnosis ?? enc.presenting_complaint) : '',
    history: [enc ? `Presented with: ${enc.presenting_complaint}.` : null, soap?.subjective ?? null].filter(Boolean).join('\n'),
    examination: [soap?.objective ?? null, obsLine ? `Latest observations: ${obsLine}.` : null, triage || null].filter(Boolean).join('\n'),
    investigations: labOrders.length ? await summariseLabOrders(labOrders) : 'None yet.',
    medications: meds.length ? meds.join('\n') : 'None.',
    allergies: patient.allergies ?? 'No known allergies.',
    management: [soap?.assessment ? `Impression: ${soap.assessment}` : null, soap?.plan ?? null].filter(Boolean).join('\n'),
    request: template.request,
    attachNoteIds: notes.map((n) => n.id),
    attachLabOrderIds: labOrders.map((o) => o.id),
  };
}
