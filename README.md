# The Doctors – Elizabeth Medical Centre

The clinic's website and patient and staff portal. It has three parts:

- **Public site** (`/`): the "coming soon" page, built from the brand guidelines.
- **Patient portal** (`/login` → `/portal`): families see their patient cards, invoices and insurance claims, and pay their bill.
- **Staff dashboard** (`/staff/login` → `/dashboard`): patient cards, family accounts, invoicing, insurance billing, payments, and a PIN-locked finance area with the budget tracker, bills and bank statements.

The prominent **Patient login** button sits top-right on the website. The **Staff** login is a small, low-contrast link in the footer.

## Stack

Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS, with Postgres via `pg`. It's designed for Vercel with Neon Postgres and a private Vercel Blob store. It follows the patterns of the Selong Bay School system: iron-session cookies, bcrypt passwords, tables created automatically on first use, `@react-pdf/renderer` invoices and Brevo email.

## Roles

| Role | Can do |
| --- | --- |
| Patient | Sees only their own family: patient cards, invoices (PDF), insurance claims and payments. Can update contact details and pay invoices by uploading a transfer receipt. |
| Staff | Finds and views patient cards, checks patients in to the clinic, records allergies and blood type, and writes admin notes. |
| Admin | Everything staff can do, plus: creates patients and family accounts, links family members, creates and resets patient portal logins, and manages staff accounts. |
| Super admin | Everything, plus: invoicing, payments, insurance claims, clinic settings and admin accounts. Also opens the PIN-locked finance area (budget tracker, bills to pay, bank statements, transactions). |

**Clinical access** is a separate setting on each staff account (doctor, nurse, midwife, pharmacist), which only a super admin can grant on **Staff accounts**. It is what unlocks clinical notes, triage, medications and the protocols; only doctors can prescribe and approve clinical content. An admin or super admin without a clinical role sees no clinical-only notes.

Permissions are defined in one place (`PERMISSIONS` in `src/lib/auth.ts`). Every page and server action checks them against the database, not just the menu. For example, to let front-desk admins take payments, add `'admin'` to `finance` there.

## Patient cards and family accounts

These work like the student cards and family linking in the Selong Bay system:

- Every patient has a **patient card**: an MRN (`EMC-1001`…), personal and contact details, a highlighted allergies box, medications and notes, insurance details, family members and billing.
- Patients belong to a **family account**, which is the billing account. Invoices, payments and the balance live on the family, so one parent can see and pay for the whole family from one portal login. Admins add members with **Add family member** on the family page.

## Clinical records

Built for a walk-in clinic in Kuta, Lombok (`/dashboard/clinic`, `/dashboard/encounters/…`, `src/clinical/`).

