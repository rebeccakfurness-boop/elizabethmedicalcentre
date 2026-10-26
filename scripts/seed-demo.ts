// Fills a LOCAL/TEST database with made-up families, patients, insurers, invoices and bills so
// every screen has something to show. Refuses to run if the database already has patients.
// Never run this against the live clinic database.
import bcrypt from 'bcryptjs';
import { initSchema, pool } from './db';
import { SUGGESTED_CHECKLISTS } from '../src/operations/templates';

const DEMO_PASSWORD = 'demo-password-1';

async function main() {
  const p = pool();
  try {
    await initSchema(p);
    const { rows } = await p.query('SELECT COUNT(*)::int AS n FROM patients');
    if (rows[0].n > 0) throw new Error('This database already has patients; the demo seed only runs on an empty database.');

    const q = (text: string, values: unknown[] = []) => p.query(text, values).then((r) => r.rows);
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    // admin@demo.test has no clinical role, so it shows what reception can and can't see.
    for (const [email, name, role, clinicalRole] of [
      ['superadmin@demo.test', 'Sam Super', 'super_admin', 'doctor'],
      ['admin@demo.test', 'Ari Admin', 'admin', null],
      ['doctor@demo.test', 'Dana Doctor', 'staff', 'doctor'],
      ['nurse@demo.test', 'Nia Nurse', 'staff', 'nurse'],
    ]) {
      await q(`INSERT INTO users (email, name, password_hash, role, clinical_role, must_change_password) VALUES ($1, $2, $3, $4, $5, false)`, [email, name, hash, role, clinicalRole]);
    }
    await q(`UPDATE clinic_settings SET bank_name = 'BCA', bank_account_name = 'PT Demo Klinik', bank_account_number = '000 000 0000',
      email = 'hello@demo.test', phone = '+62 000 0000 0000', budget_pin_hash = $1, opening_cash_balance = 50000000, opening_cash_date = date_trunc('month', CURRENT_DATE) - interval '2 months'`,
      [await bcrypt.hash('2468', 10)]);

    const [allianz] = await q(`INSERT INTO insurers (name, contact_email, payment_terms_days) VALUES ('Demo Travel Insurance', 'claims@insurer.test', 30) RETURNING id`);
    await q(`INSERT INTO insurers (name, payment_terms_days) VALUES ('Demo Health Cover', 45)`);

    const [fam1] = await q(`INSERT INTO families (account_name, billing_email, phone) VALUES ('Example family', 'parent@demo.test', '+62 811 0000 0001') RETURNING id`);
    const [parent] = await q(`INSERT INTO patients (family_id, is_account_holder, relationship, first_name, last_name, date_of_birth, sex, nationality, email, phone, insurer_id, insurance_policy_number, insurance_expiry)
      VALUES ($1, true, 'Account holder', 'Alex', 'Example', '1986-04-12', 'female', 'Australian', 'parent@demo.test', '+62 811 0000 0001', $2, 'POL-123456', CURRENT_DATE + 200) RETURNING id`, [fam1.id, allianz.id]);
    const [child] = await q(`INSERT INTO patients (family_id, relationship, first_name, last_name, date_of_birth, sex, nationality, allergies, insurer_id, insurance_policy_number)
      VALUES ($1, 'Child', 'Jamie', 'Example', '2017-09-03', 'male', 'Australian', 'Penicillin (rash)', $2, 'POL-123457') RETURNING id`, [fam1.id, allianz.id]);
    await q(`INSERT INTO users (email, name, password_hash, role, family_id, must_change_password) VALUES ('parent@demo.test', 'Alex Example', $1, 'patient', $2, false)`, [hash, fam1.id]);

    const [fam2] = await q(`INSERT INTO families (account_name, billing_email) VALUES ('Sample household', 'surfer@demo.test') RETURNING id`);
    const [solo] = await q(`INSERT INTO patients (family_id, is_account_holder, relationship, first_name, last_name, date_of_birth, sex, nationality, email)
      VALUES ($1, true, 'Account holder', 'Robin', 'Sample', '1995-01-20', 'other', 'German', 'surfer@demo.test') RETURNING id`, [fam2.id]);

    // Invoice 1: insured, family share outstanding
    const inv = async (familyId: number, billedTo: string, daysAgo: number, items: [number | null, string, number, number, boolean][], insurerId: number | null, status: string) => {
      const [{ n }] = await q(`SELECT nextval('invoice_number_seq') AS n`);
      const lines = items.map(([pid, d, qty, price, ins]) => ({ pid, d, qty, price, ins, amount: qty * price }));
      const subtotal = lines.reduce((s, l) => s + l.amount, 0);
      const covered = insurerId ? lines.filter((l) => l.ins).reduce((s, l) => s + l.amount, 0) : 0;
      const [row] = await q(`INSERT INTO invoices (invoice_number, family_id, billed_to_name, issue_date, due_date, status, subtotal, total, insurer_id, insurer_portion, patient_portion)
        VALUES ($1, $2, $3, CURRENT_DATE - $4::int, CURRENT_DATE - $4::int + 14, $5, $6, $6, $7, $8, $9) RETURNING id, invoice_number`,
        [`EMC-${String(n).padStart(5, '0')}`, familyId, billedTo, daysAgo, status, subtotal, insurerId, covered, subtotal - covered]);
      for (const [i, l] of lines.entries()) {
        await q(`INSERT INTO invoice_items (invoice_id, patient_id, description, quantity, unit_price, amount, insurance_covered, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [row.id, l.pid, l.d, l.qty, l.price, l.amount, !!insurerId && l.ins, i]);
      }
      return row as { id: number; invoice_number: string };
    };
    const i1 = await inv(fam1.id, 'Alex Example', 20, [[child.id, 'GP consultation', 1, 450000, true], [child.id, 'Antibiotics (non-penicillin)', 1, 185000, true], [null, 'Medical certificate', 1, 100000, false]], allianz.id, 'issued');
    await q(`INSERT INTO insurance_claims (invoice_id, insurer_id, patient_id, policy_number, amount_claimed, status, submitted_at) VALUES ($1, $2, $3, 'POL-123457', 635000, 'submitted', CURRENT_DATE - 18)`, [i1.id, allianz.id, child.id]);
    const i2 = await inv(fam2.id, 'Robin Sample', 40, [[solo.id, 'Wound care & dressing', 2, 250000, false], [solo.id, 'Tetanus injection', 1, 300000, false]], null, 'issued');
    await q(`INSERT INTO payments (family_id, invoice_id, payer_type, amount, method, paid_at, reference, status) VALUES ($1, $2, 'patient', 300000, 'card', CURRENT_DATE - 40, 'EDC 0042', 'confirmed')`, [fam2.id, i2.id]);
    await q(`UPDATE invoices SET status = 'partially_paid' WHERE id = $1`, [i2.id]);
    const i3 = await inv(fam1.id, 'Alex Example', 5, [[parent.id, 'IV drip therapy', 1, 1200000, false]], null, 'issued');

    // Bills and a bank statement waiting to be matched
    const cat = async (name: string) => (await q(`SELECT id FROM budget_categories WHERE name = $1`, [name]))[0].id;
    await q(`UPDATE budget_categories SET monthly_budget = v.b FROM (VALUES ('Salaries & wages', 60000000), ('Rent', 15000000), ('Medical supplies', 8000000), ('Pharmacy stock', 10000000), ('Utilities & internet', 3000000), ('Marketing', 2000000), ('Bank fees', 200000), ('Consultations & treatments', 80000000)) AS v(n, b) WHERE name = v.n`);
    await q(`INSERT INTO bills (vendor, bill_reference, category_id, issue_date, due_date, amount, status) VALUES ('Demo Medical Supplies', 'INV-7781', $1, CURRENT_DATE - 10, CURRENT_DATE + 4, 3450000, 'unpaid')`, [await cat('Medical supplies')]);
    await q(`INSERT INTO bills (vendor, category_id, issue_date, due_date, amount, status, paid_at, payment_method) VALUES ('Landlord (demo)', $1, CURRENT_DATE - 25, CURRENT_DATE - 20, 15000000, 'paid', CURRENT_DATE - 20, 'bank_transfer')`, [await cat('Rent')]);
    await q(`INSERT INTO bills (vendor, category_id, issue_date, due_date, amount, status) VALUES ('Internet provider (demo)', $1, CURRENT_DATE - 3, CURRENT_DATE + 10, 750000, 'unpaid')`, [await cat('Utilities & internet')]);

    const [st] = await q(`INSERT INTO bank_statements (account_label, period_start, period_end) VALUES ('Demo BCA statement', CURRENT_DATE - 30, CURRENT_DATE) RETURNING id`);
    for (const [d, desc, cp, amt, dir] of [
      [3, `TRSF E-BANKING CR ${i3.invoice_number} ALEX EXAMPLE`, 'ALEX EXAMPLE', 1200000, 'credit'],
      [2, 'TRSF E-BANKING DB DEMO MEDICAL SUPPLIES', 'DEMO MEDICAL SUPPLIES', 3450000, 'debit'],
      [1, 'BIAYA ADM', '', 15000, 'debit'],
      [1, 'SETORAN TUNAI', '', 650000, 'credit'],
    ] as [number, string, string, number, string][]) {
      await q(`INSERT INTO bank_transactions (statement_id, txn_date, description, counterparty, amount, direction) VALUES ($1, CURRENT_DATE - $2::int, $3, $4, $5, $6)`, [st.id, d, desc, cp || null, amt, dir]);
    }

    await q(`UPDATE clinic_settings SET consultation_fee = 450000`);
    // Made-up referral contacts (example.test addresses never deliver).
    for (const [name, org, kind, specialty, email] of [
      ['Emergency Department', 'Demo Regional Hospital', 'hospital', 'Emergency department', 'ed@hospital.example.test'],
      ['Dr Demo Ortho', 'Demo Specialist Centre', 'specialist', 'Orthopaedics', 'ortho@specialist.example.test'],
      ['Demo Physio', 'Demo Physiotherapy', 'allied_health', 'Physiotherapy', 'physio@allied.example.test'],
      ['Radiology', 'Demo Imaging', 'imaging', 'X-ray', null],
    ]) {
      await q(`INSERT INTO referral_contacts (name, organisation, kind, specialty, email) VALUES ($1, $2, $3, $4, $5)`, [name, org, kind, specialty, email]);
    }
    await q(`INSERT INTO encounters (patient_id, encounter_type, presenting_complaint, created_by)
      SELECT p.id, 'walk_in', 'Jellyfish sting on left leg while surfing, burning pain', u.id
      FROM patients p, users u WHERE p.first_name = 'Robin' AND u.email = 'admin@demo.test'`);

    // Operations: checklists, suppliers and a few stock items (one low, one expiring soon).
    for (const [i, t] of SUGGESTED_CHECKLISTS.entries()) {
      await q(`INSERT INTO ops_task_templates (title, area, frequency, weekday, due_time, instructions, requires_reading, reading_unit, reading_min, reading_max, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [t.title, t.area, t.frequency, t.weekday ?? null, t.dueTime ?? null, t.instructions ?? null, !!t.reading, t.reading?.unit ?? null, t.reading?.min ?? null, t.reading?.max ?? null, i]);
    }
    const [sup1] = await q(`INSERT INTO suppliers (name, contact_name, phone) VALUES ('Demo Medical Supplies', 'Pak Demo', '+62 811 0000 0099') RETURNING id`);
    const [sup2] = await q(`INSERT INTO suppliers (name, email) VALUES ('Demo Pharma Distributor', 'orders@pharma.example.test') RETURNING id`);
    for (const [name, category, unit, reorder, orderQty, supplier, cost, expiry, qty, days] of [
      ['Sterile gauze swabs 10x10 cm', 'Wound care', 'pack', 10, 50, sup1.id, 15000, false, 40, null],
      ['Nitrile gloves (M)', 'PPE & cleaning', 'box', 5, 20, sup1.id, 85000, false, 3, null],
      ['IV cannula 20G', 'IV & injections', 'each', 20, 100, sup1.id, 9000, true, 60, 400],
      ['Paracetamol 500 mg tablets', 'Medicines', 'tablet', 200, 1000, sup2.id, 150, true, 800, 25],
      ['Oral rehydration salts sachets', 'Medicines', 'sachet', 50, 200, sup2.id, 2500, true, 120, 300],
      ['Dengue NS1 rapid tests', 'Point-of-care tests', 'test', 10, 25, sup2.id, 65000, true, 0, null],
    ] as [string, string, string, number, number, number, number, boolean, number, number | null][]) {
      const [item] = await q(`INSERT INTO inventory_items (name, category, unit, reorder_level, reorder_quantity, supplier_id, unit_cost, track_expiry) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [name, category, unit, reorder, orderQty, supplier, cost, expiry]);
      if (qty > 0) {
        const [b] = await q(`INSERT INTO inventory_batches (item_id, batch_no, expiry_date, quantity) VALUES ($1, $2, CASE WHEN $3::int IS NULL THEN NULL ELSE CURRENT_DATE + $3::int END, $4) RETURNING id`,
          [item.id, expiry ? 'DEMO-1' : null, days, qty]);
        await q(`INSERT INTO inventory_movements (item_id, batch_id, kind, quantity, reason) VALUES ($1, $2, 'receive', $3, 'Opening stock')`, [item.id, b.id, qty]);
      }
    }

    console.log(`Demo data created.
  Staff login (/staff/login): superadmin@demo.test (doctor), doctor@demo.test, nurse@demo.test, admin@demo.test (reception, non-clinical)
  Patient login (/login): parent@demo.test
  Password for all demo accounts: ${DEMO_PASSWORD}
  Budget PIN: 2468`);
  } finally {
    await p.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
