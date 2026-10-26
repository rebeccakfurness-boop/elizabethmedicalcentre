import { DAY_NAMES, type WeekHours } from '@/lib/booking-shared';

/** One row per weekday: open/close times or closed. Field names are prefixed so several can share a page. */
export function HoursFields({ hours, prefix = '' }: { hours: WeekHours; prefix?: string }) {
  return (
    <table className="text-sm">
      <tbody>
        {DAY_NAMES.map((d, i) => (
          <tr key={d}>
            <td className="w-28 py-1 pr-3">{d}</td>
            <td className="py-1 pr-2"><input type="time" name={`${prefix}open_${i}`} defaultValue={hours[i]?.open ?? '08:00'} className="input w-auto py-1" aria-label={`${d} opens`} /></td>
            <td className="py-1 pr-2"><input type="time" name={`${prefix}close_${i}`} defaultValue={hours[i]?.close ?? '17:00'} className="input w-auto py-1" aria-label={`${d} closes`} /></td>
            <td className="py-1"><label className="flex items-center gap-1 text-xs"><input type="checkbox" name={`${prefix}closed_${i}`} defaultChecked={!hours[i]} className="accent-teal" /> Closed</label></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
