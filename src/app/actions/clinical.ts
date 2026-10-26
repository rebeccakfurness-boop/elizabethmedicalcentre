'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/app/actions/auth';
import { canPrescribe, isClinical } from '@/lib/auth';
import {
  currentVersion,
  ensureDraftPrescription,
  getEncounter,
  getNote,
  getPrescription,
  getPrescriptionItems,
  type NoteType,
  type NoteVisibility,
} from '@/lib/clinical';
import { sql, transaction } from '@/lib/db';
import { errorMessage, num, str } from '@/lib/form';
import { ageFrom } from '@/lib/format';
import { audit, requireClinical, requirePermission, requirePrescriber } from '@/lib/session';
import { allergyWarnings, DRUGS_BY_CODE } from '@/clinical/drugs';
import { LEAFLETS_BY_SLUG } from '@/clinical/leaflets';
import { PROTOCOLS_BY_SLUG } from '@/clinical/protocols';
import { computeTriage, DISCRIMINATORS, TRIAGE_ORDER, worst, type TriageCategory, type Vitals } from '@/clinical/triage';

const VISIBILITIES: NoteVisibility[] = ['clinical', 'staff', 'patient'];
const NOTE_TYPES: NoteType[] = ['consultation', 'triage', 'nursing', 'procedure', 'phone', 'admin', 'visit_summary'];
const ENCOUNTER_TYPES = ['walk_in', 'appointment', 'home_visit', 'telemedicine', 'follow_up'];

function encounterPath(id: number) {
  return `/dashboard/encounters/${id}`;
}

// ---------- Visits ----------

/** Check-in can be done by any staff member (reception), not just clinical staff. */
export async function checkInPatient(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('viewPatients');
  const patientId = num(fd, 'patient_id');
  const complaint = str(fd, 'presenting_complaint');
  const type = str(fd, 'encounter_type') ?? 'walk_in';
  if (!patientId) return { error: 'Choose a patient.' };
  if (!complaint) return { error: 'Enter the reason for the visit.' };
  if (!ENCOUNTER_TYPES.includes(type)) return { error: 'Choose the visit type.' };
  const open = await sql`SELECT 1 FROM encounters WHERE patient_id = ${patientId} AND status IN ('waiting', 'triaged', 'in_consultation')`;
  if (open.length) return { error: 'This patient is already checked in.' };
  const [row] = await sql<{ id: number }>`
    INSERT INTO encounters (patient_id, encounter_type, presenting_complaint, created_by)
    VALUES (${patientId}, ${type}, ${complaint}, ${user.id}) RETURNING id`;
  await audit(user.id, 'check_in', 'encounter', row.id);
  revalidatePath('/dashboard/clinic');
  if (str(fd, 'then') === 'open' && isClinical(user.clinicalRole)) redirect(encounterPath(row.id));
  return { ok: 'Checked in. They are now on the clinic board.' };
}

export async function setEncounterStatus(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('viewPatients');
  const id = num(fd, 'id');
  const status = str(fd, 'status');
  if (!id || !status || !['left', 'cancelled'].includes(status)) return { error: 'Invalid change.' };
  await sql`UPDATE encounters SET status = ${status}, completed_at = now() WHERE id = ${id} AND status IN ('waiting', 'triaged')`;
  await audit(user.id, `encounter_${status}`, 'encounter', id);
  revalidatePath('/dashboard/clinic');
  return { ok: status === 'left' ? 'Marked as left before being seen.' : 'Visit cancelled.' };
}

function intOrNull(fd: FormData, name: string): number | null {
  const v = num(fd, name);
  return v == null ? null : Math.round(v);
}

