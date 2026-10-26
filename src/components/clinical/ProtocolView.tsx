import Link from 'next/link';
import { DRUGS_BY_CODE } from '@/clinical/drugs';
import { LEAFLETS_BY_SLUG } from '@/clinical/leaflets';
import type { Protocol } from '@/clinical/protocols';

function List({ title, items, tone }: { title: string; items: string[]; tone?: 'red' }) {
  if (!items.length) return null;
  return (
    <div className={tone === 'red' ? 'rounded-xl border border-red-200 bg-red-50 p-3' : ''}>
      <h4 className={`mb-1 font-label text-[11px] font-bold uppercase tracking-wider ${tone === 'red' ? 'text-red-800' : 'text-clay'}`}>{title}</h4>
      <ul className={`list-disc space-y-1 pl-5 text-sm ${tone === 'red' ? 'text-red-900' : ''}`}>{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}

/** Renders a protocol. With `rxHref`, each suggested medicine links into the prescription form. */
export function ProtocolView({ protocol, rxHref }: { protocol: Protocol; rxHref?: (code: string) => string }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">{protocol.summary}</p>
      <List title="Red flags: escalate / refer" items={protocol.redFlags} tone="red" />
      <div className="grid gap-4 md:grid-cols-2">
        <List title="Assess" items={protocol.assessment} />
        <List title="Investigations" items={protocol.investigations} />
      </div>
      <List title="Management" items={protocol.management} />
      {protocol.prescribing.length ? (
        <div>
          <h4 className="mb-1 font-label text-[11px] font-bold uppercase tracking-wider text-clay">Medicines</h4>
          <ul className="space-y-1 text-sm">
            {protocol.prescribing.map((p) => {
              const d = DRUGS_BY_CODE.get(p.drugCode);
              return (
                <li key={p.drugCode} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper px-3 py-1.5">
                  <span><strong>{d?.name ?? p.drugCode}</strong> <span className="text-ink-soft">· {p.note}</span></span>
                  {rxHref ? <Link href={rxHref(p.drugCode)} scroll={false} className="text-xs font-bold text-teal underline">Prescribe</Link> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <List title="Referral" items={protocol.referral} />
        <List title="Follow-up" items={protocol.followUp} />
      </div>
      {protocol.leaflets.length ? (
        <p className="text-sm">
          <span className="font-label text-[11px] font-bold uppercase tracking-wider text-clay">Patient leaflets: </span>
          {protocol.leaflets.map((l, i) => (
            <span key={l}>
              {i ? ', ' : ''}
              <Link href={`/print/leaflet/${l}`} target="_blank" className="text-teal underline">{LEAFLETS_BY_SLUG.get(l)?.title ?? l}</Link>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
