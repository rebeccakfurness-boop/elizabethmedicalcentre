import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getIronSession } from 'iron-session';
import { can, canPrescribe, isClinical, sessionOptions, STAFF_ROLES, type ClinicalRole, type Permission, type Role, type SessionData } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  familyId: number | null;
  mustChangePassword: boolean;
  clinicalRole: ClinicalRole | null;
}

/** Re-reads the user on every request so a deactivated account or changed role takes effect
 * immediately, not at cookie expiry. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session.userId) return null;
  const rows = await sql<{ id: number; name: string; email: string; role: Role; family_id: number | null; must_change_password: boolean; is_active: boolean; clinical_role: ClinicalRole | null }>`
    SELECT id, name, email, role, family_id, must_change_password, is_active, clinical_role FROM users WHERE id = ${session.userId}
  `;
  const u = rows[0];
  if (!u || !u.is_active) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    familyId: u.family_id,
    mustChangePassword: u.must_change_password,
    // Patients can never hold a clinical role, even if the column were set by mistake.
    clinicalRole: u.role === 'patient' ? null : u.clinical_role,
  };
}

export async function requireStaff(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !STAFF_ROLES.includes(user.role)) redirect('/staff/login');
  if (user.mustChangePassword) redirect('/account/password');
  return user;
}

export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireStaff();
  if (!can(user.role, permission)) redirect('/dashboard?denied=1');
  return user;
}

export async function requirePatient(): Promise<CurrentUser & { familyId: number }> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'patient' || !user.familyId) redirect('/login');
  if (user.mustChangePassword) redirect('/account/password');
  return user as CurrentUser & { familyId: number };
}

/** Clinical staff only (doctors, nurses, midwives, pharmacists), whatever their admin role. */
export async function requireClinical(): Promise<CurrentUser & { clinicalRole: ClinicalRole }> {
  const user = await requireStaff();
  if (!isClinical(user.clinicalRole)) redirect('/dashboard?denied=1');
  return user as CurrentUser & { clinicalRole: ClinicalRole };
}

export async function requirePrescriber(): Promise<CurrentUser & { clinicalRole: ClinicalRole }> {
  const user = await requireClinical();
  if (!canPrescribe(user.clinicalRole)) redirect('/dashboard?denied=1');
  return user;
}

/** Finance pages sit behind a second PIN on top of the super admin login. */
export async function isBudgetUnlocked(): Promise<boolean> {
  const session = await getSession();
  return !!session.budgetUnlockedUntil && session.budgetUnlockedUntil > Date.now();
}

export async function requireBudgetUnlocked(): Promise<CurrentUser> {
  const user = await requirePermission('finance');
  if (!(await isBudgetUnlocked())) redirect('/dashboard/budget');
  return user;
}

export async function audit(userId: number | null, action: string, entity: string, entityId: number | null, detail?: string) {
  await sql`INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (${userId}, ${action}, ${entity}, ${entityId}, ${detail ?? null})`;
}
