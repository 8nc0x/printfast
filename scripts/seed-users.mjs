// Seeds two demo accounts (student + shop owner) and links the owner to the shop.
// Reads PG creds from env. Passwords are bcrypt-hashed to match the app's auth.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const SHOP_ID = '00000000-0000-0000-0000-000000000001';
const PASSWORD = 'demo12345';

const accounts = [
  { email: 'student@demo.com', name: 'Demo Student', role: 'student' },
  { email: 'shop@demo.com', name: 'Demo Shop Owner', role: 'shop_owner' },
];

const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

async function main() {
  await client.connect();
  const hash = await bcrypt.hash(PASSWORD, 10);

  for (const a of accounts) {
    const id = crypto.randomUUID();
    const res = await client.query(
      `insert into users (id, email, name, role, password_hash)
       values ($1,$2,$3,$4,$5)
       on conflict (email) do update set name=excluded.name, role=excluded.role, password_hash=excluded.password_hash
       returning id`,
      [id, a.email, a.name, a.role, hash],
    );
    const uid = res.rows[0].id;
    console.log(`${a.role.padEnd(10)} ${a.email}  (id ${uid})`);
    if (a.role === 'shop_owner') {
      await client.query('update shops set owner_id=$1 where id=$2', [uid, SHOP_ID]);
      console.log(`  -> linked as owner of shop ${SHOP_ID}`);
    }
  }

  await client.end();
  console.log(`\nPassword for both accounts: ${PASSWORD}`);
  console.log('DONE');
}

main().catch((e) => {
  console.error('SEED FAILED:', e.message);
  process.exit(1);
});