- **Clinic board.** Anyone at the front desk checks a patient in (from the board or the patient card) with the reason for the visit. The board sorts by triage category, then waiting time, and flags anyone past their target time.
- **Triage.** SATS-based: adult TEWS from vital signs, age-specific limits for children, and clinical signs (including Lombok ones: methanol from arak, dengue warning signs, marine stings, rabies-risk bites). The category is calculated on the server; staff can raise it but never lower it. Repeat observations warn if the patient is getting worse.
- **Protocols.** 20 step-by-step protocols for the most common presentations (fever and dengue, travellers' diarrhoea, scooter injuries and road rash, head injury, burns, jellyfish and sea urchin, dog and monkey bites, surfer's ear, cellulitis, asthma, anaphylaxis, chest pain, heat illness, methanol, UTI, red eye…). The visit page suggests one from the complaint and shows red flags, management, prescribing links, referral (RSUD Praya / Mataram, 119) and follow-up.
- **Notes.** SOAP or free-text, signed notes cannot be edited (corrections are addenda), and every note is one of: 🔒 *clinical staff only* (the default), 👥 *all staff* or 🏠 *shared with the patient* (appears in their portal). Who can read what is enforced in the database queries, not just the screen.
- **Dictation.** Every note box has a 🎙 Dictate button (English or Bahasa Indonesia) using the browser's speech recognition. In Chrome the audio goes to Google, so a super admin can switch dictation off under **Clinic settings**.
- **Prescriptions.** Doctors pick from a 28-item formulary with adult and child doses. The page checks for allergies as you type, and issuing over a penicillin or other drug-class allergy needs a written reason, which is logged. The printed prescription comes with an **information sheet for every medicine** (with the patient's own dose) and **patient leaflets** for the condition (18 leaflets). Families can reprint them from the portal.
- **Blood tests.** Order from a visit or the patient card; the visit's protocol pre-ticks the usual tests (e.g. FBC, NS1, dengue serology and LFTs for dengue). Print a lab request form, then type the results in or upload the lab's report (PDF or photo). With `ANTHROPIC_API_KEY` set, the app can read the values off the report for you to check before saving. Results are flagged H/L against the lab's printed range (or ours), with critical values (‼ LL/HH) at the top of the **Blood tests** inbox and on the dashboard, and earlier values shown alongside for trends.
- **Sharing results.** Results stay on the clinical record until a doctor reviews them. The doctor ticks exactly which results (and whether the full report) the family can see, and can add a plain-language message. Editing results afterwards sends them back for review. Lab reports are never shown to finance or reception staff.
- **Referrals.** Six templates: emergency transfer, hospital admission, specialist opinion, allied health, imaging and rabies post-exposure treatment. The letter is pre-filled from the visit (reason, history, examination and latest observations, recent results, medicines, allergies, management). Pick the recipient from the **Referral directory** (hospitals, specialists, allied health), confirm patient consent, sign, then email the PDF letter with the chosen clinical notes and results attached, or print it. The email body only shows the patient's initials, and replies go to the referring clinician. Record the outcome and upload the reply letter when it comes back. A signed letter can be shared to the patient portal.
- **Billing link.** After a visit, **Create invoice for this visit** fills in the consultation fee (Clinic settings) and each medicine, and links the invoice to the visit.
- **Clinical content approval.** Protocols, triage rules, drug sheets and leaflets are written as drafts based on WHO and common international guidance. Each one shows a "not yet approved" warning until a doctor reviews and approves it (Protocols / Formulary pages). Editing content in `src/clinical/*.ts` means bumping its `version`, which asks for approval again.

## Invoicing, insurance and payments

- **Invoices.** Invoices have line items per patient, with a common-items list, a discount and an optional tax rate. You can save a draft, issue, edit, void, download a branded PDF and email it (Brevo). Numbers run `EMC-00001`…
- **Insurance billing.** Pick an insurer on the invoice and tick the lines it covers. The invoice then splits into an insurer share and a family share, and both are tracked separately.
  - **Start insurance claim** creates a claim that moves through draft → submitted → approved, partly approved or rejected → paid.
  - Insurer payments are recorded against the claim, or matched from the bank statement.
  - If the insurer pays less than claimed, **Move shortfall to family** puts the difference on the family's bill.
- **Customer payments:**
  - At reception: cash, card, QRIS or bank transfer, recorded on the invoice with an optional receipt.
  - Online: in the portal, the family sees the clinic's bank details and the invoice number to use as the reference, then uploads their transfer receipt. The payment shows as "checking" until a super admin confirms it under **Payments**, or until it's matched on a bank statement.
  - There's no card payment gateway yet. See "Next steps".

## Finance area (PIN-locked)

The finance area needs the super admin login and a separate 4–8 digit **budget PIN**, set in Clinic settings. The PIN locks again after 30 minutes, or straight away with **Lock**. Five wrong PINs block entry for 15 minutes, and every unlock is logged.

- **Budget tracker.** Shows monthly budgets per category against actual spending. Bars are teal below 80%, amber at 80–100% and red when over. Money in, money out, net, a cash position from an opening balance, and a six-month trend are also shown. Budget changes are logged with who made them.
- **Bills to pay.** Upload a supplier bill (PDF or photo) with an amount, due date and category, then mark it paid. You can also record an expense that's already been paid.
- **Bank statements.** Upload the CSV or Excel export from internet banking.
  - The importer reads BCA-style `CR`/`DB` amounts, Mandiri-style debit and credit columns, signed amounts, Indonesian number formats and day-first dates. Lines already imported are skipped.
  - PDF statements are read by Claude when `ANTHROPIC_API_KEY` is set.
  - **Auto-match** only matches confident lines: an exact amount plus a matching name or invoice number.
  - Every other line gets ranked suggestions: an invoice (family or insurer share), a patient-reported payment, or an unpaid bill. You can also record it as other income or an expense, or ignore it. **Undo** reverses any match.
- **Transactions.** A combined in/out ledger with search, date range and links to receipts.

## Security and privacy

Patient records are health data under Indonesia's PDP law (UU 27/2022):

- Every sign-in, patient-card view and change is written to `audit_log`. The most recent entries appear in Clinic settings.
- Passwords are hashed with bcrypt. Accounts lock for 15 minutes after five failed attempts. Logins created by staff use a one-time temporary password that must be changed at first sign-in.
- Uploaded files go to a **private** Blob store and are only served through `/api/files/[id]` after a permission check. Patients only ever see their own family's files and invoices.
- Patients see their allergies, medications and blood type in the portal, but never the clinical notes.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and SESSION_SECRET at least
npm run db:init              # creates tables (also happens automatically on first request)
npm run db:create-user -- you@clinic.com "Your Name" super_admin   # prints a one-time password
npm run dev
```

On a fresh deployment where you can't run scripts, set a `SETUP_TOKEN` environment variable instead and open `/setup`: it creates the first super admin and closes for good once any staff account exists.

Then sign in at `/staff/login`, set the budget PIN and bank details in **Clinic settings**, and add your insurers under **Insurance claims**.

To try every screen locally with made-up data, run `npm run db:seed-demo` against an **empty, local** database. It refuses to run if any patients exist. Demo logins are printed at the end.

### Environment variables

See `.env.example`.

- **Required:** `DATABASE_URL` and `SESSION_SECRET` (at least 32 random characters).
- **Uploads:** `BLOB_READ_WRITE_TOKEN`, from a Vercel Blob store created with *private* access. Without it, uploads are saved to `.data/uploads`, which is for local development only.
- **Optional:**
  - `ANTHROPIC_API_KEY`: reads PDF bank statements.
  - `BREVO_API_KEY` and `EMAIL_FROM`: email invoices.
  - `NEXT_PUBLIC_SITE_URL`.
  - `NEXT_PUBLIC_NOTIFY_FORM_ENDPOINT`: a Formspree-style endpoint for the "Notify me" form. Until it's set, the form tells visitors sign-ups aren't open yet.

Uploads are capped at 4 MB because Vercel functions reject larger request bodies.

### Checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

`npm test` covers the bank-statement parser and the invoice and insurance-split maths.

## Brand

The palette, logos and typography come from the brand guidelines (Daniela Design Studio):

- **Colours:** Vitality Clay `#a35038`, Clinical Off-White `#e3ceb1`, Medical Teal `#466c67`, Healing Sage `#9aa585`, Pulse Red `#662b1d`.
- **Logos:** vector logos extracted from the PDF are in `public/assets/logo/` and `src/components/brand-svg.ts`.
- **Fonts:** the brand typefaces aren't available as webfonts, so Google Fonts stand in. Nunito replaces TD Arial, expanded Archivo replaces Elizabeth Sans, Montserrat is used for labels, and Instrument Serif replaces Marlide Display. To use the licensed fonts, swap them in `src/app/layout.tsx`.

## Next steps

- **Online card payments.** Add a payment gateway such as Xendit or Midtrans for cards, VA and e-wallets, and record its webhook as a confirmed payment.
- **Patient self-service.** Password reset by email and self sign-up. Logins are currently created by the clinic.
- **Appointments.** Booking is not built yet; visits start from check-in.
- **Bahasa Indonesia leaflets.** Patient sheets are in English only for now.
- **Lab integration.** Results arrive by upload or typing; labs can't send results straight into the system yet.
