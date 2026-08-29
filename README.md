# PrintFlow

Skip-the-queue college print ordering. Mobile-first PWA for students + (later) an Electron desktop app for the shop.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full blueprint.

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
cp .env.example apps/web/.env.local   # fill in Supabase + Auth secrets

# 2) Apply the database schema
#    In the Supabase SQL editor, run in order:
#      supabase/migrations/0001_init.sql
#      supabase/migrations/0002_rls.sql
#      supabase/seed.sql

# 3) Run the web app
npm run dev            # http://localhost:3000
```

## Auth

- Email + password (bcrypt, stored in `users`) and Google OAuth via Auth.js (NextAuth v5).
- Two roles: `student` (default) and `shop_owner`. Middleware enforces area access.
- To create the shop owner for local testing, register a user, then in Supabase set
  `update users set role = 'shop_owner' where email = '...';`

## Build status (by phase)

- [x] **Phase 1** — Monorepo, Supabase schema, Auth.js + roles, PWA shell, student & shop dashboards
- [x] **Phase 2** — File upload (MIME + magic-byte validation) + Supabase Storage + draft job creation
- [x] **Phase 3** — Canva-like page-arrangement editor (dnd reorder, rotate, duplicate, delete, per-page color, insert image, pdf.js thumbnails)
- [x] **Phase 4** — Server PDF generation pipeline (pdf-lib + sharp), shared geometry model, verified
- [x] **Phase 5** — Config-driven pricing engine, live in the editor and at checkout
- [x] **Phase 6** — PaymentProvider abstraction + custom gateway + verified callback → PAID → final PDF → shop
- [x] **Phase 7** — Shop dashboard actions (approve/reject/print/status), PDF preview, audit + notifications
- [x] **Phase 8** — Electron desktop printing app + token-authed shop API

## Payment flow (dev)

Without a real gateway configured, `createPayment` redirects to a built-in sandbox
(`/dev/pay`) that simulates a successful callback so the full PAID → shop flow works
locally. Set `PAYMENT_GATEWAY_BASE_URL` (+ key/secret) to use the real gateway; the
only code that changes is `apps/web/src/lib/payments/custom-provider.ts`.

## Desktop app

See [apps/desktop/README.md](apps/desktop/README.md).