function readVitals(fd: FormData, ageYears: number | null): Vitals & { diastolicBp: number | null; weightKg: number | null } {
  const avpu = str(fd, 'avpu') as Vitals['avpu'];
  const mobility = str(fd, 'mobility') as Vitals['mobility'];
  return {
    ageYears,
    heartRate: intOrNull(fd, 'heart_rate'),
    respRate: intOrNull(fd, 'resp_rate'),
    systolicBp: intOrNull(fd, 'systolic_bp'),
    diastolicBp: intOrNull(fd, 'diastolic_bp'),
    temperature: num(fd, 'temperature'),
    spo2: intOrNull(fd, 'spo2'),
    avpu: avpu && ['alert', 'confused', 'voice', 'pain', 'unresponsive'].includes(avpu) ? avpu : null,
    mobility: mobility && ['walking', 'with_help', 'stretcher'].includes(mobility) ? mobility : null,
    trauma: str(fd, 'trauma') === 'on',
    glucose: num(fd, 'glucose'),
    painScore: intOrNull(fd, 'pain_score'),
    weightKg: num(fd, 'weight_kg'),
  };
}

function validateVitals(v: ReturnType<typeof readVitals>): string | null {
  const range = (val: number | null | undefined, lo: number, hi: number, label: string) =>
    val != null && (val < lo || val > hi) ? `${label} ${val} looks wrong. Please check it.` : null;
  return (
    range(v.heartRate, 20, 250, 'Heart rate') ??
    range(v.respRate, 4, 90, 'Breathing rate') ??
    range(v.systolicBp, 40, 280, 'Systolic BP') ??
    range(v.temperature, 30, 44, 'Temperature') ??
    range(v.spo2, 50, 100, 'SpO2') ??
    range(v.glucose, 0.5, 40, 'Glucose') ??
    range(v.painScore, 0, 10, 'Pain score') ??
    range(v.weightKg, 0.5, 300, 'Weight')
  );
}

async function insertObservation(encounterId: number, userId: number, v: ReturnType<typeof readVitals>, tews: number | null) {
  await sql`INSERT INTO observations (encounter_id, taken_by, heart_rate, resp_rate, systolic_bp, diastolic_bp, temperature, spo2, avpu, mobility,
      pain_score, glucose, weight_kg, trauma, tews)
    VALUES (${encounterId}, ${userId}, ${v.heartRate}, ${v.respRate}, ${v.systolicBp}, ${v.diastolicBp}, ${v.temperature}, ${v.spo2}, ${v.avpu},
      ${v.mobility}, ${v.painScore}, ${v.glucose}, ${v.weightKg}, ${!!v.trauma}, ${tews})`;
}

/** Records triage. The clinician may raise the suggested category but not lower it. */
export async function saveTriage(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const id = num(fd, 'encounter_id');
  if (!id) return { error: 'Missing visit.' };
  const enc = await getEncounter(id);
  if (!enc || ['completed', 'left', 'cancelled'].includes(enc.status)) return { error: 'This visit is closed.' };
  const age = ageFrom(enc.date_of_birth);
  const v = readVitals(fd, age);
  const problem = validateVitals(v);
  if (problem) return { error: problem };
  const discriminators = fd.getAll('discriminators').map(String).filter((c) => DISCRIMINATORS.some((d) => d.code === c));
  const result = computeTriage(v, discriminators);
  const chosen = str(fd, 'category') as TriageCategory | null;
  const category = chosen && TRIAGE_ORDER.includes(chosen) ? worst(chosen, result.category) : result.category;
  const protocol = str(fd, 'protocol_slug');

  await insertObservation(id, user.id, v, result.tews);
  await sql`UPDATE encounters SET triage_category = ${category}, triage_score = ${result.tews}, triage_discriminators = ${discriminators},
      triaged_at = now(), triaged_by = ${user.id}, status = CASE WHEN status = 'waiting' THEN 'triaged' ELSE status END,
      protocol_slug = COALESCE(${protocol && PROTOCOLS_BY_SLUG.has(protocol) ? protocol : null}, protocol_slug)
    WHERE id = ${id}`;
  const note = str(fd, 'triage_note');
  if (note) {
    await sql`INSERT INTO clinical_notes (patient_id, encounter_id, author_id, note_type, visibility, body, signed_at)
      VALUES (${enc.patient_id}, ${id}, ${user.id}, 'triage', 'clinical', ${note}, now())`;
  }
  await audit(user.id, `triage_${category}`, 'encounter', id);
  revalidatePath(encounterPath(id));
  revalidatePath('/dashboard/clinic');
  return { ok: `Triaged ${category.toUpperCase()}.` };
}

