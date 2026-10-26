// Usage: npm run db:create-user -- you@example.com "Your Name" super_admin
// Roles: staff | admin | super_admin. Prints a one-time temporary password (not stored anywhere).
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { initSchema, pool } from './db';

async function main() {
  const [email, name, role = 'super_admin'] = process.argv.slice(2);
  if (!email || !name || !['staff', 'admin', 'super_admin'].includes(role)) {
    console.error('Usage: npm run db:create-user -- <email> "<name>" <staff|admin|super_admin>');
    process.exitCode = 1;
    return;
  }
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let temp = '';
  for (let i = 0; i < 12; i++) temp += alphabet[bytes[i] % alphabet.length];
  temp = `${temp.slice(0, 4)}-${temp.slice(4, 8)}-${temp.slice(8)}`;

  const p = pool();
  try {
    await initSchema(p);
    await p.query(
      `INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4)`,
      [email.trim().toLowerCase(), name, await bcrypt.hash(temp, 12), role]
    );
    console.log(`Created ${role} ${email}.\nTemporary password: ${temp}\nSign in at /staff/login; you'll be asked to choose a new password.`);
  } finally {
    await p.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
