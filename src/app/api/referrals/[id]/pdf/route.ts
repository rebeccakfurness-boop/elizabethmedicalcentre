import { NextRequest, NextResponse } from 'next/server';
import { isClinical } from '@/lib/auth';
import { renderReferralPdf } from '@/lib/pdf/render';
import { getReferral } from '@/lib/referrals';
import { audit, getCurrentUser } from '@/lib/session';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const referral = await getReferral(Number((await params).id));
  // Clinical staff, or the patient's family once a clinician has shared the signed letter.
  const allowed =
    !!referral &&
    (isClinical(user.clinicalRole) ||
      (user.role === 'patient' && referral.family_id === user.familyId && referral.shared_with_patient && referral.status !== 'draft' && referral.status !== 'cancelled'));
  if (!allowed) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  try {
    const pdf = await renderReferralPdf(referral.id);
    await audit(user.id, 'view_pdf', 'referral', referral.id);
    return new NextResponse(new Uint8Array(pdf.buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${pdf.fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[referral pdf]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not generate PDF.' }, { status: 500 });
  }
}
