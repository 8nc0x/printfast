# Codebase Documentation — "PrintFlow" MVP (`printfast/`)

> What exists **today**, verified from the code. Everything else in this doc set
> ([00-PRODUCT-SPEC.md](00-PRODUCT-SPEC.md), [01-ARCHITECTURE.md](01-ARCHITECTURE.md),
> [02-ROADMAP.md](02-ROADMAP.md)) describes the target "PrintPass" platform this MVP grows into.
>
> All 8 MVP phases are complete per the README. Stack today: **Next.js 15 (App Router) +
> Auth.js/NextAuth v5 + Supabase (Postgres + Storage) + shadcn/ui + Electron**. Phase 0 of the
> roadmap migrates this to **Prisma + PostgreSQL + PM2**.

---

## 1. Repository layout

```
printfast/                         npm-workspaces monorepo ("printflow" v0.1.0)
├─ package.json                    scripts: dev | build | build:shared | lint | typecheck
├─ .env.example                    Supabase, Auth.js, gateway, storage, shop-token vars
├─ apps/
│  ├─ web/                         Next.js 15 PWA — student + shop dashboards + APIs
│  └─ desktop/                     Electron shop printing app (Windows; NSIS installer)
├─ packages/shared/                THE contract: enums, geometry, pricing, payment, order numbers
├─ supabase/
│  ├─ setup.sql                    one-shot setup (paste into Supabase SQL editor)
│  ├─ seed.sql
│  └─ migrations/0001_init.sql | 0002_rls.sql | 0003_storage.sql
├─ scripts/                        db-setup.mjs, seed-users.mjs
├─ docs/ARCHITECTURE.md            original MVP blueprint (this doc set supersedes parts of it)
├─ create-cred.mjs                 helper for Auth.js Google credentials
└─ README.md
```

---

## 2. `packages/shared` — the shared contract

The single source of truth imported by web and desktop. Keep in exact sync with Postgres enums.

| File | Contents |
|---|---|
| `enums.ts` | `USER_ROLES` (`student`,`shop_owner`), 11-state `JOB_STATUSES`, `SHOP_VISIBLE_FROM='shop_received'` + `statusRank`/`isShopVisible` visibility gate, `PAYMENT_STATUSES`, `PAPER_SIZES` (A4/A3), `ORIENTATIONS`, `BINDING_TYPES`, `FILE_KINDS`, `PAGE_COLORS`, `ROTATIONS`, `ACCEPTED_MIME_TYPES` (pdf/jpeg/png/webp), `MAX_FILE_BYTES` 25 MB, `MAX_JOB_BYTES` 100 MB, and the **state machine**: `JOB_TRANSITIONS` + `canTransition()` |
| `geometry.ts` | zod schemas: `sourceRefSchema` (discriminated union `pdf_page`/`image`), `pageItemSchema` (id, source, rotation 0/90/180/270, color per page), `jobSettingsSchema` (paperSize/orientation/copies 1–99/binding), `jobDocumentSchema` (version 1), `computeMetrics()`, `PAPER_POINTS` (ISO 216 in pt). This is THE fidelity guarantee: editor preview and server PDF both render from this one model |
| `pricing.ts` | Pure `quote(doc, config)` → `PriceBreakdown` with itemized lines; `DEFAULT_PRICING` (B&W ₹2, color ₹10, A3 ×2, staple ₹5, spiral ₹30 — config-driven, not hardcoded UI) |
| `payment.ts` | `PaymentProvider` interface: `createPayment()` / `verifyCallback()`. The rest of the codebase never knows the gateway |
| `order-number.ts` | Human-readable order/pickup tokens (e.g. `PF-2C7K9`) |

---

## 3. `apps/web` — Next.js 15 PWA

### 3.1 Auth & middleware

- `src/auth.ts` + `src/auth.config.ts` — Auth.js v5; email+password (bcrypt) and Google OAuth.
- `src/middleware.ts` — route gating: `/shop/*` requires `shop_owner`; students gated to their
  areas; redirects for signed-out users.
- `src/app/(auth)/` — login, register, actions (`actions.ts`, `auth-actions.ts`).
- `src/types/next-auth.d.ts` — session augmentation with `uid` and `role`.

### 3.2 Student flow (App Router segments)

| Route | Purpose |
|---|---|
| `(student)/dashboard` | Job list, new-job entry |
| `(student)/jobs/new` | Upload page (`uploader.tsx`) → creates draft job |
| `(student)/jobs/[id]/edit` | **Canva-like page editor** (`components/editor/editor.tsx`, `page-thumb.tsx`): dnd reorder, rotate, duplicate, delete, per-page color, insert image; pdf.js thumbnails |
| `(student)/jobs/[id]/pay` | Quote + pay panel (`pay-panel.tsx`, `actions.ts`); without a real gateway, redirects to the built-in sandbox |
| `(student)/jobs/[id]`, `/jobs`, `/drafts`, `/reorder` | Job detail (status timeline), history, drafts, quick reorder |
| `(student)/profile` | Profile |
| `dev/pay` | Payment sandbox simulating a successful callback so the full PAID → shop flow works locally |

### 3.3 Shop flow