export async function addObservations(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const id = num(fd, 'encounter_id');
  if (!id) return { error: 'Missing visit.' };
  const enc = await getEncounter(id);
  if (!enc) return { error: 'Visit not found.' };
  const v = readVitals(fd, ageFrom(enc.date_of_birth));
  const problem = validateVitals(v);
  if (problem) return { error: problem };
  const r = computeTriage(v, []);
  await insertObservation(id, user.id, v, r.tews);
  await audit(user.id, 'observations', 'encounter', id);
  revalidatePath(encounterPath(id));
  const worse = enc.triage_category && TRIAGE_ORDER.indexOf(r.category) < TRIAGE_ORDER.indexOf(enc.triage_category);
  return { ok: worse ? `Saved. Warning: these observations score ${r.category.toUpperCase()}, more urgent than the triage category. Escalate now.` : 'Observations saved.' };
}

export async function startConsultation(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const id = num(fd, 'encounter_id');
  if (!id) return { error: 'Missing visit.' };
  await sql`UPDATE encounters SET clinician_id = ${user.id}, status = 'in_consultation', consultation_started_at = COALESCE(consultation_started_at, now())
    WHERE id = ${id} AND status IN ('waiting', 'triaged', 'in_consultation')`;
  await audit(user.id, 'start_consultation', 'encounter', id);
  revalidatePath('/dashboard/clinic');
  redirect(encounterPath(id));
}

export async function setProtocol(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const id = num(fd, 'encounter_id');
  const slug = str(fd, 'protocol_slug');
  if (!id) return { error: 'Missing visit.' };
  if (slug && !PROTOCOLS_BY_SLUG.has(slug)) return { error: 'Unknown protocol.' };
  await sql`UPDATE encounters SET protocol_slug = ${slug} WHERE id = ${id}`;
  await audit(user.id, 'set_protocol', 'encounter', id, slug ?? 'none');
  revalidatePath(encounterPath(id));
  return { ok: slug ? 'Protocol selected.' : 'Protocol cleared.' };
}

export async function completeEncounter(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const id = num(fd, 'encounter_id');
  const diagnosis = str(fd, 'diagnosis');
  const disposition = str(fd, 'disposition');
  if (!id) return { error: 'Missing visit.' };
  if (!diagnosis) return { error: 'Enter a diagnosis or working impression.' };
  if (!disposition) return { error: 'Choose where the patient is going.' };
  const enc = await getEncounter(id);
  if (!enc || ['completed', 'left', 'cancelled'].includes(enc.status)) return { error: 'This visit is already closed.' };
  const unsigned = await sql`SELECT 1 FROM clinical_notes WHERE encounter_id = ${id} AND signed_at IS NULL LIMIT 1`;
  if (unsigned.length) return { error: 'Sign or delete the draft notes on this visit first.' };
  const drafts = await sql`SELECT 1 FROM prescriptions p WHERE encounter_id = ${id} AND status = 'draft' AND EXISTS (SELECT 1 FROM prescription_items i WHERE i.prescription_id = p.id) LIMIT 1`;
  if (drafts.length) return { error: 'Issue or cancel the draft prescription first.' };

  const summary = str(fd, 'patient_summary');
  await transaction(async (q) => {
    await q`UPDATE encounters SET status = 'completed', completed_at = now(), diagnosis = ${diagnosis}, disposition = ${disposition},
        clinician_id = COALESCE(clinician_id, ${user.id}) WHERE id = ${id}`;
    if (summary) {
      await q`INSERT INTO clinical_notes (patient_id, encounter_id, author_id, note_type, visibility, body, signed_at)
        VALUES (${enc.patient_id}, ${id}, ${user.id}, 'visit_summary', 'patient', ${summary}, now())`;
    }
  });
  await audit(user.id, 'complete', 'encounter', id);
  revalidatePath(encounterPath(id));
  revalidatePath('/dashboard/clinic');
  return { ok: 'Visit completed.' };
}

// ---------- Notes ----------

