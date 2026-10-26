// Starter content for the operations area. Staff edit everything after it's added.

import type { Frequency, Priority } from '@/lib/ops-shared';

export interface ChecklistTemplate {
  title: string;
  area: string;
  frequency: Frequency;
  weekday?: number;
  dueTime?: string;
  instructions?: string;
  reading?: { unit: string; min?: number; max?: number };
}

/** Suggested recurring checks for a walk-in clinic. */
export const SUGGESTED_CHECKLISTS: ChecklistTemplate[] = [
  { title: 'Unlock, lights and air-con on, check overnight messages and WhatsApp', area: 'Opening', frequency: 'daily', dueTime: '07:45' },
  { title: 'Vaccine fridge temperature (morning)', area: 'Opening', frequency: 'daily', dueTime: '08:00', instructions: 'Read the min/max thermometer, record the current temperature, then reset it. Must be 2–8 °C. If outside range, quarantine vaccines and tell the doctor.', reading: { unit: '°C', min: 2, max: 8 } },
  { title: 'Medicine room temperature', area: 'Opening', frequency: 'daily', dueTime: '08:00', instructions: 'Most medicines must be kept below 30 °C.', reading: { unit: '°C', max: 30 } },
  { title: 'Oxygen cylinder pressure', area: 'Opening', frequency: 'daily', dueTime: '08:00', instructions: 'Swap the cylinder when the gauge is in the red; order a refill.', reading: { unit: 'bar', min: 50 } },
  { title: 'Clean and set up consulting and treatment rooms', area: 'Cleaning', frequency: 'daily', dueTime: '08:15' },
  { title: 'Check sharps bins (replace when ¾ full)', area: 'Cleaning', frequency: 'daily', dueTime: '08:15' },
  { title: 'Glucometer quality control', area: 'Clinical', frequency: 'daily', dueTime: '08:30', instructions: 'Run control solution and record the reading.', reading: { unit: 'mmol/L' } },
  { title: 'Cash float counted and matches the record', area: 'Reception', frequency: 'daily', dueTime: '08:30' },
  { title: 'Vaccine fridge temperature (afternoon)', area: 'Closing', frequency: 'daily', dueTime: '16:00', reading: { unit: '°C', min: 2, max: 8 } },
  { title: 'Restock rooms from the store; record what was used', area: 'Closing', frequency: 'daily', dueTime: '17:30' },
  { title: 'Medical waste bagged, labelled and stored for collection', area: 'Closing', frequency: 'daily', dueTime: '17:30' },
  { title: 'Cash up, card terminal end-of-day report, lock up', area: 'Closing', frequency: 'daily', dueTime: '18:00' },
  { title: 'Emergency trolley / bag check (adrenaline, airway, oxygen, defibrillator pads, expiry dates)', area: 'Clinical', frequency: 'weekly', weekday: 1, instructions: 'Tick only when every item is present and in date. Seal the trolley afterwards.' },
  { title: 'AED self-test and battery check', area: 'Clinical', frequency: 'weekly', weekday: 1 },
  { title: 'Stock count of medicines and consumables', area: 'Stock', frequency: 'weekly', weekday: 5, instructions: 'Update counts in Inventory and place any orders.' },
  { title: 'Remove expired stock (check Inventory → expiring soon)', area: 'Stock', frequency: 'monthly' },
  { title: 'Deep clean, including fridges and storage shelves', area: 'Cleaning', frequency: 'monthly' },
  { title: 'Fire extinguisher and first-aid kit check', area: 'Safety', frequency: 'monthly' },
];

export interface LaunchCard {
  title: string;
  list: 'Backlog' | 'To do' | 'In progress' | 'Waiting on others' | 'Done';
  label: string;
  /** Weeks from the board's start date. */
  startWeek?: number;
  dueWeek: number;
  priority?: Priority;
  description?: string;
  checklist?: string[];
}

export const LAUNCH_LISTS = ['Backlog', 'To do', 'In progress', 'Waiting on others', 'Done'] as const;

/**
 * A six-month launch plan for a private clinic in Lombok. Requirements and processes change: confirm
 * licensing steps with the Dinas Kesehatan and your legal adviser before relying on them.
 */
