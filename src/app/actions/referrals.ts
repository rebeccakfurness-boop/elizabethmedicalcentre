'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/app/actions/auth';
import { can, canPrescribe, isClinical } from '@/lib/auth';
import { sql } from '@/lib/db';
import { isEmail, sendReferralEmail } from '@/lib/email';
import { fileFrom, saveUpload } from '@/lib/files';
import { errorMessage, num, str } from '@/lib/form';
import { buildReferralDraft, getReferral, type ReferralRow } from '@/lib/referrals';
import { audit, requireClinical, requireStaff } from '@/lib/session';
import { REFERRAL_KIND_LABELS, REFERRAL_TEMPLATES_BY_SLUG, URGENCY_LABELS, type ReferralKind, type ReferralUrgency } from '@/clinical/referrals';

function referralPath(id: number) {
  return `/dashboard/referrals/${id}`;
}

function revalidateReferral(r: Pick<ReferralRow, 'id' | 'patient_id' | 'encounter_id'>) {
  revalidatePath(referralPath(r.id));
  revalidatePath('/dashboard/referrals');
  revalidatePath(`/dashboard/patients/${r.patient_id}`);
  if (r.encounter_id) revalidatePath(`/dashboard/encounters/${r.encounter_id}`);
}

async function loadReferral(fd: FormData) {
  const id = num(fd, 'referral_id');
  return id ? getReferral(id) : null;
}

