'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@/app/actions/auth';
import { can, type Role } from '@/lib/auth';
import { sql } from '@/lib/db';
import { errorMessage, num, str } from '@/lib/form';
import { audit, requirePermission } from '@/lib/session';
import { createUser, resetUserPassword } from '@/lib/users';

const STAFF_ROLE_OPTIONS: Role[] = ['staff', 'admin', 'super_admin'];

/** Admins can manage staff; only super admins can create or change admins and super admins. */
function mayManage(actorRole: Role, targetRole: Role): boolean {
  if (targetRole === 'staff') return can(actorRole, 'manageStaffAccounts');
  return can(actorRole, 'manageAdminAccounts');
}

export async function createStaffAccount(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageStaffAccounts');
  const name = str(fd, 'name');
  const email = str(fd, 'email');
  const role = str(fd, 'role') as Role;
  if (!name || !email) return { error: 'Enter a name and email.' };
  if (!STAFF_ROLE_OPTIONS.includes(role)) return { error: 'Choose a role.' };
  if (!mayManage(user.role, role)) return { error: 'Only a super admin can create admin accounts.' };
  try {
    const { id, tempPassword } = await createUser({ email, name, role });
    await audit(user.id, 'create_staff', 'user', id, role);
    revalidatePath('/dashboard/staff');
    return { ok: `Account created. Temporary password: ${tempPassword} — share it privately; it won’t be shown again.` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

async function loadTarget(fd: FormData) {
  const id = num(fd, 'user_id');
  if (!id) return null;
  return (await sql<{ id: number; role: Role }>`SELECT id, role FROM users WHERE id = ${id}`)[0] ?? null;
}

export async function resetStaffPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageStaffAccounts');
  const target = await loadTarget(fd);
  if (!target || target.role === 'patient') return { error: 'Account not found.' };
  if (!mayManage(user.role, target.role)) return { error: 'You can’t change this account.' };
  const temp = await resetUserPassword(target.id);
  await audit(user.id, 'reset_password', 'user', target.id);
  return { ok: `New temporary password: ${temp} — it won’t be shown again.` };
}

export async function updateStaffAccount(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageStaffAccounts');
  const target = await loadTarget(fd);
  const role = str(fd, 'role') as Role;
  const active = str(fd, 'is_active') === 'true';
  if (!target || target.role === 'patient') return { error: 'Account not found.' };
  if (!STAFF_ROLE_OPTIONS.includes(role)) return { error: 'Choose a role.' };
  if (!mayManage(user.role, target.role) || !mayManage(user.role, role)) return { error: 'You can’t give or change that role.' };
  if (target.id === user.id && (!active || role !== user.role)) return { error: 'You can’t demote or deactivate your own account.' };
  if (target.role === 'super_admin' && (role !== 'super_admin' || !active)) {
    const others = await sql`SELECT 1 FROM users WHERE role = 'super_admin' AND is_active AND id <> ${target.id}`;
    if (!others.length) return { error: 'There must always be at least one active super admin.' };
  }
  await sql`UPDATE users SET role = ${role}, is_active = ${active} WHERE id = ${target.id}`;
  await audit(user.id, 'update_staff', 'user', target.id, `${role} active=${active}`);
  revalidatePath('/dashboard/staff');
  return { ok: 'Saved.' };
}