export async function saveNote(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('viewPatients');
  const clinical = isClinical(user.clinicalRole);
  const noteId = num(fd, 'note_id');
  const patientId = num(fd, 'patient_id');
  const encounterId = num(fd, 'encounter_id');
  const type = (str(fd, 'note_type') ?? 'consultation') as NoteType;
  let visibility = (str(fd, 'visibility') ?? 'clinical') as NoteVisibility;
  const sign = str(fd, 'intent') === 'sign';
  if (!patientId) return { error: 'Missing patient.' };
  if (!NOTE_TYPES.includes(type) || !VISIBILITIES.includes(visibility)) return { error: 'Choose a note type and who can see it.' };
  // Non-clinical staff (reception/admin) may only write practical admin notes for all staff.
  if (!clinical) {
    if (type !== 'admin') return { error: 'Only clinical staff can write clinical notes.' };
    visibility = 'staff';
  }
  const fields = {
    subjective: str(fd, 'subjective'),
    objective: str(fd, 'objective'),
    assessment: str(fd, 'assessment'),
    plan: str(fd, 'plan'),
    body: str(fd, 'body'),
  };
  if (!Object.values(fields).some(Boolean)) return { error: 'The note is empty.' };
  const dictated = str(fd, 'dictated') === 'true';

  let id = noteId;
  if (noteId) {
    const existing = await getNote(noteId);
    if (!existing || existing.author_id !== user.id) return { error: 'You can only edit your own notes.' };
    if (existing.signed_at) return { error: 'Signed notes cannot be changed. Add an addendum instead.' };
    await sql`UPDATE clinical_notes SET note_type = ${type}, visibility = ${visibility}, subjective = ${fields.subjective}, objective = ${fields.objective},
        assessment = ${fields.assessment}, plan = ${fields.plan}, body = ${fields.body}, dictated = dictated OR ${dictated},
        signed_at = ${sign ? new Date().toISOString() : null}, updated_at = now() WHERE id = ${noteId}`;
  } else {
    const [row] = await sql<{ id: number }>`
      INSERT INTO clinical_notes (patient_id, encounter_id, author_id, note_type, visibility, subjective, objective, assessment, plan, body, dictated, signed_at)
      VALUES (${patientId}, ${encounterId}, ${user.id}, ${type}, ${visibility}, ${fields.subjective}, ${fields.objective}, ${fields.assessment},
        ${fields.plan}, ${fields.body}, ${dictated}, ${sign || !clinical ? new Date().toISOString() : null})
      RETURNING id`;
    id = row.id;
  }
  await audit(user.id, sign ? 'sign_note' : 'save_note', 'clinical_note', id, visibility);
  if (encounterId) revalidatePath(encounterPath(encounterId));
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { ok: sign ? 'Note signed.' : 'Draft saved. Only you and other clinical staff can see drafts.' };
}

export async function deleteDraftNote(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const id = num(fd, 'note_id');
  const note = id ? await getNote(id) : null;
  if (!note || note.author_id !== user.id || note.signed_at) return { error: 'Only your own unsigned drafts can be deleted.' };
  await sql`DELETE FROM clinical_notes WHERE id = ${id}`;
  await audit(user.id, 'delete_draft', 'clinical_note', id);
  if (note.encounter_id) revalidatePath(encounterPath(note.encounter_id));
  return { ok: 'Draft deleted.' };
}

export async function addAddendum(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const id = num(fd, 'note_id');
  const body = str(fd, 'body');
  const note = id ? await getNote(id) : null;
  if (!note) return { error: 'Note not found.' };
  if (!body) return { error: 'Write the addendum.' };
  await sql`INSERT INTO clinical_notes (patient_id, encounter_id, author_id, note_type, visibility, body, amends_note_id, signed_at)
    VALUES (${note.patient_id}, ${note.encounter_id}, ${user.id}, 'addendum', ${note.visibility}, ${body}, ${note.id}, now())`;
  await audit(user.id, 'addendum', 'clinical_note', note.id);
  if (note.encounter_id) revalidatePath(encounterPath(note.encounter_id));
  revalidatePath(`/dashboard/patients/${note.patient_id}`);
  return { ok: 'Addendum added.' };
}

