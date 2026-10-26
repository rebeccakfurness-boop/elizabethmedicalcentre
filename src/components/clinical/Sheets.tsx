import { Logo } from '@/components/Logo';
import type { Drug } from '@/clinical/drugs';
import { EMERGENCY_LINE, type Leaflet } from '@/clinical/leaflets';

function SheetHeader({ kind, title }: { kind: string; title: string }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-4 border-b-2 border-teal pb-3">
      <div>
        <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-clay">{kind}</p>
        <h2 className="font-headline text-2xl font-extrabold text-pulse">{title}</h2>
      </div>
      <Logo variant="logo-combination" className="w-28 shrink-0 text-teal" />
    </header>
  );
}

function Points({ heading, items, tone }: { heading: string; items: string[]; tone?: 'red' }) {
  if (!items.length) return null;
  return (
    <section className={`mb-3 ${tone === 'red' ? 'rounded-xl border-2 border-red-300 bg-red-50 p-3' : ''}`}>
      <h3 className={`mb-1 font-label text-xs font-bold uppercase tracking-wider ${tone === 'red' ? 'text-red-800' : 'text-teal'}`}>{heading}</h3>
      <ul className="list-disc space-y-0.5 pl-5 text-[13px] leading-snug">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </section>
  );
}

export function DrugSheet({ drug, dosing }: { drug: Drug; dosing?: string }) {
  const s = drug.sheet;
  return (
    <article className="sheet">
      <SheetHeader kind="Medicine information" title={drug.name} />
      {dosing ? <p className="mb-3 rounded-xl bg-teal-soft p-3 text-[15px] font-semibold text-teal-deep">Your dose: {dosing}</p> : null}
      <p className="mb-3 text-[13px]"><strong>What it is for:</strong> {s.whatFor}</p>
      <Points heading="How to take it" items={s.howToTake} />
      <Points heading="Possible side effects" items={s.sideEffects} />
      <Points heading="Do not take it" items={s.doNotTake} />
      {s.alcohol ? <p className="mb-2 text-[13px]"><strong>Alcohol:</strong> {s.alcohol}</p> : null}
      {s.pregnancy ? <p className="mb-2 text-[13px]"><strong>Pregnancy and breastfeeding:</strong> {s.pregnancy}</p> : null}
      <Points heading="Get medical help if" items={[...s.getHelp, EMERGENCY_LINE]} tone="red" />
    </article>
  );
}

export function LeafletSheet({ leaflet }: { leaflet: Leaflet }) {
  return (
    <article className="sheet">
      <SheetHeader kind="Patient information" title={leaflet.title} />
      <p className="mb-3 text-[13px] leading-snug">{leaflet.intro}</p>
      {leaflet.sections.map((s) => <Points key={s.heading} heading={s.heading} items={s.points} />)}
      <Points heading="Come back or call 119 if" items={leaflet.urgent} tone="red" />
      <p className="mt-4 text-[11px] text-ink-soft">The Doctors – Elizabeth Medical Centre, Kuta, Lombok. {EMERGENCY_LINE}</p>
    </article>
  );
}
