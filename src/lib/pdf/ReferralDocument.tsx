import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { CLINICAL_ROLE_LABELS } from '@/lib/auth';
import { NOTE_TYPE_LABELS, type NoteRow } from '@/lib/clinical';
import { formatClinicTime, formatDate } from '@/lib/format';
import { testNames, type LabOrderRow, type LabResultRow } from '@/lib/labs';
import { CLAY, CREAM, INK, LINE, LogoMark, PULSE, TEAL } from '@/lib/pdf/brand';
import type { ReferralRow } from '@/lib/referrals';
import { fillOpening, URGENCY_LABELS, type ReferralTemplate } from '@/clinical/referrals';

const s = StyleSheet.create({
  // No lineHeight on the page: with a fixed footer it makes the footer cover the whole page.
  page: { fontFamily: 'Helvetica', fontSize: 10, color: INK, paddingBottom: 56 },
  header: { backgroundColor: TEAL, paddingHorizontal: 40, paddingVertical: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerText: { color: CREAM, fontSize: 8.5, textAlign: 'right', lineHeight: 1.5 },
  body: { paddingHorizontal: 40, paddingTop: 18 },
  urgency: { paddingVertical: 5, paddingHorizontal: 10, color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 12 },
  row: { flexDirection: 'row', marginBottom: 12 },
  col: { flex: 1, paddingRight: 12 },
  label: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: CLAY, letterSpacing: 1, marginBottom: 2 },
  bold: { fontFamily: 'Helvetica-Bold' },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: PULSE, marginBottom: 6 },
  section: { marginTop: 9 },
  heading: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: TEAL, marginBottom: 2 },
  allergy: { marginTop: 9, padding: 7, backgroundColor: '#fde2e2', color: '#7f1d1d' },
  signature: { marginTop: 22 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: TEAL, color: CREAM, paddingVertical: 9, paddingHorizontal: 40, fontSize: 7.5, flexDirection: 'row', justifyContent: 'space-between' },
  draft: { position: 'absolute', top: 300, left: 120, fontSize: 90, color: '#f3d6cc', transform: 'rotate(-30deg)', fontFamily: 'Helvetica-Bold' },
  note: { marginTop: 10, padding: 8, borderWidth: 0.7, borderColor: LINE },
  small: { fontSize: 8, color: '#5b5450' },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: CREAM },
  thead: { flexDirection: 'row', backgroundColor: PULSE, paddingVertical: 4, paddingHorizontal: 6, marginTop: 6 },
  tr: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: LINE },
});

const URGENCY_COLOURS = { emergency: '#dc2626', urgent: '#ea580c', soon: CLAY, routine: TEAL };

export interface ReferralPdfData {
  referral: ReferralRow;
  template: ReferralTemplate;
  clinic: { legal_name: string; address: string; email: string | null; phone: string | null };
  patient: { first_name: string; last_name: string; mrn: string; date_of_birth: string | null; sex: string | null; phone: string | null; address: string | null; nationality: string | null };
  age: number | null;
  notes: NoteRow[];
  labOrders: LabOrderRow[];
  labResults: LabResultRow[];
}

function Section({ heading, text }: { heading: string; text: string | null }) {
  if (!text?.trim()) return null;
  return (
    <View style={s.section} wrap={false}>
      <Text style={s.heading}>{heading}</Text>
      <Text style={{ lineHeight: 1.3 }}>{text}</Text>
    </View>
  );
}