/** Changes who can see a signed note, e.g. sharing a summary with the patient later. */
export async function changeNoteVisibility(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const id = num(fd, 'note_id');
  const visibility = str(fd, 'visibility') as NoteVisibility;
  const note = id ? await getNote(id) : null;
  if (!note) return { error: 'Note not found.' };
  if (!VISIBILITIES.includes(visibility)) return { error: 'Choose who can see it.' };
  if (note.author_id !== user.id && !canPrescribe(user.clinicalRole)) return { error: 'Only the author or a doctor can change who sees this note.' };
  await sql`UPDATE clinical_notes SET visibility = ${visibility}, updated_at = now() WHERE id = ${note.id}`;
  await sql`UPDATE clinical_notes SET visibility = ${visibility} WHERE amends_note_id = ${note.id}`;
  await audit(user.id, `visibility_${visibility}`, 'clinical_note', note.id, `was ${note.visibility}`);
  if (note.encounter_id) revalidatePath(encounterPath(note.encounter_id));
  revalidatePath(`/dashboard/patients/${note.patient_id}`);
  return { ok: 'Sharing updated.' };
}

// ---------- Prescriptions ----------

export async function addPrescriptionItem(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePrescriber();
  const encounterId = num(fd, 'encounter_id');
  const enc = encounterId ? await getEncounter(encounterId) : null;
  if (!enc) return { error: 'Missing visit.' };
  const code = str(fd, 'drug_code');
  const drug = code ? DRUGS_BY_CODE.get(code) : undefined;
  const name = str(fd, 'drug_name') ?? drug?.name;
  const dose = str(fd, 'dose');
  const frequency = str(fd, 'frequency') ?? drug?.defaultFrequency ?? null;
  if (!name) return { error: 'Choose a medicine or type its name.' };
  if (!dose) return { error: 'Enter the dose (e.g. 500 mg, or 1 tablet).' };
  if (!frequency) return { error: 'Enter how often.' };
  const rxId = await ensureDraftPrescription(enc.id, enc.patient_id, user.id);
  await sql`INSERT INTO prescription_items (prescription_id, drug_code, drug_name, dose, route, frequency, duration, quantity, instructions, sort_order)
    VALUES (${rxId}, ${drug ? drug.code : null}, ${name}, ${dose}, ${str(fd, 'route') ?? drug?.defaultRoute ?? 'oral'}, ${frequency},
      ${str(fd, 'duration') ?? drug?.defaultDuration ?? null}, ${str(fd, 'quantity')}, ${str(fd, 'instructions')},
      (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM prescription_items WHERE prescription_id = ${rxId}))`;
  // Attach the protocol's leaflets automatically the first time.
  const protocol = enc.protocol_slug ? PROTOCOLS_BY_SLUG.get(enc.protocol_slug) : undefined;
  if (protocol?.leaflets.length) {
    await sql`UPDATE prescriptions SET leaflet_slugs = (SELECT ARRAY(SELECT DISTINCT unnest(leaflet_slugs || ${protocol.leaflets}::text[]))) WHERE id = ${rxId}`;
  }
  await audit(user.id, 'rx_add_item', 'prescription', rxId, name);
  revalidatePath(encounterPath(enc.id));
  const warnings = allergyWarnings(name, drug?.code ?? null, enc.allergies);
  return warnings.length ? { error: `Added, but check: ${warnings.map((w) => w.message).join(' ')}` } : { ok: `${name} added.` };
}

export async function removePrescriptionItem(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePrescriber();
  const itemId = num(fd, 'item_id');
  const rows = await sql<{ prescription_id: number; status: string; prescriber_id: number; encounter_id: number | null }>`
    SELECT i.prescription_id, p.status, p.prescriber_id, p.encounter_id FROM prescription_items i JOIN prescriptions p ON p.id = i.prescription_id WHERE i.id = ${itemId}`;
  const r = rows[0];
  if (!r || r.status !== 'draft' || r.prescriber_id !== user.id) return { error: 'Only items on your own draft prescription can be removed.' };
  await sql`DELETE FROM prescription_items WHERE id = ${itemId}`;
  if (r.encounter_id) revalidatePath(encounterPath(r.encounter_id));
  return { ok: 'Removed.' };
}

