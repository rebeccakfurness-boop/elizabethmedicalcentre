/** Bump whenever SCHEMA_SQL changes, so already-initialised databases re-run it. Every statement
 * must stay idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING). */
export const SCHEMA_VERSION = 1;

// Money is stored as BIGINT whole rupiah (IDR has no minor unit in practice).
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Uploaded documents (bank statements, bills, proofs of payment). Served only through
-- /api/files/[id], which checks the viewer is allowed to see the file.
CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  family_id INTEGER,
  uploaded_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A family is the billing account: it owns invoices and payments, and links patients together.
CREATE TABLE IF NOT EXISTS families (
  id SERIAL PRIMARY KEY,
  account_name TEXT NOT NULL,
  billing_email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS insurers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  phone TEXT,
  billing_address TEXT,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS patient_mrn_seq START 1001;

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  mrn TEXT NOT NULL UNIQUE DEFAULT ('EMC-' || nextval('patient_mrn_seq')),
  family_id INTEGER NOT NULL REFERENCES families(id),
  is_account_holder BOOLEAN NOT NULL DEFAULT false,
  relationship TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  sex TEXT,
  nationality TEXT,
  id_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  blood_type TEXT,
  allergies TEXT,
  medical_notes TEXT,
  current_medications TEXT,
  insurer_id INTEGER REFERENCES insurers(id),
  insurance_policy_number TEXT,
  insurance_member_name TEXT,
  insurance_expiry DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patients_family_idx ON patients(family_id);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('patient', 'staff', 'admin', 'super_admin')),
  family_id INTEGER REFERENCES families(id),
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role <> 'patient' OR family_id IS NOT NULL)
);

-- Who looked at or changed what. Patient records are health data (UU 27/2022), so every view
-- and edit of a patient card is recorded.
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Singleton (id = 1). Invoice PDFs read payee/bank details from here, never from code.
CREATE TABLE IF NOT EXISTS clinic_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  legal_name TEXT NOT NULL DEFAULT 'The Doctors – Elizabeth Medical Centre',
  address TEXT NOT NULL DEFAULT 'Ashtari Estate, Raya Ke, Prabu, Jl. Mawun, Kuta, Kec. Pujut, Kuta Lombok, Nusa Tenggara Bar. 83573',
  email TEXT,
  phone TEXT,
  bank_name TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_swift TEXT,
  invoice_due_days INTEGER NOT NULL DEFAULT 14,
  tax_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  invoice_footer_note TEXT DEFAULT 'Thank you for choosing The Doctors – Elizabeth Medical Centre.',
  budget_pin_hash TEXT,
  opening_cash_balance BIGINT NOT NULL DEFAULT 0,
  opening_cash_date DATE NOT NULL DEFAULT CURRENT_DATE
);
INSERT INTO clinic_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  family_id INTEGER NOT NULL REFERENCES families(id),
  billed_to_name TEXT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'void')),
  subtotal BIGINT NOT NULL DEFAULT 0,
  discount BIGINT NOT NULL DEFAULT 0,
  tax BIGINT NOT NULL DEFAULT 0,
  total BIGINT NOT NULL DEFAULT 0,
  insurer_id INTEGER REFERENCES insurers(id),
  insurer_portion BIGINT NOT NULL DEFAULT 0,
  patient_portion BIGINT NOT NULL DEFAULT 0,
  notes TEXT,
  void_reason TEXT,
  sent_at TIMESTAMPTZ,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_family_idx ON invoices(family_id);

CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  patient_id INTEGER REFERENCES patients(id),
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price BIGINT NOT NULL DEFAULT 0,
  amount BIGINT NOT NULL DEFAULT 0,
  insurance_covered BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS insurance_claims (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  insurer_id INTEGER NOT NULL REFERENCES insurers(id),
  patient_id INTEGER REFERENCES patients(id),
  claim_reference TEXT,
  policy_number TEXT,
  amount_claimed BIGINT NOT NULL,
  amount_approved BIGINT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'partially_approved', 'rejected', 'paid')),
  submitted_at DATE,
  decided_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'revenue')),
  monthly_budget BIGINT NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS budget_category_history (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES budget_categories(id),
  old_value BIGINT NOT NULL,
  new_value BIGINT NOT NULL,
  changed_by INTEGER,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_statements (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES files(id),
  account_label TEXT,
  period_start DATE,
  period_end DATE,
  uploaded_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id SERIAL PRIMARY KEY,
  statement_id INTEGER NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  txn_date DATE NOT NULL,
  description TEXT NOT NULL,
  counterparty TEXT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  status TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched', 'ignored')),
  matched_note TEXT
);
CREATE INDEX IF NOT EXISTS bank_transactions_status_idx ON bank_transactions(status);

-- Money received. Patient payments and insurer payments both land here; a confirmed payment
-- with an invoice_id reduces that invoice's balance.
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  family_id INTEGER REFERENCES families(id),
  invoice_id INTEGER REFERENCES invoices(id),
  claim_id INTEGER REFERENCES insurance_claims(id),
  payer_type TEXT NOT NULL CHECK (payer_type IN ('patient', 'insurer', 'other')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'bank_transfer', 'qris', 'insurance', 'other')),
  paid_at DATE NOT NULL,
  reference TEXT,
  proof_file_id INTEGER REFERENCES files(id),
  bank_transaction_id INTEGER UNIQUE REFERENCES bank_transactions(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES budget_categories(id),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending_review', 'rejected')),
  submitted_by_patient BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  recorded_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments(invoice_id);

-- Money owed / paid out: supplier bills, rent, salaries, and one-off expenses.
CREATE TABLE IF NOT EXISTS bills (
  id SERIAL PRIMARY KEY,
  vendor TEXT NOT NULL,
  bill_reference TEXT,
  category_id INTEGER REFERENCES budget_categories(id),
  issue_date DATE NOT NULL,
  due_date DATE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'void')),
  paid_at DATE,
  payment_method TEXT,
  file_id INTEGER REFERENCES files(id),
  bank_transaction_id INTEGER UNIQUE REFERENCES bank_transactions(id) ON DELETE SET NULL,
  created_from_bank BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO budget_categories (name, kind, sort_order) VALUES
  ('Consultations & treatments', 'revenue', 1),
  ('Pharmacy sales', 'revenue', 2),
  ('Insurance reimbursements', 'revenue', 3),
  ('Other income', 'revenue', 4),
  ('Salaries & wages', 'expense', 10),
  ('Rent', 'expense', 11),
  ('Medical supplies', 'expense', 12),
  ('Pharmacy stock', 'expense', 13),
  ('Equipment', 'expense', 14),
  ('Utilities & internet', 'expense', 15),
  ('Licences & insurance', 'expense', 16),
  ('Marketing', 'expense', 17),
  ('Bank fees', 'expense', 18),
  ('Other expenses', 'expense', 19)
ON CONFLICT (name) DO NOTHING;
`;