export const LAUNCH_CARDS: LaunchCard[] = [
  // Licensing and legal
  { title: 'Company set-up: NIB via OSS, tax number (NPWP), company bank account', list: 'To do', label: 'Finance & legal', dueWeek: 3, priority: 'urgent', checklist: ['Confirm business structure and KBLI codes with adviser', 'NIB issued through OSS', 'NPWP registered', 'Company bank account opened', 'Bank details added to Clinic settings'] },
  { title: 'Clinic operating licence (izin klinik) with Dinas Kesehatan / OSS', list: 'To do', label: 'Licensing', startWeek: 1, dueWeek: 12, priority: 'urgent', description: 'Confirm current requirements with Dinas Kesehatan Kabupaten Lombok Tengah. Usually needs building, staffing, equipment and SOP documentation and an inspection.', checklist: ['Get the current document checklist from Dinas Kesehatan', 'Floor plan and building documents', 'Staff list with STR/SIP', 'Equipment list', 'SOPs and clinic profile', 'Inspection booked', 'Licence received'] },
  { title: 'Doctor and nurse registration (STR) and practice permits (SIP) for this clinic', list: 'To do', label: 'Licensing', dueWeek: 10, priority: 'high', checklist: ['Copies of STR for every clinician', 'SIP applications submitted', 'SIP issued', 'Registration numbers entered in Staff accounts'] },
  { title: 'Pharmacy / medicine supply arrangement and pharmacist in charge', list: 'Backlog', label: 'Licensing', dueWeek: 14, priority: 'high', description: 'Confirm what the licence allows for dispensing and who must be the responsible pharmacist.' },
  { title: 'Medical waste (B3) collection contract with a licensed transporter', list: 'Backlog', label: 'Licensing', dueWeek: 12, priority: 'high', checklist: ['Get quotes from licensed providers', 'Contract signed', 'Storage area set up', 'Collection schedule agreed'] },
  { title: 'Professional indemnity and business insurance', list: 'Backlog', label: 'Finance & legal', dueWeek: 14, checklist: ['Indemnity for each clinician', 'Public liability', 'Property / contents'] },
  { title: 'Employment contracts, payroll and BPJS Ketenagakerjaan / Kesehatan for staff', list: 'Backlog', label: 'Finance & legal', dueWeek: 16 },
  { title: 'Patient privacy policy, consent forms and data protection (UU PDP)', list: 'Backlog', label: 'Finance & legal', dueWeek: 18 },

  // Building
  { title: 'Lease signed and handover of premises', list: 'To do', label: 'Building & fit-out', dueWeek: 2, priority: 'urgent' },
  { title: 'Fit-out: consulting rooms, treatment room, waiting area, accessible toilet', list: 'To do', label: 'Building & fit-out', startWeek: 2, dueWeek: 10, priority: 'high', checklist: ['Design agreed', 'Contractor quotes', 'Electrical and lighting', 'Plumbing and hand-wash basins', 'Air-con', 'Flooring and wipe-clean surfaces', 'Final walk-through'] },
  { title: 'Backup power (generator or UPS) for fridge, lights and IT', list: 'Backlog', label: 'Building & fit-out', dueWeek: 10, priority: 'high' },
  { title: 'Signage (outside, wayfinding, opening hours, emergency number)', list: 'Backlog', label: 'Building & fit-out', dueWeek: 14 },
  { title: 'Secure medicine store and controlled cupboard', list: 'Backlog', label: 'Building & fit-out', dueWeek: 12 },

  // Equipment and stock
  { title: 'Equipment list and purchasing (exam couches, BP monitors, ECG, oximeters, otoscopes)', list: 'To do', label: 'Equipment', startWeek: 4, dueWeek: 12, priority: 'high' },
  { title: 'Emergency trolley: defibrillator/AED, oxygen, suction, airway kit, emergency drugs', list: 'To do', label: 'Equipment', dueWeek: 12, priority: 'urgent' },
  { title: 'Vaccine fridge with min/max thermometer and temperature log', list: 'Backlog', label: 'Equipment', dueWeek: 12 },
  { title: 'Point-of-care tests: glucometer, Hb, dengue NS1, malaria RDT, urine dipsticks, pregnancy tests', list: 'Backlog', label: 'Equipment', dueWeek: 14 },
  { title: 'Opening stock of medicines and consumables entered into Inventory', list: 'Backlog', label: 'Equipment', dueWeek: 16, checklist: ['Suppliers added', 'Items added with reorder levels', 'Opening stock received with batch and expiry'] },

  // Clinical
  { title: 'Medical director reviews and approves protocols, formulary and leaflets', list: 'To do', label: 'Clinical', dueWeek: 14, priority: 'high', description: 'Dashboard → Protocols and Formulary & leaflets. Each item shows "Draft" until approved.' },
  { title: 'Lab arrangements (Prodia / Kimia Farma / hospital lab): pickup, result emails, prices', list: 'Backlog', label: 'Partnerships', dueWeek: 14 },
  { title: 'Hospital transfer agreement and ambulance contact (RSUD Praya, Mataram hospitals)', list: 'Backlog', label: 'Partnerships', dueWeek: 14, priority: 'high', checklist: ['Contacts added to the Referral directory', 'Transfer process agreed', 'Ambulance numbers posted at reception'] },
  { title: 'Infection prevention and control SOPs, sterilisation and cleaning schedule', list: 'Backlog', label: 'Clinical', dueWeek: 16 },
  { title: 'Clinical SOPs: triage, emergencies, consent, chaperones, incident reporting', list: 'Backlog', label: 'Clinical', dueWeek: 18 },

  // Staffing
  { title: 'Recruit receptionist / clinic coordinator', list: 'To do', label: 'Staffing', startWeek: 4, dueWeek: 12 },
  { title: 'Recruit nurses (shift cover for opening hours)', list: 'To do', label: 'Staffing', startWeek: 4, dueWeek: 14, priority: 'high' },
  { title: 'Locum / on-call doctor rota', list: 'Backlog', label: 'Staffing', dueWeek: 16 },
  { title: 'Staff training: BLS/ACLS, triage system, this portal, privacy', list: 'Backlog', label: 'Staffing', startWeek: 16, dueWeek: 19, checklist: ['BLS for all staff', 'ACLS for clinicians', 'Triage and protocols walk-through', 'Portal training: check-in, notes, billing', 'Privacy and confidentiality'] },

  // IT
  { title: 'Portal set-up: staff accounts, clinical roles, clinic settings', list: 'To do', label: 'IT & systems', dueWeek: 4, checklist: ['Super admin created', 'Staff accounts and clinical roles', 'Invoice details and bank in Clinic settings', 'Budget PIN set', 'Consultation fee set'] },
  { title: 'Email sending (Brevo) and domain email for invoices and referrals', list: 'To do', label: 'IT & systems', dueWeek: 6, checklist: ['Brevo account and verified sender', 'BREVO_API_KEY and EMAIL_FROM set in Vercel', 'Test invoice email', 'Test referral email'] },
  { title: 'Internet, Wi-Fi, printer, card terminal (EDC) and QRIS', list: 'Backlog', label: 'IT & systems', dueWeek: 14 },
  { title: 'Insurance direct-billing agreements with travel insurers and assistance companies', list: 'Backlog', label: 'Partnerships', dueWeek: 20, description: 'Add each insurer under Insurance claims with their claims email.' },

  // Marketing
  { title: 'Google Business Profile, Maps pin and reviews', list: 'To do', label: 'Marketing', dueWeek: 8 },
  { title: 'Social media launch posts (coming soon → open)', list: 'To do', label: 'Marketing', dueWeek: 18 },
  { title: 'Partnerships with hotels, villas, surf camps and dive schools in Kuta', list: 'Backlog', label: 'Partnerships', dueWeek: 20 },
  { title: 'Website: switch "coming soon" to opening details and online patient login', list: 'Backlog', label: 'Marketing', dueWeek: 20 },

  // Opening
  { title: 'Soft opening: trial run with staff and friends', list: 'Backlog', label: 'Clinical', dueWeek: 21, priority: 'high' },
  { title: 'Official opening', list: 'Backlog', label: 'Marketing', dueWeek: 22, priority: 'high' },
  { title: 'Three-month review: patient numbers, finances, staffing, what to improve', list: 'Backlog', label: 'Finance & legal', dueWeek: 34 },
];