- `(shop)/orders` — queue with actions (`actions.ts`, `order-card.tsx`): approve/reject/print/
  status advance; PDF preview; `SHOP_VISIBLE_FROM` gate enforced server-side.
- `components/status-badge.tsx`, `components/job-card.tsx`, `components/bottom-nav.tsx` — shared UI
  (shadcn primitives under `components/ui/`: button, card, input, label).

### 3.4 Server layer (`src/lib`, `src/app/api`)

- `lib/data/*` — job-service, jobs, job-detail, shop, shop-actions, audit (server actions + Prisma-
  style repos over Supabase).
- `lib/pdf/*` — `inspect.ts` (page counts), `generate.ts` (thumbnails), `finalize.ts` (**final.pdf
  generation via pdf-lib + sharp**, the print source of truth), `render-client.ts`.
- `lib/upload/validate.ts` — MIME + magic-byte validation, size limits from shared constants.
- `lib/supabase/*` — admin client, storage, generated DB types.
- `lib/payments/*` — `index.ts` (provider selection), `custom-provider.ts` (owner's gateway impl),
  `process.ts` (fulfillment on verified callback).
- `lib/shop-token.ts` — HS256 scoped shop token for the desktop app (separate from user session).
- `lib/constants.ts`, `lib/utils.ts`, `lib/db.types.ts`.

### 3.5 API route handlers

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | Auth.js |
| `/api/payments/callback` | POST | Gateway callback → verify → job `PAID` → lock → `final.pdf` → `shop_received` |
| `/api/payments/dev-complete` | POST | Dev-only completion for the sandbox |
| `/api/shop/auth` | POST | Shop-owner login → scoped shop token |
| `/api/shop/jobs` | GET | Paid queue (`status >= shop_received` enforced server-side) |
| `/api/shop/jobs/[id]/final-url` | GET | Signed URL for `final.pdf` |
| `/api/shop/jobs/[id]/status` | POST | `approved/printing/printed/ready_for_pickup/completed` (validated via `canTransition`) |
| `/api/shop/printers` | POST | Register/update printer config |

### 3.6 PWA

`public/manifest.json` + service worker + `service-worker-register.tsx`; `offline/page.tsx`
offline shell.

---

## 4. `apps/desktop` — Electron shop app (Windows)

- `src/main.cjs` — window, config store (`userData/printflow-config.json`), API client,
  printer detection + printing via **`pdf-to-printer` (bundles SumatraPDF — Windows-only)**,
  test page via `pdf-lib`.
- `src/preload.cjs` — minimal `window.printflow` IPC bridge; context isolation on, no Node in
  renderer.
- `src/renderer/` — vanilla JS UI: login, printer picker + health, order board (polls every 15s),
  actions.
- Auth: server URL + shop-owner login → scoped token; never touches Supabase directly.
- Build: `npm run build --workspace=apps/desktop` → electron-builder NSIS installer
  (`release/*.exe`).
- Copies applied at print time from job metadata; final.pdf stores a single copy.

---

## 5. Database (Supabase Postgres today)

Tables: `users`, `shops`, `shop_settings` (per-shop pricing config), `print_jobs` (document jsonb +
denormalized metadata + price snapshot + `is_locked`), `job_files`, `job_pages`, `payments`
(unique `gateway_reference`), `printer_config`, `notifications`, `audit_logs`. All id/uuid,
`updated_at` trigger, RLS on every table (migration `0002_rls.sql`), private storage buckets
`originals/ finals/ previews/` with short-TTL signed URLs (`0003_storage.sql`).

Key invariants already enforced:

- Job status transitions validated against shared `JOB_TRANSITIONS`.
- Shop sees nothing before `shop_received` (query-level threshold).
- `PAID` set **only** by the verified server-side callback; client can never assert payment.
- Price snapshot on the job at payment time; later pricing changes don't alter it.

---

## 6. Known gaps vs the PrintPass target (why the roadmap exists)

1. Supabase + raw SQL migrations → target is **Prisma + PostgreSQL** on our own host.
2. Single-model print job (one paper size/copies/binding per job; per-page color only) → target
   has **per-page/per-group settings** (A4 B&W duplex + A4 color simplex + A3 in one job).
3. No **Order** object — print job is the top entity; target makes orders (print + stationery +
   services) the core with print inside.
4. No catalog/inventory/staff/delivery/analytics; no QR system beyond job tokens.
5. No subscriptions, referral system, wallets, or financial ledger (payments are recorded but not
   double-entry).
6. Payments: provider interface exists; no PayXmint implementation or reconcile worker yet.
7. Desktop app polls; target adds SSE + agent pairing/protocol and capability mapping.
8. Single shop assumed in practice; target is multi-shop with admin control center.

---

## 7. How to run (today)

```bash
npm install
cp .env.example apps/web/.env.local    # fill Supabase + Auth secrets
# Supabase SQL editor: supabase/setup.sql (or migrations 0001→0003 + seed.sql)
npm run dev                            # http://localhost:3000
npm run dev --workspace=apps/desktop   # Electron shop app (dev)
npm run typecheck                      # workspaces typecheck
```

Auth roles for testing: register a user, then `update users set role='shop_owner' where email='…';`
Payment without a real gateway: the `/dev/pay` sandbox simulates the verified callback, so the full
PAID → shop → print flow runs locally.