export async function setPrescriptionLeaflets(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePrescriber();
  const id = num(fd, 'prescription_id');
  const rx = id ? await getPrescription(id) : null;
  if (!rx || rx.prescriber_id !== user.id || rx.status !== 'draft') return { error: 'Only your own draft prescription can be changed.' };
  const slugs = fd.getAll('leaflets').map(String).filter((s) => LEAFLETS_BY_SLUG.has(s));
  await sql`UPDATE prescriptions SET leaflet_slugs = ${slugs}, notes = ${str(fd, 'notes')} WHERE id = ${rx.id}`;
  if (rx.encounter_id) revalidatePath(encounterPath(rx.encounter_id));
  return { ok: 'Saved.' };
}

export async function issuePrescription(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePrescriber();
  const id = num(fd, 'prescription_id');
  const rx = id ? await getPrescription(id) : null;
  if (!rx || rx.prescriber_id !== user.id || rx.status !== 'draft') return { error: 'Only your own draft prescription can be issued.' };
  const items = await getPrescriptionItems([rx.id]);
  if (!items.length) return { error: 'The prescription has no items.' };
  const allergies = (await sql<{ allergies: string | null }>`SELECT allergies FROM patients WHERE id = ${rx.patient_id}`)[0]?.allergies ?? null;
  const blocks = items.flatMap((i) => allergyWarnings(i.drug_name, i.drug_code, allergies).filter((w) => w.severity === 'block'));
  const override = str(fd, 'allergy_override_reason');
  if (blocks.length && !override) return { error: `Allergy conflict: ${blocks.map((b) => b.message).join(' ')} Remove the item, or record why it is safe to give.` };
  await sql`UPDATE prescriptions SET status = 'issued', issued_at = now(), allergy_override_reason = ${blocks.length ? override : null} WHERE id = ${rx.id}`;
  await audit(user.id, blocks.length ? 'rx_issue_allergy_override' : 'rx_issue', 'prescription', rx.id, override ?? undefined);
  if (rx.encounter_id) revalidatePath(encounterPath(rx.encounter_id));
  return { ok: 'Prescription issued. Print it with the drug information sheets for the patient.' };
}

export async function cancelPrescription(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePrescriber();
  const id = num(fd, 'prescription_id');
  const rx = id ? await getPrescription(id) : null;
  if (!rx || rx.status === 'cancelled') return { error: 'Prescription not found.' };
  if (rx.prescriber_id !== user.id) return { error: 'Only the prescriber can cancel this prescription.' };
  await sql`UPDATE prescriptions SET status = 'cancelled' WHERE id = ${rx.id}`;
  await audit(user.id, 'rx_cancel', 'prescription', rx.id);
  if (rx.encounter_id) revalidatePath(encounterPath(rx.encounter_id));
  return { ok: 'Prescription cancelled.' };
}

// ---------- Clinical content sign-off ----------

export async function approveContent(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePrescriber();
  const kind = str(fd, 'kind') as 'protocol' | 'drug' | 'leaflet' | 'triage';
  const slug = str(fd, 'slug');
  if (!slug || !['protocol', 'drug', 'leaflet', 'triage'].includes(kind)) return { error: 'Invalid item.' };
  const version = currentVersion(kind, slug);
  if (version == null) return { error: 'Unknown item.' };
  if (str(fd, 'confirm') !== 'on') return { error: 'Tick the box to confirm you have reviewed it.' };
  try {
    await sql`INSERT INTO content_approvals (kind, slug, version, approved_by, comments) VALUES (${kind}, ${slug}, ${version}, ${user.id}, ${str(fd, 'comments')})
      ON CONFLICT (kind, slug, version) DO NOTHING`;
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await audit(user.id, `approve_${kind}`, 'content', null, `${slug} v${version}`);
  revalidatePath('/dashboard/protocols');
  revalidatePath('/dashboard/formulary');
  return { ok: 'Approved for clinical use.' };
}
