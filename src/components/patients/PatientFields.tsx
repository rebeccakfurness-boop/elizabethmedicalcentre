import { Field, Select, TextArea } from '@/components/ui/Field';
import type { Patient } from '@/lib/patients';

export function PatientFields({ patient, insurers, includeMedical = false, clinical = false }: { patient?: Patient | null; insurers: { id: number; name: string }[]; includeMedical?: boolean; clinical?: boolean }) {
  const p = patient;
  return (
    <div className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="card-title mb-3">Personal details</legend>
        <Field label="First name" name="first_name" defaultValue={p?.first_name} required />
        <Field label="Last name" name="last_name" defaultValue={p?.last_name} required />
        <Field label="Date of birth" name="date_of_birth" type="date" defaultValue={p?.date_of_birth} />
        <Select label="Sex" name="sex" defaultValue={p?.sex} placeholder="—" options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other' }]} />
        <Field label="Nationality" name="nationality" defaultValue={p?.nationality} />
        <Field label="Passport / KTP / KITAS no." name="id_number" defaultValue={p?.id_number} />
        <Field label="Relationship to account holder" name="relationship" defaultValue={p?.relationship} placeholder="e.g. Spouse, Child" />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="card-title mb-3">Contact</legend>
        <Field label="Phone / WhatsApp" name="phone" type="tel" defaultValue={p?.phone} />
        <Field label="Email" name="email" type="email" defaultValue={p?.email} />
        <Field label="Address in Lombok" name="address" defaultValue={p?.address} />
        <Field label="Emergency contact name" name="emergency_contact_name" defaultValue={p?.emergency_contact_name} />
        <Field label="Emergency contact phone" name="emergency_contact_phone" type="tel" defaultValue={p?.emergency_contact_phone} />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="card-title mb-3">Insurance</legend>
        <Select label="Insurer" name="insurer_id" defaultValue={p?.insurer_id} placeholder="Self-pay (no insurance)" options={insurers.map((i) => ({ value: i.id, label: i.name }))} />
        <Field label="Policy / member no." name="insurance_policy_number" defaultValue={p?.insurance_policy_number} />
        <Field label="Name on policy" name="insurance_member_name" defaultValue={p?.insurance_member_name} />
        <Field label="Policy expiry" name="insurance_expiry" type="date" defaultValue={p?.insurance_expiry} />
      </fieldset>
      {includeMedical ? (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="card-title mb-3">Medical</legend>
          <Select label="Blood type" name="blood_type" placeholder="Unknown" options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((v) => ({ value: v, label: v }))} />
          <TextArea label="Allergies" name="allergies" placeholder="e.g. Penicillin – rash" />
          {clinical ? (
            <>
              <TextArea label="Current medications" name="current_medications" />
              <TextArea label="Medical notes" name="medical_notes" />
            </>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}
