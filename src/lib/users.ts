import 'server-only';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { sql } from '@/lib/db';
import type { Role } from '@/lib/auth';

const MAX_FAILED = 5;
let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= bcrypt.hash('not-a-real-password', 12));
const LOCK_MINUTES = 15;

export interface UserRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  family_id: number | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

type AuthResult = { ok: true; user: UserRow } | { ok: false; error: string };

export async function authenticate(emailInput: string, password: string): Promise<AuthResult> {
  const email = emailInput.trim().toLowerCase();
  const rows = await sql<UserRow & { password_hash: string; failed_logins: number; locked_until: string | null }>`
    SELECT * FROM users WHERE email = ${email}
  `;
  const u = rows[0];
  const generic = { ok: false as const, error: 'Incorrect email or password.' };
  if (!u || !u.is_active) {
    // Same work either way so response time doesn't reveal which emails exist.
    await bcrypt.compare(password, await dummyHash());
    return generic;
  }
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    return { ok: false, error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.` };
  }
  const valid = await bcrypt.compare(password, u.password_hash);
  if (!valid) {
    const failed = u.failed_logins + 1;
    if (failed >= MAX_FAILED) {
      await sql`UPDATE users SET failed_logins = 0, locked_until = now() + make_interval(mins => ${LOCK_MINUTES}) WHERE id = ${u.id}`;
    } else {
      await sql`UPDATE users SET failed_logins = ${failed} WHERE id = ${u.id}`;
    }
    return generic;
  }
  await sql`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = ${u.id}`;
  return { ok: true, user: u };
}

export function generateTempPassword(): string {
  // 12 chars from an unambiguous alphabet, e.g. "k7mq-x3vt-9pwe"
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += alphabet[bytes[i] % alphabet.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function validateNewPassword(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.';
  return null;
}

/** Creates a login with a one-time temporary password the user must change on first sign-in. */
export async function createUser(input: { email: string; name: string; role: Role; familyId?: number | null }): Promise<{ id: number; tempPassword: string }> {
  const tempPassword = generateTempPassword();
  const hash = await hashPassword(tempPassword);
  const rows = await sql<{ id: number }>`
    INSERT INTO users (email, name, password_hash, role, family_id)
    VALUES (${input.email.trim().toLowerCase()}, ${input.name.trim()}, ${hash}, ${input.role}, ${input.familyId ?? null})
    RETURNING id
  `;
  return { id: rows[0].id, tempPassword };
}

export async function resetUserPassword(userId: number): Promise<string> {
  const tempPassword = generateTempPassword();
  const hash = await hashPassword(tempPassword);
  await sql`UPDATE users SET password_hash = ${hash}, must_change_password = true, failed_logins = 0, locked_until = NULL WHERE id = ${userId}`;
  return tempPassword;
}
