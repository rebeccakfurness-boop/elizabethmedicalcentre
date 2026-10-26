import type { SessionOptions } from 'iron-session';

export const SESSION_COOKIE = 'emc_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // one working day
export const BUDGET_UNLOCK_TTL_MS = 1000 * 60 * 30; // PIN re-prompts after 30 minutes

export type Role = 'patient' | 'staff' | 'admin' | 'super_admin';
export const STAFF_ROLES: Role[] = ['staff', 'admin', 'super_admin'];

/** Clinical role is independent of the admin role above. */
export type ClinicalRole = 'doctor' | 'nurse' | 'midwife' | 'pharmacist';
export const CLINICAL_ROLE_LABELS: Record<ClinicalRole, string> = {
  doctor: 'Doctor',
  nurse: 'Nurse',
  midwife: 'Midwife',
  pharmacist: 'Pharmacist',
};

/** Who may read clinical-only notes and vital signs: anyone with a clinical role. */
export function isClinical(clinicalRole: ClinicalRole | null | undefined): boolean {
  return !!clinicalRole;
}

/** Only doctors issue prescriptions and approve clinical content. */
export function canPrescribe(clinicalRole: ClinicalRole | null | undefined): boolean {
  return clinicalRole === 'doctor';
}

export const ROLE_LABELS: Record<Role, string> = {
  patient: 'Patient',
  staff: 'Staff',
  admin: 'Admin',
  super_admin: 'Super admin',
};

export interface SessionData {
  userId?: number;
  role?: Role;
  name?: string;
  familyId?: number | null;
  /** Epoch ms until which the Budget Tracker PIN stays unlocked. */
  budgetUnlockedUntil?: number;
  pinFailures?: number;
  pinLockedUntil?: number;
}

/** What each role may do. One place to change if, say, front-desk admins should take payments. */
export const PERMISSIONS = {
  viewPatients: ['staff', 'admin', 'super_admin'],
  editMedical: ['staff', 'admin', 'super_admin'],
  managePatients: ['admin', 'super_admin'],
  manageStaffAccounts: ['admin', 'super_admin'],
  manageAdminAccounts: ['super_admin'],
  finance: ['super_admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined, permission: Permission): boolean {
  return !!role && (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters.');
  }
  return secret;
}

export function sessionOptions(): SessionOptions {
  return {
    password: sessionPassword(),
    cookieName: SESSION_COOKIE,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    },
  };
}
