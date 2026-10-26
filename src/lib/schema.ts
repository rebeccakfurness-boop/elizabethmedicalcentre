/** Bump whenever SCHEMA_SQL changes, so already-initialised databases re-run it. Every statement
 * must stay idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING). */
export const SCHEMA_VERSION = 4;

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

-- ---------- Clinical record (schema v2) ----------

-- Clinical role is separate from the admin role: only users with a clinical role can read
-- clinical notes, whatever their admin level. Only doctors can prescribe.
ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_role TEXT
  CHECK (clinical_role IS NULL OR clinical_role IN ('doctor', 'nurse', 'midwife', 'pharmacist'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS dictation_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS consultation_fee BIGINT NOT NULL DEFAULT 0;

-- A visit: check-in -> triage -> consultation -> completed.
CREATE TABLE IF NOT EXISTS encounters (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  encounter_type TEXT NOT NULL DEFAULT 'walk_in'
    CHECK (encounter_type IN ('walk_in', 'appointment', 'home_visit', 'telemedicine', 'follow_up')),
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'triaged', 'in_consultation', 'completed', 'left', 'cancelled')),
  presenting_complaint TEXT NOT NULL,
  protocol_slug TEXT,
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  triage_category TEXT CHECK (triage_category IS NULL OR triage_category IN ('red', 'orange', 'yellow', 'green')),
  triage_score INTEGER,
  triage_discriminators TEXT[] NOT NULL DEFAULT '{}',
  triaged_at TIMESTAMPTZ,
  triaged_by INTEGER REFERENCES users(id),
  clinician_id INTEGER REFERENCES users(id),
  consultation_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  diagnosis TEXT,
  disposition TEXT,
  invoice_id INTEGER REFERENCES invoices(id),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS encounters_patient_idx ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS encounters_status_idx ON encounters(status);

-- Observations (vital signs). Several sets per visit are allowed (repeat obs).
CREATE TABLE IF NOT EXISTS observations (
  id SERIAL PRIMARY KEY,
  encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  taken_by INTEGER REFERENCES users(id),
  heart_rate INTEGER,
  resp_rate INTEGER,
  systolic_bp INTEGER,
  diastolic_bp INTEGER,
  temperature NUMERIC(4,1),
  spo2 INTEGER,
  avpu TEXT CHECK (avpu IS NULL OR avpu IN ('alert', 'confused', 'voice', 'pain', 'unresponsive')),
  mobility TEXT CHECK (mobility IS NULL OR mobility IN ('walking', 'with_help', 'stretcher')),
  pain_score INTEGER CHECK (pain_score IS NULL OR pain_score BETWEEN 0 AND 10),
  glucose NUMERIC(4,1),
  weight_kg NUMERIC(5,1),
  trauma BOOLEAN NOT NULL DEFAULT false,
  tews INTEGER
);

-- Clinical notes. visibility: clinical = clinical staff only; staff = all staff;
-- patient = all staff and the patient's family portal. Signed notes can't be edited;
-- corrections are added as addenda.
CREATE TABLE IF NOT EXISTS clinical_notes (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  encounter_id INTEGER REFERENCES encounters(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  note_type TEXT NOT NULL DEFAULT 'consultation'
    CHECK (note_type IN ('consultation', 'triage', 'nursing', 'procedure', 'phone', 'admin', 'visit_summary', 'addendum')),
  visibility TEXT NOT NULL DEFAULT 'clinical' CHECK (visibility IN ('clinical', 'staff', 'patient')),
  subjective TEXT,
  objective TEXT,
  assessment TEXT,
  plan TEXT,
  body TEXT,
  amends_note_id INTEGER REFERENCES clinical_notes(id),
  dictated BOOLEAN NOT NULL DEFAULT false,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinical_notes_patient_idx ON clinical_notes(patient_id);

CREATE TABLE IF NOT EXISTS prescriptions (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  encounter_id INTEGER REFERENCES encounters(id),
  prescriber_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'cancelled')),
  leaflet_slugs TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  allergy_override_reason TEXT,
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id SERIAL PRIMARY KEY,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  drug_code TEXT,
  drug_name TEXT NOT NULL,
  dose TEXT NOT NULL,
  route TEXT NOT NULL DEFAULT 'oral',
  frequency TEXT NOT NULL,
  duration TEXT,
  quantity TEXT,
  instructions TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Clinical sign-off for protocols, drug sheets and patient leaflets. Content lives in code
-- (src/clinical) with a version number; a new version needs a new approval.
CREATE TABLE IF NOT EXISTS content_approvals (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('protocol', 'drug', 'leaflet', 'triage')),
  slug TEXT NOT NULL,
  version INTEGER NOT NULL,
  approved_by INTEGER NOT NULL REFERENCES users(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  comments TEXT,
  UNIQUE (kind, slug, version)
);

-- ---------- Blood tests and referrals (schema v3) ----------

-- Clinical files (lab reports, referral replies) are only served to clinical staff, never to
-- finance staff, and to a patient only once a doctor has shared them.
ALTER TABLE files ADD COLUMN IF NOT EXISTS clinical BOOLEAN NOT NULL DEFAULT false;

-- One request to a lab, for one or more tests from the catalogue in src/clinical/labs.ts.
CREATE TABLE IF NOT EXISTS lab_orders (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  encounter_id INTEGER REFERENCES encounters(id),
  ordered_by INTEGER NOT NULL REFERENCES users(id),
  test_codes TEXT[] NOT NULL DEFAULT '{}',
  other_tests TEXT,
  lab_name TEXT,
  urgency TEXT NOT NULL DEFAULT 'routine' CHECK (urgency IN ('routine', 'urgent')),
  fasting BOOLEAN NOT NULL DEFAULT false,
  clinical_details TEXT,
  status TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'collected', 'resulted', 'reviewed', 'cancelled')),
  collected_at TIMESTAMPTZ,
  resulted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by INTEGER REFERENCES users(id),
  review_comment TEXT,
  patient_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_orders_patient_idx ON lab_orders (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lab_orders_status_idx ON lab_orders (status);

-- One value per analyte. Hidden from the patient unless a doctor ticks "share".
CREATE TABLE IF NOT EXISTS lab_results (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  test_code TEXT,
  analyte_code TEXT,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  numeric_value NUMERIC,
  unit TEXT,
  ref_range TEXT,
  flag TEXT CHECK (flag IS NULL OR flag IN ('L', 'H', 'LL', 'HH', 'A')),
  shared_with_patient BOOLEAN NOT NULL DEFAULT false,
  entered_by INTEGER NOT NULL REFERENCES users(id),
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (order_id, analyte_code)
);

-- Scanned or emailed lab reports. "extracted" holds values read from the report, which a
-- clinician must check before they become results.
CREATE TABLE IF NOT EXISTS lab_attachments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES files(id),
  shared_with_patient BOOLEAN NOT NULL DEFAULT false,
  extracted JSONB,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Address book of hospitals, specialists and allied health professionals.
CREATE TABLE IF NOT EXISTS referral_contacts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  organisation TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('hospital', 'specialist', 'allied_health', 'imaging', 'other')),
  specialty TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A referral letter: draft -> finalised (signed, read-only) -> sent -> completed.
CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  encounter_id INTEGER REFERENCES encounters(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  contact_id INTEGER REFERENCES referral_contacts(id),
  template TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_organisation TEXT,
  recipient_email TEXT,
  specialty TEXT,
  urgency TEXT NOT NULL DEFAULT 'routine' CHECK (urgency IN ('routine', 'soon', 'urgent', 'emergency')),
  reason TEXT,
  history TEXT,
  examination TEXT,
  investigations TEXT,
  medications TEXT,
  allergies TEXT,
  management TEXT,
  request TEXT,
  attach_note_ids INTEGER[] NOT NULL DEFAULT '{}',
  attach_lab_order_ids INTEGER[] NOT NULL DEFAULT '{}',
  consent_confirmed BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalised', 'sent', 'completed', 'cancelled')),
  finalised_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  sent_to TEXT,
  shared_with_patient BOOLEAN NOT NULL DEFAULT false,
  outcome_notes TEXT,
  reply_file_id INTEGER REFERENCES files(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referrals_patient_idx ON referrals (patient_id, created_at DESC);

-- ---------- Operations (schema v4) ----------

-- Recurring checklists: opening/closing, cleaning, fridge temperatures, emergency trolley.
CREATE TABLE IF NOT EXISTS ops_task_templates (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT 'General',
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  weekday INTEGER CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  due_time TEXT,
  instructions TEXT,
  assigned_user_id INTEGER REFERENCES users(id),
  requires_reading BOOLEAN NOT NULL DEFAULT false,
  reading_unit TEXT,
  reading_min NUMERIC,
  reading_max NUMERIC,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One tick per task per period (the day; the Monday of the week; the 1st of the month).
CREATE TABLE IF NOT EXISTS ops_task_completions (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES ops_task_templates(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  completed_by INTEGER NOT NULL REFERENCES users(id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reading NUMERIC,
  out_of_range BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  UNIQUE (template_id, period_date)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT NOT NULL DEFAULT 'Consumables',
  unit TEXT NOT NULL DEFAULT 'each',
  location TEXT,
  reorder_level NUMERIC NOT NULL DEFAULT 0,
  reorder_quantity NUMERIC NOT NULL DEFAULT 0,
  supplier_id INTEGER REFERENCES suppliers(id),
  unit_cost BIGINT NOT NULL DEFAULT 0,
  track_expiry BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stock is held in batches so expiry dates can be tracked; use takes from the soonest expiry first.
CREATE TABLE IF NOT EXISTS inventory_batches (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  batch_no TEXT,
  expiry_date DATE,
  quantity NUMERIC NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_batches_item_idx ON inventory_batches (item_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  ordered_at TIMESTAMPTZ,
  expected_date DATE,
  received_at TIMESTAMPTZ,
  notes TEXT,
  bill_id INTEGER REFERENCES bills(id),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  received_quantity NUMERIC NOT NULL DEFAULT 0,
  unit_cost BIGINT NOT NULL DEFAULT 0,
  UNIQUE (order_id, item_id)
);

-- Every stock change, signed (+ in, - out), for the audit trail and usage reports.
CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES inventory_batches(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('receive', 'use', 'dispose', 'adjust')),
  quantity NUMERIC NOT NULL,
  reason TEXT,
  purchase_order_id INTEGER REFERENCES purchase_orders(id),
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_movements_item_idx ON inventory_movements (item_id, created_at DESC);

-- Project boards (Trello-style): lists of cards, each card with assignees, checklist and comments.
CREATE TABLE IF NOT EXISTS project_boards (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_lists (
  id SERIAL PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_done BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS project_cards (
  id SERIAL PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
  list_id INTEGER NOT NULL REFERENCES project_lists(id),
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  start_date DATE,
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  labels TEXT[] NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_cards_list_idx ON project_cards (list_id, position);

CREATE TABLE IF NOT EXISTS project_card_assignees (
  card_id INTEGER NOT NULL REFERENCES project_cards(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (card_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_checklist_items (
  id SERIAL PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES project_cards(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  done_by INTEGER REFERENCES users(id),
  done_at TIMESTAMPTZ,
  assignee_id INTEGER REFERENCES users(id),
  due_date DATE,
  position INTEGER NOT NULL DEFAULT 0
);

-- Comments and an automatic history (moved, assigned, ticked) on each card.
CREATE TABLE IF NOT EXISTS project_card_activity (
  id SERIAL PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES project_cards(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'event')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
