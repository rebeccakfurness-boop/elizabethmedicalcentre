import { notFound } from 'next/navigation';
import { DrugSheet } from '@/components/clinical/Sheets';
import { PrintButton } from '@/components/clinical/PrintButton';
import { getCurrentUser } from '@/lib/session';
import { DRUGS_BY_CODE } from '@/clinical/drugs';

export default async function PrintDrugPage({ params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  const drug = DRUGS_BY_CODE.get((await params).code);
  if (!user || !drug) notFound();
  return (
    <div>
      <div className="mb-4 flex justify-end print:hidden"><PrintButton /></div>
      <DrugSheet drug={drug} />
    </div>
  );
}
