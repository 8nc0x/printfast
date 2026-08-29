// One-off migration runner. Reads creds from env (never from disk) and applies
// the SQL migrations + seed in order against the target Postgres database.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const files = [
  '../supabase/migrations/0001_init.sql',
  '../supabase/migrations/0002_rls.sql',
  '../supabase/migrations/0003_storage.sql',
  '../supabase/seed.sql',
];

const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
  statement_timeout: 60000,
});

async function main() {
  await client.connect();
  const { rows } = await client.query('select version()');
  console.log('connected:', rows[0].version.split(',')[0]);

  for (const rel of files) {
    const path = resolve(here, rel);
    const sql = readFileSync(path, 'utf8');
    process.stdout.write(`applying ${rel} ... `);
    try {
      await client.query(sql);
      console.log('OK');
    } catch (e) {
      console.log('FAILED');
      console.error(`  -> ${e.message}`);
      if (!process.env.CONTINUE_ON_ERROR) throw e;
    }
  }

  // Summarize.
  const t = await client.query(
    "select count(*)::int as n from information_schema.tables where table_schema='public'",
  );
  const b = await client.query('select count(*)::int as n from storage.buckets');
  console.log(`public tables: ${t.rows[0].n}, storage buckets: ${b.rows[0].n}`);
  await client.end();
  console.log('DONE');
}

main().catch((e) => {
  console.error('SETUP FAILED:', e.message);
  process.exit(1);
});
