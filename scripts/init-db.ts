import { initSchema, pool } from './db';

const p = pool();
initSchema(p)
  .then(() => console.log('Database tables are ready.'))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => p.end());
