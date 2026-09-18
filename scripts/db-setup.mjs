// One-off DB setup. Applies the Prisma migration state to the target database.
// Reads the connection string from DATABASE_URL (never from disk).
//
// Usage: node scripts/db-setup.mjs
import { config } from 'dotenv';
import { execSync } from 'node:child_process';

// Load .env.local from the web app if present (dotenv doesn't overwrite existing).
config({ path: 'apps/web/.env.local', quiet: true });
config({ path: '.env', quiet: true });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to apps/web/.env.local first.');
  process.exit(1);
}

function run(cmd) {
  process.stdout.write(`> ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit' });
}

// Apply migrations (idempotent — safe on an existing database).
run('npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma');

// Regenerate the client against the final schema.
run('npx prisma generate --schema=packages/db/prisma/schema.prisma');

console.log('\nNext: node scripts/seed-users.mjs   # demo shop + accounts');
console.log('DONE');
