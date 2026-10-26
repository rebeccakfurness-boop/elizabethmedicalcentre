import 'server-only';
import { getClinicSettings, getInvoice } from '@/lib/billing';
import { formatDate, formatIDR } from '@/lib/format';
import { renderInvoicePdf, renderReferralPdf } from '@/lib/pdf/render';
import { getReferral } from '@/lib/referrals';
import { URGENCY_LABELS } from '@/clinical/referrals';
import { getAppointment, getDueReminders, logAppointmentEvent, siteUrl, type Appointment } from '@/lib/appointments';
import { buildIcs, formatClinicDateTime } from '@/lib/booking-shared';
import { sql } from '@/lib/db';

// Transactional email via Brevo's REST API (same provider as the Selong Bay system).
// Needs BREVO_API_KEY and EMAIL_FROM (a sender address verified in Brevo).

async function send(input: { to: string; subject: string; html: string; attachment?: { name: string; content: string }; replyTo?: { email: string; name: string } }) {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error('Email isn’t set up yet (BREVO_API_KEY and EMAIL_FROM). Download the PDF and send it yourself for now.');
  // BREVO_API_URL is only for pointing tests at a local mock.
  const res = await fetch(process.env.BREVO_API_URL ?? 'https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: 'The Doctors – Elizabeth Medical Centre' },
      to: [{ email: input.to }],
      bcc: [{ email: from }],
      subject: input.subject,
      htmlContent: input.html,
      attachment: input.attachment ? [input.attachment] : undefined,
      replyTo: input.replyTo,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`The email couldn’t be sent (${res.status}). ${body.slice(0, 200)}`);
  }
}

