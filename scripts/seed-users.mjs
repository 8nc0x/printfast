// Seeds the demo shop, subscription plans, platform config, and demo accounts.
// Uses Prisma Client. Passwords are bcrypt-hashed to match the app's auth.
//
// Usage: node scripts/seed-users.mjs
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

// Load env: apps/web/.env.local first (source of truth), then .env.
config({ path: 'apps/web/.env.local', quiet: true });
config({ path: '.env', quiet: true });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to apps/web/.env.local first.');
  process.exit(1);
}

const prisma = new PrismaClient();
const PASSWORD = 'demo12345';

const accounts = [
  { email: 'student@demo.com', name: 'Demo Student', role: 'student' },
  { email: 'shop@demo.com', name: 'Demo Shop Owner', role: 'shop_owner' },
  { email: 'admin@demo.com', name: 'Platform Admin', role: 'admin' },
];

const PLANS = [
  {
    name: 'Starter',
    price: 99,
    trialDays: 14,
    sortOrder: 0,
    features: { staff: 0, printers: 1, catalogItems: 25, inventory: false, advancedDelivery: false, advancedAnalytics: false },
  },
  {
    name: 'Pro',
    price: 199,
    trialDays: 14,
    sortOrder: 1,
    features: { staff: 3, printers: 3, catalogItems: 200, inventory: true, advancedDelivery: true, advancedAnalytics: true },
  },
];

const PLATFORM_CONFIG = [
  { key: 'platform_fee', value: { amount: 2 } },
  { key: 'referral_reward', value: { amount: 1 } },
  { key: 'shop_commission_pct', value: { pct: 20 } },
  { key: 'min_withdrawal', value: { amount: 100 } },
];

function referralCode(email) {
  return email.split('@')[0].slice(0, 4).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Subscription plans.
  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plan.name }, // not a real unique; use name lookup below instead
      update: {},
      create: plan,
    }).catch(async () => {
      const existing = await prisma.subscriptionPlan.findFirst({ where: { name: plan.name } });
      if (existing) {
        await prisma.subscriptionPlan.update({ where: { id: existing.id }, data: plan });
      } else {
        await prisma.subscriptionPlan.create({ data: plan });
      }
    });
  }
  console.log(`plans: ${PLANS.map((p) => p.name).join(', ')}`);

  // Platform config.
  for (const cfg of PLATFORM_CONFIG) {
    await prisma.platformConfig.upsert({
      where: { key: cfg.key },
      update: {},
      create: cfg,
    });
  }
  console.log('platform config: seeded');

  // Demo shop + settings + trial subscription.
  let shop = await prisma.shop.findFirst({ where: { isActive: true } });
  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        name: 'Campus Print Shop',
        address: 'Main Gate Road',
        isActive: true,
        code: 'PP-DEMO-001',
        slug: 'campus-print-shop',
        category: 'Xerox / Printing',
        settings: { create: { currency: 'INR' } },
      },
    });
    console.log(`shop: ${shop.name} (${shop.slug})`);
  }

  const starterPlan = await prisma.subscriptionPlan.findFirst({ where: { name: 'Starter' } });
  if (starterPlan) {
    await prisma.subscription.upsert({
      where: { shopId: shop.id },
      update: {},
      create: {
        shopId: shop.id,
        planId: starterPlan.id,
        status: 'TRIALING',
        currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // Demo catalog.
  const catalogDefaults = [
    { kind: 'PRINT', name: 'A4 B&W print', price: 2, unit: 'page' },
    { kind: 'PRINT', name: 'A4 Color print', price: 10, unit: 'page' },
    { kind: 'PRODUCT', name: 'Notebook (200 pages)', price: 60, unit: 'piece' },
    { kind: 'PRODUCT', name: 'Blue pen', price: 10, unit: 'piece' },
    { kind: 'SERVICE', name: 'Spiral binding', price: 40, unit: 'job' },
    { kind: 'SERVICE', name: 'Lamination', price: 20, unit: 'piece' },
  ];
  for (const item of catalogDefaults) {
    const exists = await prisma.catalogItem.findFirst({
      where: { shopId: shop.id, name: item.name },
    });
    if (!exists) {
      await prisma.catalogItem.create({ data: { shopId: shop.id, ...item } });
    }
  }
  console.log('catalog: seeded');

  // Demo delivery config (pickup-only default: enabled with fee for testing).
  await prisma.shopDelivery.upsert({
    where: { shopId: shop.id },
    update: {},
    create: {
      shopId: shop.id,
      enabled: true,
      fee: 20,
      minOrder: 50,
      freeAbove: 200,
      radiusKm: 3,
    },
  });

  // Demo accounts.
  for (const a of accounts) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: { name: a.name, role: a.role, passwordHash: hash },
      create: {
        email: a.email,
        name: a.name,
        role: a.role,
        passwordHash: hash,
        referralCode: referralCode(a.email),
      },
    });
    console.log(`${a.role.padEnd(10)} ${a.email}  (id ${user.id})`);

    if (a.role === 'shop_owner') {
      await prisma.shop.update({ where: { id: shop.id }, data: { ownerId: user.id } });
      console.log(`  -> linked as owner of shop ${shop.slug}`);
    }
  }

  console.log(`\nPassword for all accounts: ${PASSWORD}`);
  console.log('DONE');
}

main()
  .catch((e) => {
    console.error('SEED FAILED:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