export async function createReferral(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const patientId = num(fd, 'patient_id');
  const encounterId = num(fd, 'encounter_id');
  const templateSlug = str(fd, 'template') ?? '';
  const template = REFERRAL_TEMPLATES_BY_SLUG.get(templateSlug);
  if (!patientId) return { error: 'Missing patient.' };
  if (!template) return { error: 'Choose what kind of referral this is.' };
  if (encounterId) {
    const ok = await sql`SELECT 1 FROM encounters WHERE id = ${encounterId} AND patient_id = ${patientId}`;
    if (!ok.length) return { error: 'That visit belongs to another patient.' };
  }
  let id: number;
  try {
    const d = await buildReferralDraft(template.slug, patientId, encounterId);
    const [row] = await sql<{ id: number }>`
      INSERT INTO referrals (patient_id, encounter_id, author_id, template, recipient_name, urgency, reason, history, examination,
        investigations, medications, allergies, management, request, attach_note_ids, attach_lab_order_ids)
      VALUES (${patientId}, ${encounterId}, ${user.id}, ${template.slug}, '', ${d.urgency}, ${d.reason}, ${d.history}, ${d.examination},
        ${d.investigations}, ${d.medications}, ${d.allergies}, ${d.management}, ${d.request}, ${d.attachNoteIds}, ${d.attachLabOrderIds})
      RETURNING id`;
    id = row.id;
    await audit(user.id, 'create', 'referral', id, template.slug);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(`/dashboard/patients/${patientId}`);
  redirect(referralPath(id));
}

const URGENCIES = Object.keys(URGENCY_LABELS) as ReferralUrgency[];

/** Saves a draft; with intent=finalise it also signs it, after which it can't be edited. */
export async function saveReferral(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const r = await loadReferral(fd);
  if (!r) return { error: 'Referral not found.' };
  if (r.status !== 'draft') return { error: 'This referral is signed and can no longer be edited. Write a new one if something has changed.' };
  if (r.author_id !== user.id && !canPrescribe(user.clinicalRole)) return { error: 'Only the author or a doctor can edit this referral.' };

  const contactId = num(fd, 'contact_id');
  const contact = contactId ? (await sql<{ id: number; name: string; organisation: string | null; email: string | null; specialty: string | null }>`
    SELECT id, name, organisation, email, specialty FROM referral_contacts WHERE id = ${contactId}`)[0] : null;
  // Picking a contact from the directory fills any recipient fields left blank.
  const recipientName = str(fd, 'recipient_name') ?? contact?.name ?? '';
  const recipientOrg = str(fd, 'recipient_organisation') ?? contact?.organisation ?? null;
  const recipientEmail = str(fd, 'recipient_email') ?? contact?.email ?? null;
  const specialty = str(fd, 'specialty') ?? contact?.specialty ?? null;
  const urgency = str(fd, 'urgency') as ReferralUrgency;
  if (!URGENCIES.includes(urgency)) return { error: 'Choose the urgency.' };
  if (recipientEmail && !isEmail(recipientEmail)) return { error: 'The recipient email address doesn’t look right.' };
  const noteIds = fd.getAll('attach_note').map(Number).filter(Boolean);
  const labIds = fd.getAll('attach_lab').map(Number).filter(Boolean);
  const consent = str(fd, 'consent_confirmed') === 'on';
  const finalise = str(fd, 'intent') === 'finalise';

  if (finalise) {
    if (!recipientName) return { error: 'Add who the letter is to (a person, team or department).' };
    if (!str(fd, 'reason')) return { error: 'Add the reason for referral.' };
    if (!consent) return { error: 'Confirm the patient agrees to this information being shared.' };
  }

  await sql`
    UPDATE referrals SET contact_id = ${contact?.id ?? null}, recipient_name = ${recipientName}, recipient_organisation = ${recipientOrg},
      recipient_email = ${recipientEmail}, specialty = ${specialty}, urgency = ${urgency},
      reason = ${str(fd, 'reason')}, history = ${str(fd, 'history')}, examination = ${str(fd, 'examination')},
      investigations = ${str(fd, 'investigations')}, medications = ${str(fd, 'medications')}, allergies = ${str(fd, 'allergies')},
      management = ${str(fd, 'management')}, request = ${str(fd, 'request')},
      attach_note_ids = ${noteIds}, attach_lab_order_ids = ${labIds}, consent_confirmed = ${consent},
      status = ${finalise ? 'finalised' : 'draft'}, finalised_at = ${finalise ? new Date() : null}, updated_at = now()
    WHERE id = ${r.id}`;
  await audit(user.id, finalise ? 'sign' : 'update', 'referral', r.id);
  revalidateReferral(r);
  return { ok: finalise ? 'Signed. Now email it, or print it for the patient.' : 'Draft saved.' };
}

export async function sendReferral(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const r = await loadReferral(fd);
  if (!r || !['finalised', 'sent', 'completed'].includes(r.status)) return { error: 'Sign the referral before sending it.' };
  const to = str(fd, 'to') ?? r.recipient_email;
  if (!to) return { error: 'Add the recipient’s email address.' };
  const copyPatient = str(fd, 'copy_patient') === 'on';
  const [patient] = await sql<{ email: string | null }>`SELECT email FROM patients WHERE id = ${r.patient_id}`;
  if (copyPatient && !patient?.email) return { error: 'The patient has no email address on their card.' };
  try {
    await sendReferralEmail(r.id, to);
    await audit(user.id, 'email', 'referral', r.id, to);
    if (copyPatient) {
      await sendReferralEmail(r.id, patient.email!, { toPatient: true });
      await audit(user.id, 'email_patient_copy', 'referral', r.id);
    }
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await sql`UPDATE referrals SET status = CASE WHEN status = 'completed' THEN status ELSE 'sent' END, sent_at = now(), sent_to = ${to},
    shared_with_patient = shared_with_patient OR ${copyPatient}, updated_at = now() WHERE id = ${r.id}`;
  revalidateReferral(r);
  return { ok: `Emailed to ${to}${copyPatient ? ' with a copy to the patient' : ''}.` };
}

/** For letters handed over on paper (ambulance crew, patient taking it to the hospital). */
export async function markReferralHandedOver(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const r = await loadReferral(fd);
  if (!r || r.status !== 'finalised') return { error: 'Sign the referral first.' };
  const how = str(fd, 'how') ?? 'Printed and given to the patient';
  await sql`UPDATE referrals SET status = 'sent', sent_at = now(), sent_to = ${how}, updated_at = now() WHERE id = ${r.id}`;
  await audit(user.id, 'handed_over', 'referral', r.id, how);
  revalidateReferral(r);
  return { ok: 'Marked as sent.' };
}

export async function setReferralSharing(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const r = await loadReferral(fd);
  if (!r || r.status === 'draft') return { error: 'Sign the referral first.' };
  if (r.author_id !== user.id && !canPrescribe(user.clinicalRole)) return { error: 'Only the author or a doctor can change this.' };
  const share = str(fd, 'share') === 'true';
  await sql`UPDATE referrals SET shared_with_patient = ${share}, updated_at = now() WHERE id = ${r.id}`;
  await audit(user.id, share ? 'share_patient' : 'unshare_patient', 'referral', r.id);
  revalidateReferral(r);
  revalidatePath('/portal');
  return { ok: share ? 'The patient can now download this letter in their portal.' : 'Removed from the patient portal.' };
}

/** The reply: what happened, plus the specialist's letter or discharge summary if there is one. */
export async function recordReferralOutcome(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const r = await loadReferral(fd);
  if (!r || !['finalised', 'sent', 'completed'].includes(r.status)) return { error: 'This referral hasn’t been sent.' };
  const notes = str(fd, 'outcome_notes');
  const file = fileFrom(fd, 'reply');
  if (!notes && !file) return { error: 'Add what happened, or upload the reply.' };
  try {
    const stored = file ? await saveUpload(file, { folder: 'referral-replies', uploadedBy: user.id, clinical: true }) : null;
    await sql`UPDATE referrals SET status = 'completed', outcome_notes = COALESCE(${notes}, outcome_notes),
      reply_file_id = COALESCE(${stored?.id ?? null}, reply_file_id), updated_at = now() WHERE id = ${r.id}`;
    await audit(user.id, 'outcome', 'referral', r.id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidateReferral(r);
  return { ok: 'Outcome recorded.' };
}

export async function cancelReferral(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const r = await loadReferral(fd);
  if (!r || ['completed', 'cancelled'].includes(r.status)) return { error: 'This referral can’t be cancelled.' };
  if (r.author_id !== user.id && !canPrescribe(user.clinicalRole)) return { error: 'Only the author or a doctor can cancel this.' };
  await sql`UPDATE referrals SET status = 'cancelled', updated_at = now() WHERE id = ${r.id}`;
  await audit(user.id, 'cancel', 'referral', r.id);
  revalidateReferral(r);
  return { ok: 'Referral cancelled.' };
}

// ---------- Directory ----------

const KINDS = Object.keys(REFERRAL_KIND_LABELS) as ReferralKind[];

/** Clinical staff and reception (patient managers) can keep the address book up to date. */
async function requireDirectoryEditor() {
  const user = await requireStaff();
  if (!isClinical(user.clinicalRole) && !can(user.role, 'managePatients')) redirect('/dashboard?denied=1');
  return user;
}

export async function saveReferralContact(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireDirectoryEditor();
  const id = num(fd, 'id');
  const name = str(fd, 'name');
  const kind = str(fd, 'kind') as ReferralKind;
  const email = str(fd, 'email');
  if (!name) return { error: 'Add a name (person, department or service).' };
  if (!KINDS.includes(kind)) return { error: 'Choose the type.' };
  if (email && !isEmail(email)) return { error: 'That email address doesn’t look right.' };
  const values = [name, str(fd, 'organisation'), kind, str(fd, 'specialty'), email, str(fd, 'phone'), str(fd, 'address'), str(fd, 'notes')];
  if (id) {
    await sql`UPDATE referral_contacts SET name = ${values[0]}, organisation = ${values[1]}, kind = ${values[2]}, specialty = ${values[3]},
      email = ${values[4]}, phone = ${values[5]}, address = ${values[6]}, notes = ${values[7]}, is_active = ${str(fd, 'is_active') !== 'false'}
      WHERE id = ${id}`;
    await audit(user.id, 'update', 'referral_contact', id);
  } else {
    const [row] = await sql<{ id: number }>`INSERT INTO referral_contacts (name, organisation, kind, specialty, email, phone, address, notes)
      VALUES (${values[0]}, ${values[1]}, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}, ${values[6]}, ${values[7]}) RETURNING id`;
    await audit(user.id, 'create', 'referral_contact', row.id);
  }
  revalidatePath('/dashboard/referrals/contacts');
  return { ok: id ? 'Contact saved.' : 'Contact added.' };
}
