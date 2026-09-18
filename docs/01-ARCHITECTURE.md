# PrintPass — Technical Architecture (Full Ecosystem)

> Companion to [00-PRODUCT-SPEC.md](00-PRODUCT-SPEC.md). The existing MVP
> ([03-CODEBASE.md](03-CODEBASE.md)) implements the single-shop print core; this document is the
> target platform. Delivery order lives in [02-ROADMAP.md](02-ROADMAP.md).

---

## 0. Locked stack decisions

| Concern | Decision | Notes |
|---|---|---|
| Framework | **Next.js (latest) — App Router** | Server Components + Server Actions for all student/shop UI. Route Handlers for machine endpoints (webhook, agent API). |
| Auth | **NextAuth (Auth.js v5)** | Credentials (bcrypt) + Google OAuth. JWT session strategy (survives PM2 multi-instance). Role claims embedded + re-verified against DB on sensitive actions. |
| Database | **PostgreSQL + Prisma ORM** | Single `schema.prisma` = source of truth. Migrations via `prisma migrate`. |
| Process manager | **PM2 (strict)** | Everything runs under PM2: web app, background workers, cron jobs. No bare `node` in production. `ecosystem.config.js` committed to repo. |
| UI | **shadcn/ui** + Tailwind | Same primitive set across customer/shop/admin. Radix primitives, CVA tokens. |
| Payments | **PayXmint** (https://payxmint.com/docs) | UPI collections: `create-intent` → deep links/QR → `check-status` polling → HMAC-SHA256-signed `payment.success` webhook. Behind the `PaymentProvider` interface. |
| Storage | Local disk (VPS) behind authed API routes, S3-compatible adapter interface | Documents are private; never served statically. |
| Realtime | SSE (Server-Sent Events) + polling fallback | Postgres `LISTEN/NOTIFY` → SSE fan-out. Works fine under PM2 single-node; swap to Redis pub/sub when scaling out. |
| Queue | Postgres-backed queue table + PM2 worker | `SKIP LOCKED` claiming. No Redis/RabbitMQ dependency in v1. |

---

## 1. System topology

```
                    ┌────────────────────────────────────────┐
                    │              VPS (PM2 host)             │
                    │                                        │
 Students ──PWA──▶  │  Nginx (TLS, static, rate-limit)       │
 Shops ──browser──▶ │    └─ Next.js (pm2: web, cluster)      │
 Admin ──browser──▶ │         ├─ Server Actions / RSC        │
                    │         ├─ /api/payments/webhook       │
                    │         ├─ /api/agent/*  (shop agent)  │
                    │         └─ /api/events   (SSE)         │
                    │                                        │
                    │  pm2: worker-docs    (PDF compile)     │
                    │  pm2: worker-payments (reconcile)      │
                    │  pm2: worker-notify  (notifications)   │
                    │  pm2: cron-cleaner   (expiry, cleanup) │
                    │                                        │
                    │  PostgreSQL  ◀── Prisma                │
                    │  /data/printpass/{originals,finals,    │
                    │                  previews,qr}          │
                    └───────────────┬────────────────────────┘
                                    │ HTTPS + scoped agent token
                                    ▼
                        Windows Shop Agent (Electron)
                                    │
                        Windows print subsystem → Printers
```

External: PayXmint API (outbound `create-intent`/`check-status`, inbound signed webhook).

---

## 2. Monorepo structure

```
printpass/
├─ apps/
│  ├─ web/                        # Next.js App Router (customer + shop + admin + agent API)
│  │  └─ src/
│  │     ├─ app/
│  │     │  ├─ (marketing)/                  # landing, pricing, referral landing
│  │     │  ├─ (auth)/login|register          # referral code captured at register
│  │     │  ├─ (customer)/                    # dashboard, shops/[code], order wizard, wallet, referrals
│  │     │  ├─ (shop)/                        # orders, catalog, inventory, pricing, staff, printers, qr, analytics, billing
│  │     │  ├─ (admin)/                       # dashboard, users, shops, plans, pricing, referrals, finance, audit
│  │     │  └─ api/
│  │     │     ├─ payments/webhook/route.ts   # PayXmint signed webhook (raw body!)
│  │     │     ├─ payments/status/route.ts    # polling proxy for checkout UI
│  │     │     ├─ agent/{auth,orders,claim,files,print-events,heartbeat}/route.ts
│  │     │     └─ events/route.ts             # SSE stream (customer + shop)
│  │     ├─ server/                           # server-only: actions, services, rbac, repo layer
│  │     ├─ lib/                              # payxmint provider, storage, pdf, queue, sse
│  │     └─ components/ui/                    # shadcn primitives + app components
│  ├─ desktop/                    # Electron Windows Shop Agent (evolves from MVP app)
│  └─ mobile/                     # (later) PWA wrapper — not v1
├─ packages/
│  └─ shared/                     # zod schemas, enums, state machines, pricing, agent protocol types
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ workers/                       # PM2 worker entrypoints (thin — logic in packages)
├─ ecosystem.config.js            # PM2 (strict): web + workers + cron
├─ deploy/
│  ├─ nginx.conf
│  └─ printpass.service           # pm2 startup via `pm2 startup`
└─ docs/
```

Rule: **`packages/shared` is the contract.** Enums, state machines, zod schemas, agent protocol,
and pricing math live there and are imported by web, desktop, and workers. No drift.

---

## 3. Prisma schema (complete)

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

// ───────────────────────── enums ─────────────────────────

enum Role {
  SUPER_ADMIN  ADMIN  SUPPORT
  SHOP_OWNER  SHOP_MANAGER  SHOP_OPERATOR  SHOP_DELIVERY
  CUSTOMER
}

enum OrderStatus {
  CREATED  AWAITING_PAYMENT  PAYMENT_PROCESSING  PAID
  ACCEPTED  PREPARING  READY
  OUT_FOR_DELIVERY  READY_FOR_PICKUP  COMPLETED
  CANCELLED  EXPIRED  REFUNDED
}

enum PrintJobStatus {   // print jobs live INSIDE an order
  DRAFT  CONFIGURING  QUEUED  PRINTING  PRINTED  PRINT_FAILED  CANCELLED
}

enum PaymentStatus { PENDING SUCCESS FAILED EXPIRED REFUNDED }

enum ItemKind { PRINT_STATIONERY PRODUCT SERVICE }

enum PaperSize { A4 A3 LETTER LEGAL PHOTO }
enum Sides { SINGLE DUPLEX }
enum PrintColor { BW COLOR }

enum ShopStatus { PENDING_APPROVAL ACTIVE SUSPENDED REJECTED }
enum SubscriptionStatus { TRIALING ACTIVE PAST_DUE CANCELLED EXPIRED }
enum LedgerEntryType {
  ORDER_PAYMENT  PLATFORM_FEE  SHOP_EARNING  REFERRAL_REWARD
  REFERRAL_COMMISSION  GATEWAY_FEE  REFUND  PAYOUT  WALLET_CREDIT  WALLET_DEBIT
  SUBSCRIPTION_PAYMENT
}
enum WalletType { REFERRAL EARNINGS PROMO REFUND }
enum NotificationChannel { IN_APP PUSH EMAIL WHATSAPP SMS }

// ───────────────────────── identity ─────────────────────────

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  phone         String?  @unique
  name          String?
  passwordHash  String?                    // null for pure-OAuth accounts
  role          Role     @default(CUSTOMER)
  isBanned      Boolean  @default(false)
  referredById  String?  @map("referred_by_id")
  referredBy    User?    @relation("Referrals", fields: [referredById], references: [id])
  referrals     User[]   @relation("Referrals")
  referralCode  String?  @unique
  shops         ShopMember[]
  orders        Order[]
  wallets       Wallet[]
  notifications Notification[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Shop {
  id           String  @id @default(uuid())
  code         String  @unique               // PP-ARYA-001
  slug         String  @unique               // printpass.app/s/{slug} — QR target
  name         String
  category     String?
  owner        User    @relation(fields: [ownerId], references: [id])
  ownerId      String
  address      String?
  city         String? ; pincode String?
  phone        String? ; whatsapp String?
  logoPath     String? ; coverPath String?
  openingHours Json?                          // per-day windows + weekly holidays
  lat          Decimal? @db(10,8) ; lng Decimal? @db(11,8)
  status       ShopStatus @default(PENDING_APPROVAL)
  acceptingOrders Boolean @default(true)
  members      ShopMember[]
  printers     Printer[]
  orders       Order[]
  catalog      CatalogItem[]
  pricing      PricingRule[]
  delivery     ShopDelivery?
  subscription Subscription?
  referralEvents ReferralEvent[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model ShopMember {
  id     String @id @default(uuid())
  shop   Shop   @relation(fields: [shopId], references: [id])
  shopId String
  user   User   @relation(fields: [userId], references: [id])
  userId String
  role   Role                                   // SHOP_OWNER | SHOP_MANAGER | SHOP_OPERATOR | SHOP_DELIVERY
  @@unique([shopId, userId])
}

// ───────────────────────── catalog & inventory ─────────────────────────

model CatalogItem {
  id          String   @id @default(uuid())
  shop        Shop     @relation(fields: [shopId], references: [id])
  shopId      String
  kind        ItemKind
  name        String
  description String?
  imagePath   String?
  category    String?                        // grouping for the UI
  unit        String   @default("piece")     // page | piece | sheet | job
  price       Decimal  @db(10,2)             // snapshot default; PricingRule refines
  isVisible   Boolean  @default(true)
  minQty      Int      @default(1)
  maxQty      Int?
  options     Json?                          // variant config engine (size/cover/quality...)
  printSpec   Json?                          // for PRINT_STATIONERY: paper/color/sides matrix
  stock       Inventory?
  orderItems  OrderItem[]
  @@index([shopId, kind, isVisible])
}

model Inventory {
  itemId        String  @id
  item          CatalogItem @relation(fields: [itemId], references: [id])
  stock         Int     @default(0)
  lowThreshold  Int?
  lowAlertSentAt DateTime?
}

// ───────────────────────── pricing (config, not code) ─────────────────────────

model PricingRule {                 // shop-specific; platform defaults live in PlatformConfig
  id        String  @id @default(uuid())
  shop      Shop    @relation(fields: [shopId], references: [id])
  shopId    String
  scope     String  // 'print' | 'addon' | 'service' | 'delivery'
  key       String  // e.g. 'A4:BW', 'A4:COLOR', 'spiral', 'lamination', 'photo_paper'
  price     Decimal @db(10,2)
  unit      String  @default("page")
  multiplier Decimal @default(1)             // e.g. duplex factor
  isActive  Boolean @default(true)
  @@unique([shopId, scope, key])
}

model PlatformConfig {              // single-row-ish key/value config the ADMIN edits
  key       String  @id             // 'platform_fee', 'referral_reward', 'shop_commission_pct',
  value     Json                    // 'min_withdrawal', 'referral_validity', 'delivery_caps'...
  updatedAt DateTime @updatedAt
  updatedBy String?
}

// ───────────────────────── orders (the core object) ─────────────────────────

model Order {
  id          String  @id @default(uuid())
  number      String  @unique              // PP-10452 — also the pickup token
  shop        Shop    @relation(fields: [shopId], references: [id])
  shopId      String
  customer    User    @relation(fields: [customerId], references: [id])
  customerId  String
  status      OrderStatus @default(CREATED)
  fulfillment FulfillmentMode @default(PICKUP)
  deliveryAddress Json?                    // name/phone/address/lat/lng when DELIVERY
  subtotal    Decimal @db(10,2)
  deliveryFee Decimal @default(0) @db(10,2)
  platformFee Decimal @default(0) @db(10,2)   // snapshot at creation
  total       Decimal @db(10,2)              // snapshot — NEVER recomputed
  walletApplied Decimal @default(0) @db(10,2)
  pricingSnapshot Json                       // full breakdown, immutable
  printJobs   PrintJob[]
  items       OrderItem[]
  events      OrderEvent[]
  payment     Payment?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  expiresAt   DateTime?                       // unpaid expiry (cron)
}

enum FulfillmentMode { PICKUP DELIVERY }

model OrderItem {
  id        String  @id @default(uuid())
  order     Order   @relation(fields: [orderId], references: [id])
  orderId   String
  item      CatalogItem? @relation(fields: [itemId], references: [id])   // null for ad-hoc print
  itemId    String?
  kind      ItemKind
  nameSnapshot String                            // historical accuracy
  unitPrice Decimal @db(10,2)                    // snapshot
  qty       Int
  lineTotal Decimal @db(10,2)
  printJob  PrintJob?
}

model OrderEvent {                                // full order history timeline
  id        String   @id @default(uuid())
  order     Order    @relation(fields: [orderId], references: [id])
  orderId   String
  from      OrderStatus?
  to        OrderStatus
  actorId   String?
  note      String?
  createdAt DateTime @default(now())
  @@index([orderId, createdAt])
}

// ───────────────────────── print jobs (inside orders) ─────────────────────────

model PrintJob {
  id          String  @id @default(uuid())
  order       Order   @relation(fields: [orderId], references: [id])
  orderId     String
  orderItem   OrderItem? @relation(fields: [orderItemId], references: [id])
  orderItemId String? @unique
  status      PrintJobStatus @default(DRAFT)
  document    Json                        // shared JobDocument (page list, versioned)
  groups      PrintGroup[]                // compiled setting groups
  totalPages  Int @default(0)
  finalPdfPath String?                    // compiled print-ready artifact
  compiledAt  DateTime?
  lastError   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model JobFile {                             // original uploads
  id        String  @id @default(uuid())
  printJob  PrintJob @relation(fields: [printJobId], references: [id])
  printJobId String
  kind      String                         // 'pdf' | 'image'
  path      String
  filename  String
  mimeType  String
  sizeBytes Int
  pageCount Int?
  createdAt DateTime @default(now())
}

model PrintGroup {                          // pages with identical settings, compiled
  id        String  @id @default(uuid())
  printJob  PrintJob @relation(fields: [printJobId], references: [id])
  printJobId String
  pages     Json                            // [{ pageIndex, rotation }]
  paperSize PaperSize
  color     PrintColor
  sides     Sides
  copies    Int
  quality   String?                         // 'draft'|'normal'|'high' (agent maps to driver)
  createdAt DateTime @default(now())
}

// ───────────────────────── payments (PayXmint) ─────────────────────────

model Payment {
  id            String  @id @default(uuid())
  order         Order?  @relation(fields: [orderId], references: [id])
  orderId       String?                        // null for subscription payments
  subscription  Subscription? @relation(fields: [subscriptionId], references: [id])
  subscriptionId String?
  provider      String  @default("payxmint")
  orderIdExternal String @unique               // our order_id sent to PayXmint (idempotency key)
  intentId      String?                        // ptx_... from create-intent
  amount        Decimal @db(10,2)
  currency      String  @default("INR")
  status        PaymentStatus @default(PENDING)
  utr           String?  @unique               // settlement ref — UNIQUE prevents double-credit
  payerUpi      String?
  rawWebhook    Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([orderIdExternal])
}

// ───────────────────────── immutable financial ledger ─────────────────────────

model LedgerEntry {
  id          String  @id @default(uuid())
  seq         BigInt  @default(autoincrement()) @unique
  type        LedgerEntryType
  amount      Decimal @db(12,2)               // always positive; sign from 'side'
  side        Int                            // +1 credit / -1 debit to 'account'
  account     String                         // 'platform' | 'shop:{id}' | 'user:{id}' | 'gateway'
  orderId     String?
  paymentId   String?
  refType     String?                        // 'order' | 'subscription' | 'payout' | ...
  refId       String?
  memo        String?
  createdAt   DateTime @default(now())
  @@index([account, createdAt])
  @@index([orderId])
}
// Money rules (enforced in service layer + tests):
// 1. Ledger rows are INSERT-ONLY. No updates, no deletes. Corrections = reversing entry.
// 2. Every order payment produces: ORDER_PAYMENT(-user,+gateway pending), then on settlement:
//    SHOP_EARNING, PLATFORM_FEE, REFERRAL_* , GATEWAY_FEE — all in ONE DB transaction.
// 3. Historical money is never recomputed from current PricingRule/PlatformConfig values.

// ───────────────────────── referrals & wallets ─────────────────────────

model ReferralEvent {
  id         String @id @default(uuid())
  referrer   User   @relation("UserReferrals", fields: [referrerId], references: [id])
  referrerId String
  referred   User   @relation("ReferredUsers", fields: [referredId], references: [id])
  referredId String @unique                       // one referrer per referred user, forever
  shopReferral Shop? @relation(fields: [shopReferralId], references: [id])
  shopReferralId String?
  kind       String                                  // 'customer' | 'shop'
  sourceType String?                                 // 'order' | 'subscription'
  sourceId   String?
  amount     Decimal @db(10,2)                       // snapshot of reward/commission
  pct        Decimal? @db(5,2)                       // for shop commission
  creditedAt DateTime?
  createdAt  DateTime @default(now())
  @@index([referrerId])
}

model Wallet {
  id        String @id @default(uuid())
  user      User   @relation(fields: [userId], references: [id])
  userId    String
  type      WalletType
  balance   Decimal @default(0) @db(12,2)
  @@unique([userId, type])
}

model WalletTxn {
  id        String @id @default(uuid())
  walletId  String
  amount    Decimal @db(12,2)
  side      Int                                  // +1/-1
  reason    String
  refId     String?
  balanceAfter Decimal @db(12,2)                // running balance, auditable
  createdAt DateTime @default(now())
  @@index([walletId, createdAt])
}

model Payout {
  id         String @id @default(uuid())
  userId     String
  amount     Decimal @db(12,2)
  status     String @default("REQUESTED")        // REQUESTED|APPROVED|PAID|REJECTED
  channel    String?                             // 'upi'
  destination String?                            // UPI VPA
  processedBy String?
  utr        String?
  createdAt  DateTime @default(now())
}

// ───────────────────────── subscriptions (shop plans) ─────────────────────────

model SubscriptionPlan {                        // ADMIN-managed rows — no hardcoded ₹99
  id           String  @id @default(uuid())
  name         String                       // Starter / Pro / ...
  price        Decimal @db(10,2)
  billingCycle String @default("monthly")
  trialDays    Int @default(0)
  features     Json                         // { staff: 1, printers: 1, inventory: false, ... }
  isActive     Boolean @default(true)
  sortOrder    Int @default(0)
  subscriptions Subscription[]
}

model Subscription {
  id          String @id @default(uuid())
  shop        Shop @relation(fields: [shopId], references: [id])
  shopId      String @unique
  plan        SubscriptionPlan @relation(fields: [planId], references: [id])
  planId      String
  status      SubscriptionStatus @default(TRIALING)
  currentPeriodEnd DateTime
  cancelAtPeriodEnd Boolean @default(false)
  payments    Payment[]
  invoices    Invoice[]
  updatedAt   DateTime @updatedAt
}

model Invoice {
  id             String @id @default(uuid())
  subscriptionId String?
  paymentId      String?
  number         String @unique
  amount         Decimal @db(10,2)
  pdfPath        String?
  createdAt      DateTime @default(now())
}

// ───────────────────────── printers & agents ─────────────────────────

model Printer {
  id        String  @id @default(uuid())
  shop      Shop    @relation(fields: [shopId], references: [id])
  shopId    String
  agent     Agent?  @relation(fields: [agentId], references: [id])
  agentId   String?
  name      String                        // OS printer name reported by agent
  isDefault Boolean @default(false)
  capabilities Json?                     // duplex/color/A3/trays — probed by agent
  lastStatus String?                    // 'online'|'offline'|'error'
  lastSeenAt DateTime?
  @@unique([shopId, name])
}

model Agent {
  id            String  @id @default(uuid())
  shop          Shop?   @relation(fields: [shopId], references: [id])
  shopId        String?
  deviceName    String
  pairingToken  String  @unique            // one-time pairing code shown in shop panel
  agentTokenHash String @unique           // long-lived scoped token (hashed at rest)
  version       String?
  lastSeenAt    DateTime?
  status        String  @default("pending") // pending|active|revoked
  createdAt     DateTime @default(now())
}

model AgentCommand {                        // cloud → agent instruction queue
  id        String  @id @default(uuid())
  agent     Agent   @relation(fields: [agentId], references: [id])
  agentId   String
  kind      String                            // 'print_group' | 'cancel' | 'config'
  payload   Json
  status    String  @default("QUEUED")        // QUEUED|DELIVERED|ACK|DONE|FAILED
  result    Json?
  createdAt DateTime @default(now())
  deliveredAt DateTime?
  @@index([agentId, status])
}

// ───────────────────────── platform plumbing ─────────────────────────

model Notification {
  id        String @id @default(uuid())
  user      User @relation(fields: [userId], references: [id])
  userId    String
  channel   NotificationChannel @default(IN_APP)
  type      String                          // 'order_paid','ready_for_pickup',...
  payload   Json?
  readAt    DateTime?
  sentAt    DateTime?
  createdAt DateTime @default(now())
  @@index([userId, readAt])
}

model AuditLog {
  id        String @id @default(uuid())
  actorId   String?
  action    String                          // 'order.paid','shop.approve','print.start'...
  entityType String?
  entityId  String?
  from      String?
  to        String?
  metadata  Json?
  ip        String?
  createdAt DateTime @default(now())
  @@index([entityType, entityId])
  @@index([actorId])
}

model JobQueue {                            // Postgres-backed queue (workers claim with FOR UPDATE SKIP LOCKED)
  id        String  @id @default(uuid())
  kind      String                            // 'compile_pdf','thumbnail','notify','payout','expire_order'
  payload   Json
  status    String  @default("PENDING")       // PENDING|PROCESSING|DONE|FAILED
  attempts  Int     @default(0)
  maxAttempts Int   @default(5)
  runAt     DateTime @default(now())
  lockedBy  String?
  lockedAt  DateTime?
  lastError String?
  createdAt DateTime @default(now())
  @@index([status, runAt])
}

model ShopDelivery {                        // shop-controlled delivery config
  shop            Shop  @relation(fields: [shopId], references: [id])
  shopId          String @id
  enabled         Boolean @default(false)
  mode            String  @default("shop_staff")  // shop_staff|owner|courier_later
  radiusKm        Decimal @default(3) @db(5,2)
  minOrder        Decimal @default(0) @db(10,2)
  fee             Decimal @default(0) @db(10,2)
  freeAbove       Decimal? @db(10,2)
  prepMinutes     Int @default(15)
  deliveryMinutes Int @default(45)
}
```

---

## 4. Auth (NextAuth v5)

- **Providers:** Credentials (email/phone + bcrypt via `authorize()`), Google OAuth.
- **Session:** JWT strategy (works under PM2 cluster mode). JWT carries `uid`, `role`; callbacks
  fetch role fresh from DB on token refresh so demotions take effect.
- **Signup:** register form accepts optional `ref` (referral code) → resolves referrer, sets
  `User.referredById`, mints the new user's own `referralCode`, records `ReferralEvent(kind=customer)`
  (uncredited until first eligible transaction).
- **Middleware:** role gates per route segment — `(admin)/*` requires ADMIN+, `(shop)/*` requires a
  ShopMember row, agent API requires the agent token (not a session).
- **RBAC helper:** `requireRole(user, roles)` and `requireShopRole(user, shopId, roles)` called in
  every server action/service — never trust the UI.

---

## 5. Payment integration — PayXmint

Wrapped behind the existing `PaymentProvider` interface so nothing else knows the gateway.

```ts
// packages/shared/src/payment.ts (already in MVP — unchanged contract)
interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyCallback(req: Request): Promise<VerifiedCallback>;
  checkStatus(orderIdExternal: string): Promise<'PENDING' | 'SUCCESS' | 'EXPIRED'>;
}
```

### 5.1 Flow (custom/white-label checkout — PayXmint §4)

```
Checkout submit
  → server: snapshot total → Payment row (PENDING, orderIdExternal = order number + ts)
  → POST /api/v1/create-intent  (Bearer key, Idempotency-Key: orderIdExternal)
  → store intentId; return upi_links + qr_data + checkout_url to client
  → client: mobile → UPI deep-link buttons; desktop → QR (qrcode.react)
  → client polls OUR /api/payments/status (server proxies check-status) every 3.5s → UI update only
  → PayXmint webhook payment.success → HMAC verify → fulfill (authoritative)
  → worker reconcile sweep for webhooks missed (check-status on stale PENDING)
```

### 5.2 Webhook handler (PayXmint §3 — mandatory safety net)

`POST /api/payments/webhook` — must read the **raw body** (`X-PayxMint-Signature` is
HMAC-SHA256-hex of the raw string; in Next.js read via `await req.text()` before any parse):

1. Verify signature against `PAYXMINT_WEBHOOK_SECRET`; mismatch → 401.
2. Parse `{ event, order_id, amount, utr, payer_upi, timestamp }`.
3. **Idempotency:** if `Payment.status === 'SUCCESS'` or `utr` already exists → return 200
   immediately (`already_processed`).
4. In ONE transaction:
   - `Payment`: status→SUCCESS, utr (unique constraint = physical double-credit block),
     payerUpi, rawWebhook.
   - `Order`: status→PAID (or `Subscription`→ACTIVE + `Invoice` + period roll-forward).
   - Ledger entries (INSERT-only): SHOP_EARNING, PLATFORM_FEE, REFERRAL_REWARD /
     REFERRAL_COMMISSION, GATEWAY_FEE. Wallet credits via `WalletTxn` with running balance.
   - `OrderEvent`, `AuditLog`, notification + SSE fan-out to shop.
   - Enqueue `compile_pdf` job.
5. Always answer **HTTP 200** (even duplicates) so retries stop.

### 5.3 Config

```
PAYXMINT_API_KEY=            # Authorization: Bearer
PAYXMINT_WEBHOOK_SECRET=     # HMAC verification
PAYXMINT_BASE_URL=https://payxmint.com
# Dev simulator: POST /api/v1/simulate-payment { "order_id": "..." }
```

Dev parity: keep the MVP's `/dev/pay` sandbox page, pointing at PayXmint's simulator endpoint.

---

## 6. State machines (single source in `packages/shared/src/enums.ts`)

**Order:** `CREATED → AWAITING_PAYMENT → PAYMENT_PROCESSING → PAID → ACCEPTED → PREPARING → READY
→ (READY_FOR_PICKUP | OUT_FOR_DELIVERY) → COMPLETED`; failures: `CANCELLED, EXPIRED, REFUNDED`.
Transition table enforced by `canTransition()`; every transition writes `OrderEvent` + `AuditLog`.

**PrintJob:** `DRAFT → CONFIGURING → QUEUED → PRINTING → PRINTED` (+ `PRINT_FAILED`, `CANCELLED`).
`PAID` compile pipeline: worker compiles `JobDocument` → `PrintGroup[]` → `final.pdf` → job
`QUEUED`; agent drives `PRINTING/PRINTED/PRINT_FAILED`.

**Visibility rule (structural):** shop queries filter `status >= PAID`. The shop can never see an
unpaid order — same gate as the MVP, now on orders.

---

## 7. Pricing engine

Stays pure and shared (`packages/shared/src/pricing.ts`), extended for the ecosystem:

```
PlatformConfig (platform_fee, referral_reward, commission %)   ← ADMIN
Shop PricingRule (per-page rates, addons, services)            ← SHOP OWNER (within caps)
        ↓ quote() — pure function
PriceBreakdown → snapshot onto Order.pricingSnapshot + line items at creation
```

- `quote(shopId, items[])` resolves per-shop rules with platform fallbacks and applies delivery
  fee from `ShopDelivery` (radius/min-order/free-above) — shop-controlled.
- Wallet application happens at checkout, after snapshot, as a separate debit step.
- `Platform fee` is added on top; `referral_reward` is carved out of it at settlement time using
  **the PlatformConfig values snapshotted on the order** (stored in `pricingSnapshot.config`),
  so admin changes never rewrite history.

---

## 8. Windows Shop Agent (Electron)

Evolves from the MVP desktop app; protocol is versioned in `packages/shared/src/agent-protocol.ts`.

### 8.1 Pairing & auth

```
Shop panel: Settings → Printers → [ + Connect Agent ]
  → server creates Agent(pairingToken: 6-8 char one-time code, 15 min TTL)
Shop PC: install agent → enter code + server URL
  → POST /api/agent/auth { pairingToken, deviceName, version }
  → server returns long-lived scoped agentToken (shown once, stored hashed)
Agent stores token in OS keychain (safeStorage); all calls: Authorization: Bearer <agentToken>
```

Agent can do ONLY: list/claim its shop's paid orders, download artifacts, report events, heartbeat.
Revocable instantly from the shop panel/admin (status→revoked).

### 8.2 Job flow

```
Agent (poll 10s + SSE push) → GET /api/agent/orders?status=PAID
Agent claims order          → POST /api/agent/orders/:id/claim  → order ACCEPTED (if pending)
Print                       → GET /api/agent/orders/:id/file?group=... (signed, short-TTL)
                            → pdf-to-printer/SumatraPDF with per-group flags:
                              paper size, color/grayscale, duplex, copies, tray, quality
Events                      → POST /api/agent/print-events { printJobId, status, error? }
                              PRINTING → PRINTED / PRINT_FAILED (reason captured on PrintJob)
Heartbeat                   → POST /api/agent/heartbeat { printers: [{name, status, caps}] }
                              updates Printer rows → shop panel shows online/offline
```

### 8.3 Capability mapping (the critical separation)

The cloud never assumes a driver. `PrintGroup` says *what is wanted*; the agent maps to *what the
printer supports*: exact paper name from driver capabilities, `dwDuplex`/grayscale via
SumatraPDF/DEVMODE, missing capability → report `PRINT_FAILED` with reason + suggest fallback
(e.g. duplex→simplex with owner confirmation toggle in agent settings).

---

## 9. Background workers (PM2 strict)

`ecosystem.config.js` (single definition of every process):

| Process | Script | Role |
|---|---|---|
| `web` | `apps/web` standalone server (cluster: CPU count) | HTTP/SSE |
| `worker-docs` | `workers/docs.ts` | Claims `compile_pdf`/`thumbnail` queue items → compiles final.pdf per group |
| `worker-payments` | `workers/payments.ts` | Reconcile: poll stale PENDING payments → check-status; mark EXPIRED; refund follow-ups |
| `worker-notify` | `workers/notify.ts` | Drains notification queue → in-app/email/WhatsApp adapters |
| `cron-expiry` | `workers/cron.ts` (`*/5 * * * *`) | Expire unpaid orders, subscription period checks, dunning |
| `cron-maintenance` | `workers/cron.ts` (daily) | Storage cleanup for expired/unpaid artifacts, agent-token TTL sweeps |

Queue contract: `SELECT … FOR UPDATE SKIP LOCKED` claim, attempts/backoff, poison → FAILED with
`lastError`; all money-path work is idempotent (unique `utr`, status guards).

PM2 strictness rules: `pm2 start ecosystem.config.js --env production` only; no console `node`;
`max_memory_restart`, `kill_timeout` for graceful drain; logs to `pm2-logrotate`; `pm2 startup`
+ `pm2 save` for boot persistence.

---

## 10. Realtime

- **SSE** `/api/events` (auth by session): customer stream = own order events; shop stream = new
  paid orders + printer status. Server subscribes to Postgres `LISTEN/NOTIFY` on
  `order_events`/`print_events` triggers and fans out.
- Fallback: shop order board polls every 15s (same as MVP) if SSE drops.
- When scaling beyond one node, replace LISTEN/NOTIFY fan-out with Redis pub/sub — the SSE route
  interface doesn't change.

---

## 11. Storage & document security

```
/data/printpass/
  originals/{shopId}/{orderId}/{fileId}.{ext}
  finals/{shopId}/{orderId}/final.pdf
  previews/{orderId}/{pageId}.webp
  qr/{shopId}.png
  invoices/{year}/{number}.pdf
```

- Never served statically. All access through authed route handlers → RBAC check → streamed file
  or short-TTL signed token (agent uses same mechanism).
- Uploads: MIME allowlist + magic-byte sniff, 25 MB/file, 100 MB/job, per-user rate limits.
- Retention: completed-order artifacts purged after N days (admin config); originals optionally
  retained per shop preference.
- Print shops see files only for paid orders of their shop — enforced in the service layer,
  RLS-equivalent via Prisma `where` scoping (single DB, app-level multi-tenancy).

---

## 12. Environments

```
DATABASE_URL=postgresql://...            # Prisma
AUTH_SECRET= / AUTH_URL=                 # NextAuth
AUTH_GOOGLE_ID= / AUTH_GOOGLE_SECRET=
PAYXMINT_API_KEY= / PAYXMINT_WEBHOOK_SECRET= / PAYXMINT_BASE_URL=
STORAGE_ROOT=/data/printpass
SIGNED_URL_TTL_SECONDS=300
AGENT_PAIRING_TTL_MINUTES=15
APP_URL=https://printpass.app
NODE_ENV=production
```

Secrets in `/etc/printpass.env` (chmod 600), loaded by PM2 `env_file` — never in the repo.

---

## 13. Deployment runbook (summary)

1. VPS: Node 20+, PostgreSQL 16, Nginx, PM2 (`npm i -g pm2`), `pm2 startup`.
2. `prisma migrate deploy` on release; `prisma generate` at build.
3. `npm run build` (web standalone) → `pm2 startOrReload ecosystem.config.js --env production`.
4. Nginx: TLS (Let's Encrypt), proxy → `127.0.0.1:3000`, client_max_body_size 110m for uploads,
   `proxy_buffering off` for SSE, rate-limit zones on auth + upload + webhook.
5. PayXmint dashboard: set webhook URL `https://…/api/payments/webhook`.
6. Backups: nightly `pg_dump` + storage rsync; ledger table also exported daily.
7. Observability: pm2-logrotate, `/api/health` (DB+queue depth) for uptime checks, Sentry (later).

---

## 14. Security checklist

- Signature-verified webhook, raw-body HMAC, idempotent processing, unique `utr`.
- All money mutations inside DB transactions; ledger insert-only; wallets via `WalletTxn` running
  balance.
- JWT sessions + server-side role re-verification; per-shop scoping in every Prisma query.
- Agent tokens hashed at rest, scoped, revocable; pairing codes one-time + TTL.
- Rate limits: auth, uploads, payment-intent creation, referral link hits.
- Audit log on every privileged action (admin + shop + system).
- File access never public; signed short-TTL; virus-scan hook on upload queue (ClamAV, later).
