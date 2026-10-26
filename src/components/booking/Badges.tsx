import { KIND_LABELS, STATUS_LABELS, type AppointmentKind, type AppointmentStatus } from '@/lib/booking-shared';

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  requested: 'bg-amber-100 text-amber-900',
  confirmed: 'bg-teal-soft text-teal-deep',
  checked_in: 'bg-teal text-cream',
  completed: 'bg-stone-200 text-stone-700',
  cancelled: 'bg-stone-100 text-stone-500 line-through',
  no_show: 'bg-red-100 text-red-800',
};

export const KIND_ICONS: Record<AppointmentKind, string> = { clinic: '🩺', home_visit: '🏠', telehealth: '📞', walk_in: '🚑' };

export function ApptStatusBadge({ status }: { status: AppointmentStatus }) {
  return <span className={`pill ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function KindTag({ kind }: { kind: AppointmentKind }) {
  return <span className="whitespace-nowrap text-xs text-ink-soft"><span aria-hidden="true">{KIND_ICONS[kind]}</span> {KIND_LABELS[kind]}</span>;
}
