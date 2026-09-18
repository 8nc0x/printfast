# PrintFlow

Skip-the-queue college print ordering. Mobile-first PWA for students + (later) an Electron desktop app for the shop.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — original MVP blueprint (historical)
- [docs/03-CODEBASE.md](docs/03-CODEBASE.md) — **what is built today** (verified code documentation)
- [docs/00-PRODUCT-SPEC.md](docs/00-PRODUCT-SPEC.md) — target product: full stationery-shop ecosystem spec
- [docs/01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md) — target technical architecture (Next.js App Router + NextAuth + Prisma/Postgres + PM2 + shadcn/ui + PayXmint)
- [docs/02-ROADMAP.md](docs/02-ROADMAP.md) — phased delivery plan, MVP → PrintPass, with exit criteria

## Monorepo layout

```
apps/web            Next.js 15 PWA (student + shop dashboards)
apps/desktop        Electron shop printing app (Phase 8)
packages/shared     Shared types, geometry model, pricing, payment interface
supabase/           SQL migrations + seed
docs/               Architecture blueprint
```

## Prerequisites

- Node 20+
- A Supabase project (Postgres + Storage)

## Setup

```bash
npm install

# 1) Configure environment
cp .env.example apps/web/.env.local   # fill in DATABASE_URL + Auth + PayXmint secrets

# 2) Apply the database schema (Prisma → PostgreSQL)
npm run db:migrate                    # dev: create + apply a migration
# or, on an existing database:
npm run db:deploy

# 3) Seed the demo shop + accounts (student@demo.com / shop@demo.com, pw: demo12345)
npm run db:seed

# 4) Run the web app
npm run dev            # http://localhost:3000
```

## Stack

- Next.js (App Router) + Auth.js/NextAuth v5 · PostgreSQL + Prisma · PM2 (production) ·
  shadcn/ui · PayXmint payments · local-disk storage with signed URLs.

## Auth

- Email + password (bcrypt, stored in `users`) and Google OAuth via Auth.js (NextAuth v5).
- Two roles: `student` (default) and `shop_owner`. Middleware enforces area access.
- To create the shop owner for local testing, register a user, then run
  `npx prisma studio` and set `role = 'shop_owner'` for that user.

## Build status (by phase)

**MVP (PrintFlow) — complete:**
- [x] **Phase 1** — Monorepo, schema, Auth.js + roles, PWA shell, student & shop dashboards
- [x] **Phase 2** — File upload (MIME + magic-byte validation) + storage + draft job creation
- [x] **Phase 3** — Canva-like page-arrangement editor (dnd reorder, rotate, duplicate, delete, per-page color, insert image, pdf.js thumbnails)
- [x] **Phase 4** — Server PDF generation pipeline (pdf-lib + sharp), shared geometry model
- [x] **Phase 5** — Config-driven pricing engine, live in the editor and at checkout
- [x] **Phase 6** — PaymentProvider abstraction + verified callback → PAID → final PDF → shop
- [x] **Phase 7** — Shop dashboard actions (approve/reject/print/status), PDF preview, audit + notifications
- [x] **Phase 8** — Electron desktop printing app + token-authed shop API

**Ecosystem (PrintPass) — Phase 0–7 implemented on the new stack:**
- [x] **Phase 0** — Migration: Supabase → **PostgreSQL + Prisma** (`packages/db`), local-disk storage with signed URLs, **PM2** (strict) + Nginx configs
- [x] **Phase 1** — **PayXmint** integration: create-intent, UPI deep links + QR checkout, signed webhook (idempotent), status polling, reconcile worker
- [x] **Phase 2** — **Orders as core object**: catalog (printing/stationery/services), mixed-cart checkout, pickup vs shop-controlled delivery, unified shop order board
- [x] **Phase 3** — **Money integrity**: immutable ledger, wallets with running balance, referrals (customer + shop) with signup capture, withdrawals
- [x] **Phase 4** — **Subscriptions + admin panel**: DB-driven plans, feature gates, admin (overview/shops/users/plans/config), RBAC (admin/super_admin)
- [x] **Phase 5** — **Print engine v2**: print groups, agent pairing (one-time code → scoped token), capability-aware printing (grayscale/duplex/paper mapping with warnings), heartbeat printer status, agent API (pair/orders/claim/events/heartbeat/queue)
- [x] **Phase 6** — **Realtime**: SSE live refresh on dashboards, notifications bell with unread counts
- [x] **Phase 7** — **Growth tools**: shop QR poster, inventory (stock tracking, auto-deduct, low-stock alerts), analytics (today, popular items, peak hours)
- [ ] **Phase 8** — Launch hardening: cron + health endpoint done; remaining: load tests, backup drill, pilot onboarding

## Payment flow (dev)

Without a real gateway configured, `createPayment` redirects to a built-in sandbox
(`/dev/pay`) that simulates a successful callback so the full PAID → shop flow works
locally. Set `PAYMENT_GATEWAY_BASE_URL` (+ key/secret) to use the real gateway; the
only code that changes is `apps/web/src/lib/payments/custom-provider.ts`.

## Desktop app (Windows Shop Agent)

The Electron app pairs with the server via a one-time code (Shop → Printers → Generate pairing
code), reports printer capabilities on a heartbeat, and prints **per-group** with automatic
driver mapping (grayscale/duplex/paper fallbacks with warnings). See
[apps/desktop/README.md](apps/desktop/README.md).

## Production (PM2 — strict)

```bash
npm run build
pm2 startOrReload ecosystem.config.js --env production
pm2 startup && pm2 save          # boot persistence
```

Processes: `printflow-web` (Next.js standalone, cluster), `printflow-reconcile` (payment sweep,
*/5), `printflow-cron` (expiry + dunning, */10). Health probe: `GET /api/health`.
Nginx config: [deploy/nginx.conf](deploy/nginx.conf).
