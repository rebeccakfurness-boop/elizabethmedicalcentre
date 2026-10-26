// Fills a LOCAL/TEST database with made-up families, patients, insurers, invoices and bills so
// every screen has something to show. Refuses to run if the database already has patients.
// Never run this against the live clinic database.
import bcrypt from 'bcryptjs';
import { initSchema, pool } from './db';

const DEMO_PASSWORD = 'demo-password-1';

async function main() {
  const p = pool();
  try {
    await initSchema(p);
    const { rows } = await p.query('SELECT COUNT(*)::int AS n FROM patients');
    if (rows[0].n > 0) throw new Error('This database already has patients; the demo seed only runs on an empty database.');

    const q = (text: string, values: unknown[] = []) => p.query(text, values).then((r) => r.rows);
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    for (const [email, name, role] of [
      ['superadmin@demo.test', 'Sam Super', 'super_admin'],
      ['admin@demo.test', 'Ari Admin', 'admin'],
      ['nurse@demo.test', 'Nia Nurse', 'staff'],
    ]) {
      await q(`INSERT INTO users (email, name, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4, false)`, [email, name, hash, role]);
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

    console.log(`Demo data created.
  Staff login (/staff/login): superadmin@demo.test, admin@demo.test, nurse@demo.test
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