export function ReferralDocument({ referral: r, template, clinic, patient, age, notes, labOrders, labResults }: ReferralPdfData) {
  const patientName = `${patient.first_name} ${patient.last_name}`;
  const date = formatDate(r.finalised_at ?? r.created_at);
  const urgency = URGENCY_LABELS[r.urgency];
  return (
    <Document title={`Referral – ${patientName}`} author={r.author_name}>
      <Page size="A4" style={s.page}>
        {r.status === 'draft' ? <Text style={s.draft} fixed>DRAFT</Text> : null}
        <View style={s.header}>
          <LogoMark width={140} />
          <View>
            <Text style={s.headerText}>{clinic.legal_name}</Text>
            <Text style={s.headerText}>{clinic.address}</Text>
            <Text style={s.headerText}>{[clinic.phone, clinic.email].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
        <View style={s.body}>
          <Text style={[s.urgency, { backgroundColor: URGENCY_COLOURS[r.urgency] }]}>
            {urgency.label.toUpperCase()} REFERRAL · {urgency.help}
          </Text>
          <View style={s.row}>
            <View style={s.col}>
              <Text style={s.label}>TO</Text>
              <Text style={s.bold}>{r.recipient_name}</Text>
              {r.specialty ? <Text>{r.specialty}</Text> : null}
              {r.recipient_organisation ? <Text>{r.recipient_organisation}</Text> : null}
              {r.recipient_email ? <Text>{r.recipient_email}</Text> : null}
            </View>
            <View style={s.col}>
              <Text style={s.label}>PATIENT</Text>
              <Text style={s.bold}>{patientName}</Text>
              <Text>
                {patient.date_of_birth ? `DOB ${formatDate(patient.date_of_birth)}` : 'DOB unknown'}{age != null ? ` (${age} y)` : ''}{patient.sex ? ` · ${patient.sex}` : ''}
              </Text>
              <Text>Clinic no. {patient.mrn}{patient.nationality ? ` · ${patient.nationality}` : ''}</Text>
              {patient.phone ? <Text>Phone {patient.phone}</Text> : null}
              {patient.address ? <Text>{patient.address}</Text> : null}
            </View>
            <View style={[s.col, { flex: 0.6 }]}>
              <Text style={s.label}>DATE</Text>
              <Text>{date}</Text>
              <Text style={[s.label, { marginTop: 6 }]}>REFERENCE</Text>
              <Text>REF-{r.id}</Text>
            </View>
          </View>

          <Text style={s.title}>{template.title}</Text>
          <Text>Dear {r.recipient_name},</Text>
          <Text style={{ marginTop: 6 }}>{fillOpening(template, patientName, age)}</Text>

          <Section heading={template.headings.reason} text={r.reason} />
          <Section heading={template.headings.history} text={r.history} />
          <Section heading={template.headings.examination} text={r.examination} />
          <Section heading="Investigations" text={r.investigations} />
          <Section heading="Current medicines" text={r.medications} />
          <View style={s.allergy} wrap={false}>
            <Text style={s.bold}>Allergies: {r.allergies?.trim() || 'No known allergies'}</Text>
          </View>
          <Section heading={template.headings.management} text={r.management} />
          <Section heading="What I am asking" text={r.request} />

          <View style={s.signature} wrap={false}>
            <Text>Thank you for your help with {patient.first_name}’s care. Please send your reply to {clinic.email ?? 'the clinic'}.</Text>
            <Text style={{ marginTop: 10 }}>Yours sincerely,</Text>
            <Text style={[s.bold, { marginTop: 18 }]}>{r.author_name}</Text>
            <Text>
              {r.author_clinical_role ? CLINICAL_ROLE_LABELS[r.author_clinical_role] : ''}{r.author_registration ? ` · STR ${r.author_registration}` : ''}
            </Text>
            <Text>{clinic.legal_name}</Text>
            {r.finalised_at ? <Text style={s.small}>Signed electronically {formatClinicTime(r.finalised_at)}</Text> : null}
            {notes.length || labOrders.length ? (
              <Text style={[s.small, { marginTop: 8 }]}>
                Attached: {notes.length ? `${notes.length} clinical note${notes.length === 1 ? '' : 's'}` : ''}{notes.length && labOrders.length ? ' and ' : ''}
                {labOrders.length ? `${labOrders.length} set${labOrders.length === 1 ? '' : 's'} of results` : ''}.
              </Text>
            ) : null}
          </View>
        </View>
        <View style={s.footer} fixed>
          <Text>CONFIDENTIAL: for the named recipient only · {clinic.legal_name}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {notes.length || labOrders.length ? (
        <Page size="A4" style={s.page}>
          <View style={[s.body, { paddingTop: 30 }]}>
            <Text style={s.title}>Attachments for {patientName} ({patient.mrn})</Text>
            {notes.length ? <Text style={s.label}>CLINICAL NOTES</Text> : null}
            {notes.map((n) => (
              <View key={n.id} style={s.note} wrap={false}>
                <Text style={s.small}>
                  {NOTE_TYPE_LABELS[n.note_type]} · {n.author_name}{n.author_clinical_role ? ` (${CLINICAL_ROLE_LABELS[n.author_clinical_role]})` : ''} · {formatClinicTime(n.created_at)}
                </Text>
                {n.subjective ? <Text><Text style={s.bold}>History: </Text>{n.subjective}</Text> : null}
                {n.objective ? <Text><Text style={s.bold}>Examination: </Text>{n.objective}</Text> : null}
                {n.assessment ? <Text><Text style={s.bold}>Assessment: </Text>{n.assessment}</Text> : null}
                {n.plan ? <Text><Text style={s.bold}>Plan: </Text>{n.plan}</Text> : null}
                {n.body ? <Text>{n.body}</Text> : null}
              </View>
            ))}
            {labOrders.length ? <Text style={[s.label, { marginTop: 16 }]}>RESULTS</Text> : null}
            {labOrders.map((o) => (
              <View key={o.id} style={{ marginBottom: 10 }} wrap={false}>
                <Text style={s.bold}>{testNames(o)}</Text>
                <Text style={s.small}>
                  {o.lab_name ?? 'Lab'} · sample {formatDate(o.collected_at ?? o.created_at)}{o.status === 'reviewed' ? '' : ' · not yet reviewed by a doctor'}
                </Text>
                <View style={s.thead}>
                  <Text style={[s.th, { flex: 3 }]}>TEST</Text>
                  <Text style={[s.th, { flex: 2 }]}>RESULT</Text>
                  <Text style={[s.th, { flex: 2 }]}>RANGE</Text>
                  <Text style={[s.th, { flex: 1 }]}>FLAG</Text>
                </View>
                {labResults.filter((x) => x.order_id === o.id).map((x) => (
                  <View key={x.id} style={s.tr}>
                    <Text style={{ flex: 3 }}>{x.name}</Text>
                    <Text style={[{ flex: 2 }, x.flag ? s.bold : {}]}>{x.value}{x.unit ? ` ${x.unit}` : ''}</Text>
                    <Text style={{ flex: 2 }}>{x.ref_range ?? ''}</Text>
                    <Text style={[{ flex: 1 }, s.bold]}>{x.flag ?? ''}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
          <View style={s.footer} fixed>
          <Text>CONFIDENTIAL: for the named recipient only · {clinic.legal_name}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
        </Page>
      ) : null}
    </Document>
  );
}
