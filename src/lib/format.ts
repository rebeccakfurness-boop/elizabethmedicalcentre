export function formatIDR(amount: number | null | undefined): string {
  const n = Math.round(Number(amount ?? 0));
  return 'Rp ' + n.toLocaleString('id-ID');
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value.length === 10 ? value + 'T12:00:00+08:00' : value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Makassar' });
}

export function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob + 'T00:00:00');
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function todayISO(): string {
  // Clinic runs on WITA (UTC+8).
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Parses "1.250.000", "1,250,000", "Rp 1250000" etc. into whole rupiah. */
export function parseAmount(input: FormDataEntryValue | string | null | undefined): number {
  if (input == null) return NaN;
  const s = String(input).replace(/rp/i, '').replace(/[\s.,](?=\d{3}(\D|$))/g, '').replace(/,/g, '.').trim();
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

export function initials(first: string, last: string): string {
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase();
}

/** Short date and time in clinic time (Lombok, WITA). */
export function formatClinicTime(iso: string | Date | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' }) : '—';
}
