import 'server-only';
import { query, sql } from '@/lib/db';

export interface Family {
  id: number;
  account_name: string;
  billing_email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export interface Patient {
  id: number;
  mrn: string;
  family_id: number;
  is_account_holder: boolean;
  relationship: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  sex: string | null;
  nationality: string | null;
  id_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  blood_type: string | null;
  allergies: string | null;
  medical_notes: string | null;
  current_medications: string | null;
  insurer_id: number | null;
  insurer_name?: string | null;
  insurance_policy_number: string | null;
  insurance_member_name: string | null;
  insurance_expiry: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface PatientListRow extends Patient {
  account_name: string;
  family_balance: number;
}

/** Outstanding amount the family itself owes (insurer portions are tracked separately). */
const FAMILY_BALANCE_SQL = `
  COALESCE((
    SELECT SUM(i.patient_portion - COALESCE((
      SELECT SUM(p.amount) FROM payments p
      WHERE p.invoice_id = i.id AND p.status = 'confirmed' AND p.payer_type = 'patient'
    ), 0))
    FROM invoices i WHERE i.family_id = f.id AND i.status NOT IN ('draft', 'void')
  ), 0)`;

export async function searchPatients(search: string, status: 'active' | 'inactive' | 'all' = 'active'): Promise<PatientListRow[]> {
  const q = `%${search.trim()}%`;
  const rows = await query<PatientListRow>(
    `SELECT pt.*, f.account_name, ins.name AS insurer_name, ${FAMILY_BALANCE_SQL} AS family_balance
     FROM patients pt
     JOIN families f ON f.id = pt.family_id
     LEFT JOIN insurers ins ON ins.id = pt.insurer_id
     WHERE ($1 = '%%' OR pt.first_name || ' ' || pt.last_name ILIKE $1 OR pt.mrn ILIKE $1
            OR f.account_name ILIKE $1 OR pt.phone ILIKE $1 OR pt.email ILIKE $1)
       AND ($2 = 'all' OR pt.status = $2)
     ORDER BY pt.last_name, pt.first_name
     LIMIT 200`,
    [q, status]
  );
  return rows;
}

export async function getPatient(id: number): Promise<Patient | null> {
  const rows = await sql<Patient>`
    SELECT pt.*, ins.name AS insurer_name FROM patients pt
    LEFT JOIN insurers ins ON ins.id = pt.insurer_id
    WHERE pt.id = ${id}
  `;
  return rows[0] ?? null;
}

export async function getFamily(id: number): Promise<(Family & { balance: number }) | null> {
  const rows = await query<Family & { balance: number }>(
    `SELECT f.*, ${FAMILY_BALANCE_SQL} AS balance FROM families f WHERE f.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getFamilyMembers(familyId: number): Promise<Patient[]> {
  return sql<Patient>`
    SELECT pt.*, ins.name AS insurer_name FROM patients pt
    LEFT JOIN insurers ins ON ins.id = pt.insurer_id
    WHERE pt.family_id = ${familyId}
    ORDER BY pt.is_account_holder DESC, pt.date_of_birth NULLS LAST
  `;
}

export async function listFamilies(search: string): Promise<(Family & { balance: number; members: number })[]> {
  const q = `%${search.trim()}%`;
  const rows = await query<Family & { balance: number; members: number }>(
    `SELECT f.*, ${FAMILY_BALANCE_SQL} AS balance,
            (SELECT COUNT(*)::int FROM patients pt WHERE pt.family_id = f.id) AS members
     FROM families f
     WHERE $1 = '%%' OR f.account_name ILIKE $1 OR f.billing_email ILIKE $1
        OR EXISTS (SELECT 1 FROM patients pt WHERE pt.family_id = f.id AND pt.first_name || ' ' || pt.last_name ILIKE $1)
     ORDER BY f.account_name LIMIT 200`,
    [q]
  );
  return rows;
}

export async function getInsurers(activeOnly = true) {
  return sql<{ id: number; name: string; contact_name: string | null; contact_email: string | null; phone: string | null; billing_address: string | null; payment_terms_days: number; notes: string | null; is_active: boolean }>`
    SELECT * FROM insurers WHERE (${activeOnly} = false OR is_active) ORDER BY name
  `;
}

export async function getFamilyLogins(familyId: number) {
  return sql<{ id: number; email: string; name: string; is_active: boolean; last_login_at: string | null; must_change_password: boolean }>`
    SELECT id, email, name, is_active, last_login_at, must_change_password FROM users
    WHERE family_id = ${familyId} AND role = 'patient' ORDER BY created_at
  `;
}

