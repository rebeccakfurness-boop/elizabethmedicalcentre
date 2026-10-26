'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { STAFF_ROLES } from '@/lib/auth';
import { sql } from '@/lib/db';
import { audit, getCurrentUser, getSession } from '@/lib/session';
import { authenticate, hashPassword, validateNewPassword } from '@/lib/users';

export interface FormState {
  error?: string;
  ok?: string;
}

function safeNext(next: FormDataEntryValue | null, fallback: string): string {
  const s = typeof next === 'string' ? next : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : fallback;
}

async function login(formData: FormData, portal: 'patient' | 'staff'): Promise<FormState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const result = await authenticate(email, password);
  if (!result.ok) return { error: result.error };
  const user = result.user;

  const isStaff = STAFF_ROLES.includes(user.role);
  if (portal === 'patient' && isStaff) return { error: 'This is the patient login. Staff please use the staff login.' };
  if (portal === 'staff' && !isStaff) return { error: 'This login is for clinic staff. Patients please use the patient login.' };

  const session = await getSession();
  session.userId = user.id;
  session.role = user.role;
  session.name = user.name;
  session.familyId = user.family_id;
  session.budgetUnlockedUntil = undefined;
  await session.save();
  await audit(user.id, 'login', 'user', user.id);

  if (user.must_change_password) redirect('/account/password');
  redirect(safeNext(formData.get('next'), portal === 'patient' ? '/portal' : '/dashboard'));
}

export async function patientLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  return login(formData, 'patient');
}

export async function staffLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  return login(formData, 'staff');
}

export async function logout(): Promise<void> {
  const session = await getSession();
  const role = session.role;
  session.destroy();
  redirect(role && STAFF_ROLES.includes(role) ? '/staff/login' : '/login');
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  const row = (await sql<{ password_hash: string }>`SELECT password_hash FROM users WHERE id = ${user.id}`)[0];
  if (!row || !(await bcrypt.compare(current, row.password_hash))) return { error: 'Your current password is incorrect.' };
  const problem = validateNewPassword(next);
  if (problem) return { error: problem };
  if (next !== confirm) return { error: 'The new passwords don’t match.' };
  if (next === current) return { error: 'Choose a password different from your current one.' };

  await sql`UPDATE users SET password_hash = ${await hashPassword(next)}, must_change_password = false WHERE id = ${user.id}`;
  await audit(user.id, 'change_password', 'user', user.id);
  redirect(user.role === 'patient' ? '/portal' : '/dashboard');
}
