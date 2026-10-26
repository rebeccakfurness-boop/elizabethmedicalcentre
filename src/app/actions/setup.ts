'use server';

import { timingSafeEqual } from 'crypto';
import { redirect } from 'next/navigation';
import type { FormState } from '@/app/actions/auth';
import { sql } from '@/lib/db';
import { str } from '@/lib/form';
import { audit, getSession } from '@/lib/session';
import { hashPassword, validateNewPassword } from '@/lib/users';

/** True once any staff account exists; the setup page then stays closed for good. */
export async function setupDone(): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM users WHERE role IN ('staff', 'admin', 'super_admin') LIMIT 1`;
  return rows.length > 0;
}

function tokenMatches(given: string): boolean {
  const expected = process.env.SETUP_TOKEN;
  if (!expected || expected.length < 16) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Creates the very first super admin on a fresh deployment. */
export async function createFirstSuperAdmin(_prev: FormState, fd: FormData): Promise<FormState> {
  if (await setupDone()) return { error: 'Setup has already been completed. Sign in at the staff login.' };
  if (!tokenMatches(str(fd, 'token') ?? '')) return { error: 'That setup code isn’t right.' };
  const name = str(fd, 'name');
  const email = str(fd, 'email')?.toLowerCase();
  const password = String(fd.get('password') ?? '');
  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter your name and a valid email.' };
  const problem = validateNewPassword(password);
  if (problem) return { error: problem };
  if (password !== String(fd.get('confirm') ?? '')) return { error: 'The passwords don’t match.' };

  // Insert only if still no staff exist, so two simultaneous submissions can't both succeed.
  const rows = await sql<{ id: number }>`
    INSERT INTO users (email, name, password_hash, role, must_change_password)
    SELECT ${email}, ${name}, ${await hashPassword(password)}, 'super_admin', false
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE role IN ('staff', 'admin', 'super_admin'))
    RETURNING id`;
  if (!rows.length) return { error: 'Setup has already been completed. Sign in at the staff login.' };

  const session = await getSession();
  session.userId = rows[0].id;
  session.role = 'super_admin';
  session.name = name;
  session.familyId = null;
  await session.save();
  await audit(rows[0].id, 'first_setup', 'user', rows[0].id);
  redirect('/dashboard/settings');
}
