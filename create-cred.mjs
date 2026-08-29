import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Parse .env.local manually since dotenv isn't in package.json
const envFile = fs.readFileSync(path.join(process.cwd(), 'apps', 'web', '.env.local'), 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  if (line.trim() && !line.startsWith('#')) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length > 0) {
      env[key.trim()] = rest.join('=').trim();
    }
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key in apps/web/.env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const password = 'newpassword123';
  const hash = await bcrypt.hash(password, 10);

  const accounts = [
    { email: 'new_student@demo.com', name: 'New Student', role: 'student' },
    { email: 'new_shop@demo.com', name: 'New Shop', role: 'shop_owner' },
  ];

  for (const acc of accounts) {
    const id = crypto.randomUUID();
    const { data, error } = await supabase
      .from('users')
      .upsert({ 
        id, 
        email: acc.email, 
        name: acc.name, 
        role: acc.role, 
        password_hash: hash 
      }, { onConflict: 'email' })
      .select()
      .single();
      
    if (error) {
      console.error(`Failed to create ${acc.email}:`, error);
    } else {
      console.log(`Created ${acc.role}: ${acc.email} (ID: ${data.id})`);
      
      if (acc.role === 'shop_owner') {
        // Find existing shop or create one
        const { data: shops } = await supabase.from('shops').select('id').limit(1);
        let shopId = shops?.[0]?.id;
        
        if (!shopId) {
            shopId = crypto.randomUUID();
            await supabase.from('shops').insert({ id: shopId, name: 'Campus Print Shop', owner_id: data.id });
        } else {
            await supabase.from('shops').update({ owner_id: data.id }).eq('id', shopId);
        }
        console.log(`  -> Linked to shop ${shopId}`);
      }
    }
  }
  
  console.log('\n--- NEW CREDENTIALS ---');
  console.log(`Student Email: new_student@demo.com`);
  console.log(`Shop Email: new_shop@demo.com`);
  console.log(`Password: ${password}`);
}

main().catch(console.error);
