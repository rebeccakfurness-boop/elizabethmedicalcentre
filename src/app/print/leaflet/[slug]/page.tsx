import { notFound } from 'next/navigation';
import { LeafletSheet } from '@/components/clinical/Sheets';
import { PrintButton } from '@/components/clinical/PrintButton';
import { getCurrentUser } from '@/lib/session';
import { LEAFLETS_BY_SLUG } from '@/clinical/leaflets';

export default async function PrintLeafletPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  const leaflet = LEAFLETS_BY_SLUG.get((await params).slug);
  if (!user || !leaflet) notFound();
  return (
    <div>
      <div className="mb-4 flex justify-end print:hidden"><PrintButton /></div>
      <LeafletSheet leaflet={leaflet} />
    </div>
  );
}
