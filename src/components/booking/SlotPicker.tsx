'use client';

import { useEffect, useState, useTransition } from 'react';
import { getAvailableSlots } from '@/app/actions/booking';

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
    day: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  };
};

/** Date strip plus the free times on the chosen day; writes `date` and `time` form fields. */
export function SlotPicker({
  typeId,
  dates,
  token,
  fetchSlots = getAvailableSlots,
}: {
  typeId: number;
  dates: string[];
  token?: string;
  fetchSlots?: (typeId: number, date: string, token?: string) => Promise<{ slots: string[]; note?: string }>;
}) {
  const [date, setDate] = useState(dates[0]);
  const [time, setTime] = useState('');
  const [result, setResult] = useState<{ key: string; slots: string[]; note?: string } | null>(null);
  const [pending, start] = useTransition();
  const key = `${typeId}|${date}`;

  useEffect(() => {
    let live = true;
    start(async () => {
      const r = await fetchSlots(typeId, date, token);
      if (live) setResult({ key, ...r });
    });
    return () => {
      live = false;
    };
  }, [typeId, date, token, key, fetchSlots]);

  const current = result?.key === key ? result : null;
  return (
    <div>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={current?.slots.includes(time) ? time : ''} />
      <p className="label">Day</p>
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-2" role="radiogroup" aria-label="Day">
        {dates.map((d) => {
          const l = dayLabel(d);
          const on = d === date;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setDate(d);
                setTime('');
              }}
              className={`flex min-w-16 shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-sm transition ${on ? 'border-teal bg-teal text-cream' : 'border-line bg-white hover:border-teal'}`}
            >
              <span className="font-label text-[10px] font-bold uppercase tracking-wider">{l.weekday}</span>
              <span className="font-semibold">{l.day}</span>
            </button>
          );
        })}
      </div>
      <p className="label">Time (Lombok time)</p>
      {!current || pending ? (
        <p className="text-sm text-ink-soft">Finding free times…</p>
      ) : current.slots.length ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Time">
          {current.slots.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === time}
              onClick={() => setTime(s)}
              className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${s === time ? 'border-clay bg-clay text-cream' : 'border-line bg-white hover:border-clay'}`}
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-paper px-3 py-2 text-sm text-ink-soft">{current.note ?? 'No times free on this day.'} Try another day.</p>
      )}
    </div>
  );
}
