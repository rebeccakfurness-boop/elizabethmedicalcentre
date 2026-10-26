import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { LogoMark } from '@/lib/pdf/brand';
import type { InvoiceItemRow, InvoiceRow } from '@/lib/billing';
import { formatDate, formatIDR } from '@/lib/format';

const TEAL = '#466c67';
const PULSE = '#662b1d';
const CLAY = '#a35038';
const CREAM = '#f8eadb';
const INK = '#231f1f';
const LINE = '#e8ddd0';

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9.5, color: INK, paddingBottom: 60 },
  header: { backgroundColor: TEAL, paddingHorizontal: 40, paddingVertical: 26, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { color: CREAM, fontFamily: 'Helvetica-Bold', fontSize: 26 },
  meta: { color: CREAM, fontSize: 9.5, textAlign: 'right', lineHeight: 1.5 },
  body: { paddingHorizontal: 40, paddingTop: 24 },
  row: { flexDirection: 'row' },
  label: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: CLAY, letterSpacing: 1, marginBottom: 4 },
  block: { flex: 1, paddingRight: 16, lineHeight: 1.45 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: CREAM, letterSpacing: 0.8 },
  tableHead: { flexDirection: 'row', backgroundColor: PULSE, paddingVertical: 6, paddingHorizontal: 8, marginTop: 22 },
  tr: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.6, borderBottomColor: LINE },
  cDesc: { flex: 4 },
  cQty: { width: 40, textAlign: 'right' },
  cPrice: { width: 80, textAlign: 'right' },
  cAmt: { width: 90, textAlign: 'right' },
  totals: { marginTop: 12, marginLeft: 'auto', width: 230 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: PULSE },
  due: { marginTop: 8, backgroundColor: CREAM, padding: 8, flexDirection: 'row', justifyContent: 'space-between' },
  notes: { marginTop: 24, padding: 12, borderWidth: 0.8, borderColor: LINE, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: TEAL, color: CREAM, paddingVertical: 10, paddingHorizontal: 40, fontSize: 8, flexDirection: 'row', justifyContent: 'space-between' },
  stamp: { marginTop: 16, alignSelf: 'flex-start', borderWidth: 1.5, borderColor: TEAL, color: TEAL, fontFamily: 'Helvetica-Bold', fontSize: 14, paddingVertical: 4, paddingHorizontal: 10 },
});

export interface ClinicDetails {
  legal_name: string;
  address: string;
  email: string | null;
  phone: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_swift: string | null;
  invoice_footer_note: string | null;
}