export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function sendInvoiceEmail(invoiceId: number, to: string): Promise<void> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error('That email address doesn’t look right.');
  const invoice = await getInvoice(invoiceId);
  if (!invoice) throw new Error('Invoice not found.');
  if (invoice.status === 'draft') throw new Error('Issue the invoice before emailing it.');
  const clinic = await getClinicSettings();
  const pdf = await renderInvoicePdf(invoiceId);
  const portalUrl = process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL}/login` : null;
  await send({
    to,
    subject: `Invoice ${invoice.invoice_number} from The Doctors – Elizabeth Medical Centre`,
    html: `<p>Dear ${escape(invoice.billed_to_name)},</p>
      <p>Please find attached invoice <strong>${invoice.invoice_number}</strong> dated ${formatDate(invoice.issue_date)}.</p>
      <p>Balance due: <strong>${formatIDR(invoice.patient_balance)}</strong> by ${formatDate(invoice.due_date)}.</p>
      ${clinic.bank_account_number ? `<p>Bank transfer: ${escape(clinic.bank_name ?? '')} · ${escape(clinic.bank_account_name ?? '')} · ${escape(clinic.bank_account_number)} (reference ${invoice.invoice_number}).</p>` : ''}
      ${portalUrl ? `<p>You can also view and pay your invoices in the <a href="${portalUrl}">patient portal</a>.</p>` : ''}
      <p>Warm regards,<br>The Doctors – Elizabeth Medical Centre</p>`,
    attachment: { name: pdf.fileName, content: pdf.buffer.toString('base64') },
  });
}

/**
 * Sends a signed referral letter as a PDF. The email body names nobody: patient details are only in
 * the attachment. Replies go straight to the referring clinician.
 */
export async function sendReferralEmail(referralId: number, to: string, opts: { toPatient?: boolean } = {}): Promise<void> {
  if (!isEmail(to)) throw new Error('That email address doesn’t look right.');
  const r = await getReferral(referralId);
  if (!r) throw new Error('Referral not found.');
  if (r.status === 'draft' || r.status === 'cancelled') throw new Error('Sign the referral before sending it.');
  const pdf = await renderReferralPdf(referralId);
  const initials = `${r.first_name[0] ?? ''}${r.last_name[0] ?? ''}`.toUpperCase();
  const urgency = URGENCY_LABELS[r.urgency].label;
  await send({
    to,
    subject: opts.toPatient
      ? 'Your referral letter from The Doctors – Elizabeth Medical Centre'
      : `${urgency} referral REF-${r.id} (patient ${initials}) from The Doctors – Elizabeth Medical Centre`,
    html: opts.toPatient
      ? `<p>Dear ${escape(r.first_name)},</p>
        <p>Attached is a copy of the referral letter ${escape(r.author_name)} wrote for you to ${escape(r.recipient_organisation ?? r.recipient_name)}.
        Please take it (on your phone or printed) to your appointment.</p>
        <p>If you feel worse before then, contact the clinic or call 119 in an emergency.</p>
        <p>Warm regards,<br>The Doctors – Elizabeth Medical Centre</p>`
      : `<p>Dear ${escape(r.recipient_name)},</p>
        <p>Please find attached a <strong>${urgency.toLowerCase()}</strong> referral (reference REF-${r.id}) from ${escape(r.author_name)}
        at The Doctors – Elizabeth Medical Centre, Kuta, Lombok, for a patient with initials ${escape(initials)}.</p>
        <p>The attachment contains confidential health information. Replying to this email reaches ${escape(r.author_name)} directly.</p>
        <p>If you have received this in error, please delete it and let us know.</p>
        <p>With thanks,<br>${escape(r.author_name)}<br>The Doctors – Elizabeth Medical Centre</p>`,
    attachment: { name: pdf.fileName, content: pdf.buffer.toString('base64') },
    replyTo: { email: r.author_email, name: r.author_name },
  });
}

// ---------- Appointments ----------

export type AppointmentEmailKind = 'booked' | 'confirmed' | 'reminder' | 'rescheduled' | 'cancelled';

function appointmentDetails(a: Appointment, clinic: { address: string; phone: string | null; telehealth_video_link: string | null }) {
  const when = formatClinicDateTime(a.starts_at);
  switch (a.kind) {
    case 'clinic':
      return {
        where: `The Doctors – Elizabeth Medical Centre, ${clinic.address}`,
        html: `<p><strong>${escape(when)}</strong> at the clinic.<br>${escape(clinic.address)}<br>
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`The Doctors Elizabeth Medical Centre ${clinic.address}`)}">Open in Google Maps</a></p>
          <p>Please bring your passport or ID, your travel insurance details, and any medicines you take.</p>`,
      };
    case 'home_visit':
      return {
        where: a.address ?? 'Home visit',
        html: `<p><strong>${escape(when)}</strong>: a doctor will come to <strong>${escape(a.address ?? 'the address you gave')}</strong>.</p>
          <p>We will message you on ${escape(a.phone ?? 'your phone')} when the doctor is on the way.</p>`,
      };
    case 'telehealth': {
      const link = a.video_link ?? clinic.telehealth_video_link;
      return {
        where: a.telehealth_mode === 'video' && link ? link : 'Phone call',
        html:
          a.telehealth_mode === 'video'
            ? `<p><strong>${escape(when)}</strong>: video consultation. ${link ? `Join here at the time of your appointment: <a href="${escape(link)}">${escape(link)}</a>` : 'We will send you the video link before the appointment.'}</p>`
            : `<p><strong>${escape(when)}</strong>: the doctor will phone you on <strong>${escape(a.phone ?? 'the number you gave')}</strong>.</p>`,
      };
    }
    default:
      return {
        where: clinic.address,
        html: `<p>We are expecting you at the clinic: ${escape(clinic.address)}.</p>
          <p><strong>If you get worse, call 119 (ambulance) or go to the nearest emergency department.</strong></p>`,
      };
  }
}

/** Patient emails for a booking. Returns false (and logs why) if it couldn't be sent. */
export async function sendAppointmentEmail(appointmentId: number, kind: AppointmentEmailKind): Promise<boolean> {
  const a = await getAppointment(appointmentId);
  if (!a?.email) return false;
  const clinic = await getClinicSettings();
  const manage = a.manage_token ? `${await siteUrl()}/book/manage/${a.manage_token}` : null;
  const d = appointmentDetails(a, clinic);
  const pending = a.status === 'requested';
  const subjects: Record<AppointmentEmailKind, string> = {
    booked: pending ? `We’ve received your request: ${a.type_name}` : a.kind === 'walk_in' ? 'We’re expecting you' : `Booking confirmed: ${formatClinicDateTime(a.starts_at)}`,
    confirmed: `Booking confirmed: ${formatClinicDateTime(a.starts_at)}`,
    reminder: `Reminder: your appointment ${formatClinicDateTime(a.starts_at)}`,
    rescheduled: `Appointment moved to ${formatClinicDateTime(a.starts_at)}`,
    cancelled: 'Your appointment has been cancelled',
  };
  const intro: Record<AppointmentEmailKind, string> = {
    booked: pending
      ? `Thank you. We have received your request for a <strong>${escape(a.type_name.toLowerCase())}</strong>. We will confirm the time with you shortly.`
      : `Your <strong>${escape(a.type_name.toLowerCase())}</strong> is booked.`,
    confirmed: `Your <strong>${escape(a.type_name.toLowerCase())}</strong> is confirmed.`,
    reminder: `This is a reminder of your <strong>${escape(a.type_name.toLowerCase())}</strong>.`,
    rescheduled: `Your appointment has been moved.`,
    cancelled: `Your appointment for ${escape(formatClinicDateTime(a.starts_at))} has been cancelled${a.cancel_reason ? ` (${escape(a.cancel_reason)})` : ''}. If you still need to see us, you can book again online or call us.`,
  };
  const body = `<p>Dear ${escape(a.name)},</p>
    <p>${intro[kind]}</p>
    ${kind === 'cancelled' ? '' : d.html}
    ${manage && kind !== 'cancelled' && a.kind !== 'walk_in' ? `<p>Need to change it? <a href="${manage}">Reschedule or cancel your appointment</a>.</p>` : ''}
    ${clinic.phone ? `<p>Questions? Call or WhatsApp ${escape(clinic.phone)}.</p>` : ''}
    <p>In an emergency call 119.</p>
    <p>Warm regards,<br>The Doctors – Elizabeth Medical Centre</p>`;
  const withInvite = a.kind !== 'walk_in' && (kind === 'cancelled' || !pending);
  const ics = withInvite
    ? buildIcs({
        uid: `appointment-${a.id}@elizabethmedicalcentre`,
        sequence: a.ics_sequence,
        start: a.starts_at,
        end: a.ends_at,
        summary: `${a.type_name} – The Doctors`,
        description: `${a.type_name}${manage ? `\nChange or cancel: ${manage}` : ''}`,
        location: d.where,
        organizerEmail: clinic.email,
        cancelled: kind === 'cancelled',
      })
    : null;
  try {
    await send({
      to: a.email,
      subject: subjects[kind],
      html: body,
      attachment: ics ? { name: 'appointment.ics', content: Buffer.from(ics).toString('base64') } : undefined,
    });
    await logAppointmentEvent(a.id, 'email', kind);
    return true;
  } catch (err) {
    await logAppointmentEvent(a.id, 'email_failed', `${kind}: ${err instanceof Error ? err.message : 'unknown error'}`.slice(0, 300));
    return false;
  }
}

/** Tells the clinic about new online bookings (and urgent walk-ins). No clinical detail beyond the reason given. */
export async function notifyClinicOfBooking(appointmentId: number, event: 'new' | 'rescheduled' | 'cancelled' = 'new'): Promise<void> {
  const a = await getAppointment(appointmentId);
  const clinic = await getClinicSettings();
  const to = clinic.booking_notify_email ?? clinic.email;
  if (!a || !to) return;
  const link = `${await siteUrl()}/dashboard/appointments/${a.id}`;
  const urgent = a.kind === 'walk_in' || a.red_flags.length > 0;
  try {
    await send({
      to,
      subject: `${urgent && event === 'new' ? 'URGENT – ' : ''}${event === 'cancelled' ? 'Cancelled' : event === 'rescheduled' ? 'Moved' : a.status === 'requested' ? 'Booking request' : 'New booking'}: ${a.type_name}, ${formatClinicDateTime(a.starts_at)}`,
      html: `<p><strong>${escape(a.type_name)}</strong> – ${escape(formatClinicDateTime(a.starts_at))}</p>
        <p>${escape(a.name)} · ${escape(a.phone ?? '')} · ${escape(a.email ?? '')}</p>
        ${a.red_flags.length ? `<p><strong>Warning signs ticked:</strong> ${a.red_flags.map(escape).join(', ')}</p>` : ''}
        ${a.status === 'requested' ? '<p>This needs confirming.</p>' : ''}
        <p><a href="${link}">Open in the staff portal</a></p>`,
    });
    await logAppointmentEvent(a.id, 'email', `clinic notified (${event})`);
  } catch (err) {
    await logAppointmentEvent(a.id, 'email_failed', `clinic notification: ${err instanceof Error ? err.message : 'unknown error'}`.slice(0, 300));
  }
}

/** Sends any reminders that are due. Safe to run repeatedly: each booking is reminded once. */
export async function sendDueReminders(): Promise<{ sent: number; failed: number }> {
  const clinic = await getClinicSettings();
  if (!clinic.reminders_enabled) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const id of await getDueReminders()) {
    // Claim it first so two runs at once can't both send.
    const claimed = await sql`UPDATE appointments SET reminder_sent_at = now() WHERE id = ${id} AND reminder_sent_at IS NULL RETURNING id`;
    if (!claimed.length) continue;
    if (await sendAppointmentEmail(id, 'reminder')) sent++;
    else {
      failed++;
      await sql`UPDATE appointments SET reminder_sent_at = NULL WHERE id = ${id}`;
    }
  }
  return { sent, failed };
}
