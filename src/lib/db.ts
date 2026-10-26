import { Pool, types } from 'pg';
import { SCHEMA_SQL, SCHEMA_VERSION } from '@/lib/schema';

// Return DATE columns as plain "YYYY-MM-DD" strings (not JS Dates shifted by the server's
// timezone) and BIGINT money columns as numbers. Amounts are whole rupiah, far below 2^53.
types.setTypeParser(types.builtins.DATE, (v: string) => v);
types.setTypeParser(types.builtins.INT8, (v: string) => Number(v));
types.setTypeParser(types.builtins.NUMERIC, (v: string) => Number(v));

function connectionString(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('No database connection string found. Set DATABASE_URL (or POSTGRES_URL).');
  }
  return url;
}

const globalForPool = globalThis as unknown as { emcPool?: Pool };

function getPool(): Pool {
  if (!globalForPool.emcPool) {
    const url = connectionString();
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    globalForPool.emcPool = new Pool({
      connectionString: url,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return globalForPool.emcPool;
}

/** Tagged-template query: sql`SELECT * FROM x WHERE id = ${id}` -> rows. Values are always sent
 * as bind parameters, never interpolated into the SQL text. */
export async function sql<T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
  let text = strings[0];
  for (let i = 1; i < strings.length; i++) text += `$${i}${strings[i]}`;
  await ensureSchema();
  const res = await getPool().query(text, values);
  return res.rows as T[];
}

/** Plain parameterised query, for SQL that reuses a parameter or is built from fixed fragments. */
export async function query<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await getPool().query(text, values);
  return res.rows as T[];
}

/** First row or null. */
export async function sqlOne<T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T | null> {
  const rows = await sql<T>(strings, ...values);
  return rows[0] ?? null;
}

/** Runs fn inside a single transaction on one connection. */
export async function transaction<T>(fn: (q: <R = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  const q = async <R,>(strings: TemplateStringsArray, ...values: unknown[]): Promise<R[]> => {
    let text = strings[0];
    for (let i = 1; i < strings.length; i++) text += `$${i}${strings[i]}`;
    const res = await client.query(text, values);
    return res.rows as R[];
  };
  try {
    await client.query('BEGIN');
    const result = await fn(q);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

let schemaReady: Promise<void> | null = null;

/** Idempotently creates every table on first use, so no manual migration step is needed.
 * Skips straight through once schema_meta records the current SCHEMA_VERSION. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const pool = getPool();
      try {
        const res = await pool.query(`SELECT value FROM schema_meta WHERE key = 'schema_version'`);
        if (res.rows[0] && Number(res.rows[0].value) >= SCHEMA_VERSION) return;
      } catch {
        // schema_meta doesn't exist yet: first run against this database.
      }
      await pool.query(SCHEMA_SQL);
      await pool.query(
        `INSERT INTO schema_meta (key, value) VALUES ('schema_version', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [String(SCHEMA_VERSION)]
      );
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export async function closePool(): Promise<void> {
  await globalForPool.emcPool?.end();
  globalForPool.emcPool = undefined;
}