export function InvoiceDocument({ invoice, items, clinic, familyEmail }: { invoice: InvoiceRow; items: InvoiceItemRow[]; clinic: ClinicDetails; familyEmail: string | null }) {
  const balance = invoice.patient_balance;
  const showInsurance = !!invoice.insurer_id && invoice.insurer_portion > 0;
  return (
    <Document title={`Invoice ${invoice.invoice_number}`} author={clinic.legal_name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <LogoMark width={150} />
          </View>
          <View>
            <Text style={s.title}>{invoice.status === 'draft' ? 'Draft invoice' : 'Invoice'}</Text>
            <Text style={s.meta}>No. {invoice.invoice_number}</Text>
            <Text style={s.meta}>Issued {formatDate(invoice.issue_date)}</Text>
            <Text style={s.meta}>Due {formatDate(invoice.due_date)}</Text>
          </View>
        </View>

        <View style={s.body}>
          <View style={s.row}>
            <View style={s.block}>
              <Text style={s.label}>BILLED TO</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{invoice.billed_to_name}</Text>
              <Text>{invoice.account_name} (account #{invoice.family_id})</Text>
              {familyEmail ? <Text>{familyEmail}</Text> : null}
            </View>
            <View style={s.block}>
              <Text style={s.label}>FROM</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{clinic.legal_name}</Text>
              <Text>{clinic.address}</Text>
              {clinic.phone ? <Text>{clinic.phone}</Text> : null}
              {clinic.email ? <Text>{clinic.email}</Text> : null}
            </View>
            {showInsurance ? (
              <View style={s.block}>
                <Text style={s.label}>INSURER</Text>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>{invoice.insurer_name}</Text>
                <Text>Covers {formatIDR(invoice.insurer_portion)}</Text>
              </View>
            ) : null}
          </View>

          <View style={s.tableHead}>
            <Text style={[s.th, s.cDesc]}>DESCRIPTION</Text>
            <Text style={[s.th, s.cQty]}>QTY</Text>
            <Text style={[s.th, s.cPrice]}>UNIT PRICE</Text>
            <Text style={[s.th, s.cAmt]}>AMOUNT</Text>
          </View>
          {items.map((it) => (
            <View key={it.id} style={s.tr} wrap={false}>
              <View style={s.cDesc}>
                <Text>{it.description}</Text>
                {it.patient_name || it.insurance_covered ? (
                  <Text style={{ fontSize: 7.5, color: '#5b5450', marginTop: 2 }}>
                    {[it.patient_name ? `Patient: ${it.patient_name}` : null, it.insurance_covered ? 'Insurance claim' : null].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
              <Text style={s.cQty}>{Number(it.quantity)}</Text>
              <Text style={s.cPrice}>{formatIDR(it.unit_price)}</Text>
              <Text style={s.cAmt}>{formatIDR(it.amount)}</Text>
            </View>
          ))}

          <View style={s.totals}>
            <View style={s.totalRow}><Text>Subtotal</Text><Text>{formatIDR(invoice.subtotal)}</Text></View>
            {invoice.discount > 0 ? <View style={s.totalRow}><Text>Discount</Text><Text>- {formatIDR(invoice.discount)}</Text></View> : null}
            {invoice.tax > 0 ? <View style={s.totalRow}><Text>Tax</Text><Text>{formatIDR(invoice.tax)}</Text></View> : null}
            <View style={s.grand}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Total</Text><Text style={{ fontFamily: 'Helvetica-Bold' }}>{formatIDR(invoice.total)}</Text></View>
            {showInsurance ? (
              <>
                <View style={s.totalRow}><Text>Billed to {invoice.insurer_name}</Text><Text>- {formatIDR(invoice.insurer_portion)}</Text></View>
                <View style={s.totalRow}><Text>Your share</Text><Text>{formatIDR(invoice.patient_portion)}</Text></View>
              </>
            ) : null}
            {invoice.patient_paid > 0 ? <View style={s.totalRow}><Text>Paid</Text><Text>- {formatIDR(invoice.patient_paid)}</Text></View> : null}
            <View style={s.due}>
              <Text style={{ fontFamily: 'Helvetica-Bold', color: PULSE }}>Balance due</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold', color: PULSE }}>{formatIDR(Math.max(0, balance))}</Text>
            </View>
          </View>

          {invoice.status === 'paid' ? <Text style={s.stamp}>PAID</Text> : null}
          {invoice.status === 'void' ? <Text style={[s.stamp, { color: CLAY, borderColor: CLAY }]}>VOID</Text> : null}

          <View style={s.notes}>
            <Text style={s.label}>HOW TO PAY</Text>
            {clinic.bank_account_number ? (
              <>
                <Text>Bank transfer to {clinic.bank_name} · {clinic.bank_account_name} · Account {clinic.bank_account_number}{clinic.bank_swift ? ` · SWIFT ${clinic.bank_swift}` : ''}</Text>
                <Text>Please use {invoice.invoice_number} as the payment reference. You can also pay at reception or upload your transfer receipt in the patient portal.</Text>
              </>
            ) : (
              <Text>Please pay at reception, or sign in to the patient portal for payment options.</Text>
            )}
            {invoice.notes ? <Text style={{ marginTop: 6 }}>{invoice.notes}</Text> : null}
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>{clinic.invoice_footer_note ?? clinic.legal_name}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
