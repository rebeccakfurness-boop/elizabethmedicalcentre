'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/app/actions/auth';
import { sql } from '@/lib/db';
import { dateStr, errorMessage, num, str } from '@/lib/form';
import { audit, requirePermission } from '@/lib/session';
import { createUser, resetUserPassword } from '@/lib/users';

function demographics(fd: FormData) {
  return {
    first_name: str(fd, 'first_name'),
    last_name: str(fd, 'last_name'),
    date_of_birth: dateStr(fd, 'date_of_birth'),
    sex: str(fd, 'sex'),
    nationality: str(fd, 'nationality'),
    id_number: str(fd, 'id_number'),
    phone: str(fd, 'phone'),
    email: str(fd, 'email')?.toLowerCase() ?? null,
    address: str(fd, 'address'),
    relationship: str(fd, 'relationship'),
    emergency_contact_name: str(fd, 'emergency_contact_name'),
    emergency_contact_phone: str(fd, 'emergency_contact_phone'),
    insurer_id: num(fd, 'insurer_id'),
    insurance_policy_number: str(fd, 'insurance_policy_number'),
    insurance_member_name: str(fd, 'insurance_member_name'),
    insurance_expiry: dateStr(fd, 'insurance_expiry'),
  };
}

export async function createPatient(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('managePatients');
  const d = demographics(fd);
  if (!d.first_name || !d.last_name) return { error: 'First and last name are required.' };
  let familyId = num(fd, 'family_id');
  let newId: number;
  try {
    if (!familyId) {
      const accountName = str(fd, 'account_name') ?? `${d.last_name} family`;
      const [f] = await sql<{ id: number }>`
        INSERT INTO families (account_name, billing_email, phone, address)
        VALUES (${accountName}, ${d.email}, ${d.phone}, ${d.address}) RETURNING id`;
      familyId = f.id;
    }
    const isHolder = !(await sql`SELECT 1 FROM patients WHERE family_id = ${familyId} LIMIT 1`).length;
    const [p] = await sql<{ id: number }>`
      INSERT INTO patients (family_id, is_account_holder, relationship, first_name, last_name, date_of_birth, sex, nationality, id_number,
        phone, email, address, emergency_contact_name, emergency_contact_phone, blood_type, allergies, medical_notes, current_medications,
        insurer_id, insurance_policy_number, insurance_member_name, insurance_expiry)
      VALUES (${familyId}, ${isHolder}, ${d.relationship ?? (isHolder ? 'Account holder' : null)}, ${d.first_name}, ${d.last_name}, ${d.date_of_birth},
        ${d.sex}, ${d.nationality}, ${d.id_number}, ${d.phone}, ${d.email}, ${d.address}, ${d.emergency_contact_name}, ${d.emergency_contact_phone},
        ${str(fd, 'blood_type')}, ${str(fd, 'allergies')}, ${str(fd, 'medical_notes')}, ${str(fd, 'current_medications')},
        ${d.insurer_id}, ${d.insurance_policy_number}, ${d.insurance_member_name}, ${d.insurance_expiry})
      RETURNING id`;
    newId = p.id;
    await audit(user.id, 'create', 'patient', newId);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  redirect(`/dashboard/patients/${newId}`);
}

export async function updatePatientDetails(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('managePatients');
  const id = num(fd, 'id');
  const d = demographics(fd);
  if (!id || !d.first_name || !d.last_name) return { error: 'First and last name are required.' };
  await sql`UPDATE patients SET first_name = ${d.first_name}, last_name = ${d.last_name}, date_of_birth = ${d.date_of_birth}, sex = ${d.sex},
    nationality = ${d.nationality}, id_number = ${d.id_number}, phone = ${d.phone}, email = ${d.email}, address = ${d.address},
    relationship = ${d.relationship}, emergency_contact_name = ${d.emergency_contact_name}, emergency_contact_phone = ${d.emergency_contact_phone},
    insurer_id = ${d.insurer_id}, insurance_policy_number = ${d.insurance_policy_number}, insurance_member_name = ${d.insurance_member_name},
    insurance_expiry = ${d.insurance_expiry}, updated_at = now() WHERE id = ${id}`;
  await audit(user.id, 'update_details', 'patient', id);
  revalidatePath(`/dashboard/patients/${id}`);
  redirect(`/dashboard/patients/${id}`);
}

export async function updateMedical(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('editMedical');
  const id = num(fd, 'id');
  if (!id) return { error: 'Missing patient.' };
  await sql`UPDATE patients SET blood_type = ${str(fd, 'blood_type')}, allergies = ${str(fd, 'allergies')},
    current_medications = ${str(fd, 'current_medications')}, medical_notes = ${str(fd, 'medical_notes')}, updated_at = now() WHERE id = ${id}`;
  await audit(user.id, 'update_medical', 'patient', id);
  revalidatePath(`/dashboard/patients/${id}`);
  return { ok: 'Medical information saved.' };
}

export async function setPatientStatus(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('managePatients');
  const id = num(fd, 'id');
  const status = str(fd, 'status') === 'inactive' ? 'inactive' : 'active';
  if (!id) return { error: 'Missing patient.' };
  await sql`UPDATE patients SET status = ${status}, updated_at = now() WHERE id = ${id}`;
  await audit(user.id, `set_${status}`, 'patient', id);
  revalidatePath(`/dashboard/patients/${id}`);
  return { ok: status === 'active' ? 'Patient reactivated.' : 'Patient marked inactive.' };
}

export async function moveToFamily(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('managePatients');
  const id = num(fd, 'id');
  const familyId = num(fd, 'family_id');
  if (!id || !familyId) return { error: 'Choose a family account.' };
  const fam = await sql`SELECT 1 FROM families WHERE id = ${familyId}`;
  if (!fam.length) return { error: 'That family account doesn’t exist.' };
  await sql`UPDATE patients SET family_id = ${familyId}, is_account_holder = false, updated_at = now() WHERE id = ${id}`;
  await audit(user.id, 'move_family', 'patient', id, `to family ${familyId}`);
  revalidatePath(`/dashboard/patients/${id}`);
  return { ok: 'Moved to the selected family account.' };
}

export async function updateFamily(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('managePatients');
  const id = num(fd, 'id');
  const name = str(fd, 'account_name');
  if (!id || !name) return { error: 'The account name is required.' };
  await sql`UPDATE families SET account_name = ${name}, billing_email = ${str(fd, 'billing_email')?.toLowerCase() ?? null},
    phone = ${str(fd, 'phone')}, address = ${str(fd, 'address')}, notes = ${str(fd, 'notes')} WHERE id = ${id}`;
  await audit(user.id, 'update', 'family', id);
  revalidatePath(`/dashboard/families/${id}`);
  return { ok: 'Family account saved.' };
}

export async function setAccountHolder(_prev: FormState, fd: FormData): Promise<FormState> {
  await requirePermission('managePatients');
  const id = num(fd, 'id');
  const familyId = num(fd, 'family_id');
  if (!id || !familyId) return { error: 'Missing patient.' };
  await sql`UPDATE patients SET is_account_holder = (id = ${id}) WHERE family_id = ${familyId}`;
  revalidatePath(`/dashboard/families/${familyId}`);
  return { ok: 'Account holder updated.' };
}

export async function createPortalLogin(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('managePatients');
  const familyId = num(fd, 'family_id');
  const email = str(fd, 'email');
  const name = str(fd, 'name');
  if (!familyId || !email || !name) return { error: 'Enter a name and email for the login.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'That email doesn’t look right.' };
  try {
    const { id, tempPassword } = await createUser({ email, name, role: 'patient', familyId });
    await audit(user.id, 'create_portal_login', 'user', id, `family ${familyId}`);
    revalidatePath(`/dashboard/families/${familyId}`);
    return { ok: `Login created. Temporary password: ${tempPassword} — give this to the patient now; it won’t be shown again. They’ll choose their own password when they first sign in.` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function resetPortalPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('managePatients');
  const userId = num(fd, 'user_id');
  if (!userId) return { error: 'Missing login.' };
  const target = (await sql<{ role: string }>`SELECT role FROM users WHERE id = ${userId}`)[0];
  if (target?.role !== 'patient') return { error: 'Only patient logins can be reset here.' };
  const temp = await resetUserPassword(userId);
  await audit(user.id, 'reset_password', 'user', userId);
  return { ok: `New temporary password: ${temp} — it won’t be shown again.` };
}

export async function setLoginActive(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('managePatients');
  const userId = num(fd, 'user_id');
  const active = str(fd, 'active') === 'true';
  if (!userId) return { error: 'Missing login.' };
  const target = (await sql<{ role: string; family_id: number | null }>`SELECT role, family_id FROM users WHERE id = ${userId}`)[0];
  if (target?.role !== 'patient') return { error: 'Only patient logins can be changed here.' };
  await sql`UPDATE users SET is_active = ${active} WHERE id = ${userId}`;
  await audit(user.id, active ? 'enable_login' : 'disable_login', 'user', userId);
  revalidatePath(`/dashboard/families/${target.family_id}`);
  return { ok: active ? 'Login enabled.' : 'Login disabled.' };
}
