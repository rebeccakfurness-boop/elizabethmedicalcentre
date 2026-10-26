/** Trimmed string or null for an empty field. */
export function str(fd: FormData, name: string): string | null {
  const v = fd.get(name);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

export function num(fd: FormData, name: string): number | null {
  const v = str(fd, name);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function dateStr(fd: FormData, name: string): string | null {
  const v = str(fd, name);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Unique violations etc. from Postgres
    const code = (err as { code?: string }).code;
    if (code === '23505') return 'That already exists (duplicate email or reference).';
    return err.message;
  }
  return 'Something went wrong.';
}
