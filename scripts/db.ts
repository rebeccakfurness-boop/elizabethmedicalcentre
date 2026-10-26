import { Pool } from 'pg';
import { SCHEMA_SQL, SCHEMA_VERSION } from '../src/lib/schema';

export function pool(): Pool {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Set DATABASE_URL (in .env.local or the environment).');
  return new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
}

export async function initSchema(p: Pool) {
  await p.query(SCHEMA_SQL);
  await p.query(
    `INSERT INTO schema_meta (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(SCHEMA_VERSION)]
  );
}
