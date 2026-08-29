# PrintFlow — Architecture Blueprint (MVP)

> Working title: **PrintFlow**. Single college, single shop. Mobile-first PWA for students + Electron desktop app for the shop.
> Status: **draft for approval**. Nothing is built yet. This is the spec we build against.

---

## 1. Product in one line

A skip-the-queue print service: students upload, arrange, configure, **pay ahead**, and pick up when ready; the shop only ever sees **paid** jobs and prints them from a dead-simple desktop app.

**North-star job:** *skip the queue → pay ahead → pick up when ready.*

Design consequences that follow from that framing:
- The shop app must be easier than WhatsApp+USB on day one (shop adoption is risk #1).
- The final PDF the shop prints must match the student's editor preview **exactly** (fidelity risk #2).
- Payment is a gate, not a feature: no paid state → shop sees nothing.

---

## 2. Users & JTBD (kept short — see discovery notes)

| Role | Core job | Success feels like |
|------|----------|--------------------|
| Student | Get something printed correctly and ready without queuing | Pay from phone, get a pickup token, walk in and collect |
| Shop owner | Print exactly what was ordered, paid-first, no disputes | Open app → paid queue → one-click print → mark ready |

---

## 3. Job lifecycle (state machine)

```
DRAFT ──▶ CONFIGURED ──▶ PAYMENT_PENDING ──▶ PAID ──▶ SHOP_RECEIVED
   │                          │                          │
   │(editable)                │(gateway callback)        ├─▶ APPROVED ─▶ PRINTING ─▶ PRINTED ─▶ READY_FOR_PICKUP ─▶ COMPLETED
   │                          │                          └─▶ REJECTED (refund/again)
   └────────── student edits freely until PAID ──────────┘
```

Rules:
- **Locked at PAID.** No student edits, no cancellation after successful payment (per spec).
- Shop dashboard query is `status >= SHOP_RECEIVED` — *structurally impossible* to see unpaid jobs.
- `PAYMENT_PENDING → PAID` happens **only** via a verified gateway callback (server-side), never a client claim.
- `REJECTED` is terminal for that job; student re-orders (new job) — refund handled by your gateway out of band for MVP.
- Every transition writes an `audit_logs` row.

Enum (Postgres): `draft, configured, payment_pending, paid, shop_received, approved, printing, printed, ready_for_pickup, completed, rejected`.

---

## 4. The shared geometry model (the critical design)

The editor and the server PDF generator **must not** be two separate implementations. They share one document model. The editor renders a preview *from these instructions*; the server generates the final PDF *from the same instructions*. This is what kills the fidelity/dispute risk.

A job's content is an **ordered list of pages**; each page references a source and carries a transform + print flags:

```ts
// packages/shared/src/geometry.ts
type SourceRef =
  | { kind: 'pdf_page'; fileId: string; pageIndex: number }   // a page from an uploaded PDF
  | { kind: 'image';    fileId: string };                     // an uploaded image as a full page

interface PageItem {
  id: string;                 // stable id (for dnd + audit)
  source: SourceRef;
  rotation: 0 | 90 | 180 | 270;
  color: 'color' | 'bw';      // per-page (full editor)
}

interface JobDocument {
  pages: PageItem[];          // final print order
  settings: {
    paperSize: 'A4' | 'A3';   // whole job
    orientation: 'portrait' | 'landscape';
    copies: number;
    binding: 'none' | 'staple' | 'spiral';
  };
  version: 1;
}
```

Server generation (Phase 4): load `JobDocument` → for each `PageItem`, pull the source (pdf-lib embeds a page; images placed to fit paper) → apply rotation → assemble → **duplicate for copies** at print time (or store single + copies count; see §7). Output one `final.pdf`, the source of truth. Color is metadata for pricing and shop info; the printer driver handles actual color/bw at print time in Electron.

Preview thumbnails (Phase 3) are rendered from the same `PageItem` list so WYSIWYG holds.

---

## 5. Database schema (Supabase Postgres)

Enums first, then tables. All tables `id uuid default gen_random_uuid() primary key`, `created_at timestamptz default now()`, `updated_at` via trigger. RLS on every table (see §6).

```sql
-- ENUMS
create type user_role       as enum ('student','shop_owner');
create type job_status       as enum ('draft','configured','payment_pending','paid',
                                       'shop_received','approved','printing','printed',
                                       'ready_for_pickup','completed','rejected');
create type payment_status   as enum ('pending','success','failed','refunded');
create type paper_size        as enum ('A4','A3');
create type orientation       as enum ('portrait','landscape');
create type binding_type      as enum ('none','staple','spiral');
create type file_kind         as enum ('pdf','image');

-- USERS  (mirrors auth; Auth.js/Supabase auth is source of truth for credentials)
create table users (
  id           uuid primary key,               -- = auth user id
  email        text unique not null,
  name         text,
  role         user_role not null default 'student',
  created_at   timestamptz default now()
);

-- SHOPS  (one row in MVP, but modeled for many)
create table shops (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  address      text,
  owner_id     uuid references users(id),
  is_active    boolean default true,
  created_at   timestamptz default now()
);

-- SHOP_SETTINGS  (pricing config lives here — configurable per spec)
create table shop_settings (
  shop_id            uuid primary key references shops(id) on delete cascade,
  price_bw_page      numeric(10,2) not null default 2.00,
  price_color_page   numeric(10,2) not null default 10.00,
  paper_multiplier   jsonb not null default '{"A4":1,"A3":2}',
  binding_price      jsonb not null default '{"none":0,"staple":5,"spiral":30}',
  currency           text not null default 'INR',
  accepting_orders   boolean default true,
  updated_at         timestamptz default now()
);

-- PRINT_JOBS
create table print_jobs (
  id                 uuid primary key default gen_random_uuid(),
  order_number       text unique not null,          -- human token, e.g. PF-2C7K9  (also the pickup token)
  student_id         uuid not null references users(id),
  shop_id            uuid not null references shops(id),
  status             job_status not null default 'draft',
  document           jsonb not null default '{"pages":[],"settings":{},"version":1}', -- JobDocument (§4)
  -- denormalized metadata (from document, for dashboards/queries)
  total_pages        int not null default 0,
  color_pages        int not null default 0,
  bw_pages           int not null default 0,
  copies             int not null default 1,
  paper_size         paper_size default 'A4',
  orientation        orientation default 'portrait',
  binding            binding_type default 'none',
  price_amount       numeric(10,2),                 -- generated price snapshot
  final_pdf_path     text,                          -- storage key of final.pdf
  is_locked          boolean default false,         -- true once PAID
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create index on print_jobs (student_id, created_at desc);
create index on print_jobs (shop_id, status);
create index on print_jobs (status);

-- JOB_FILES  (original uploads)
create table job_files (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references print_jobs(id) on delete cascade,
  kind         file_kind not null,
  storage_path text not null,                       -- original file key
  filename     text not null,
  mime_type    text not null,
  size_bytes   bigint not null,
  page_count   int,                                 -- for pdfs
  sort_order   int default 0,
  created_at   timestamptz default now()
);
create index on job_files (job_id);

-- JOB_PAGES  (materialized page list — optional mirror of document.pages for querying/thumbnails)
create table job_pages (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references print_jobs(id) on delete cascade,
  page_index    int not null,                       -- position in final order
  source_file   uuid references job_files(id) on delete cascade,
  source_page   int,                                -- for pdf pages
  rotation      int default 0,
  color         text default 'bw',                  -- 'color' | 'bw'
  preview_path  text,                               -- thumbnail key
  created_at    timestamptz default now(),
  unique (job_id, page_index)
);
create index on job_pages (job_id, page_index);

-- PAYMENTS
create table payments (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references print_jobs(id) on delete cascade,
  amount             numeric(10,2) not null,
  currency           text not null default 'INR',
  status             payment_status not null default 'pending',
  provider           text not null default 'custom',     -- PaymentProvider name
  payment_reference  text,                                -- our internal ref shown to user/shop
  gateway_reference  text,                                -- gateway's txn id
  raw_callback       jsonb,                               -- verified callback payload
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create index on payments (job_id);
create unique index on payments (gateway_reference) where gateway_reference is not null;

-- PRINTER_CONFIG  (per shop, managed by Electron app)
create table printer_config (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null references shops(id) on delete cascade,
  printer_name       text not null,
  is_default         boolean default false,
  last_status        text,                                -- 'online'|'offline'|'error'
  updated_at         timestamptz default now()
);
create index on printer_config (shop_id);

-- NOTIFICATIONS  (architecture ready; delivery later)
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  job_id       uuid references print_jobs(id) on delete cascade,
  type         text not null,                             -- 'payment_success','approved',...
  channel      text not null default 'push',              -- 'push'|'email'
  payload      jsonb,
  read_at      timestamptz,
  created_at   timestamptz default now()
);
create index on notifications (user_id, read_at);

-- AUDIT_LOGS  (every major action)
create table audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references users(id),
  job_id       uuid references print_jobs(id),
  action       text not null,                             -- 'payment_success','approve','print_start',...
  from_status  job_status,
  to_status    job_status,
  metadata     jsonb,
  created_at   timestamptz default now()
);
create index on audit_logs (job_id, created_at);
```

Notes:
- `document` (jsonb) is the source of truth for the editor; `job_files`/`job_pages` support querying, thumbnails, and integrity. We keep them in sync in the server action that saves a job.
- `order_number` doubles as the **pickup token** — one human-readable code the student shows at the counter.

---

## 6. Storage & security

**Buckets (all private):**
```
originals/   users/{userId}/jobs/{jobId}/original/{fileId}.{ext}
finals/      users/{userId}/jobs/{jobId}/final/final.pdf
previews/    users/{userId}/jobs/{jobId}/previews/{pageId}.webp
```
- **Private buckets only.** All access via **short-lived signed URLs** minted server-side after an RBAC check.
- Student can read their own job's files; shop owner can read files for jobs at their shop with `status >= shop_received`. Enforced in the API layer (service role) — RLS policies as defense-in-depth.
- **Upload security:** allowlist MIME (`application/pdf`, `image/jpeg|png|webp`) + magic-byte sniff server-side, size limit (e.g. 25 MB/file, 100 MB/job), per-user rate limit on upload + job-create.
- **RBAC:** two roles; middleware asserts role on every server action and API route. Electron gets a **scoped shop token** (not the student session) and never talks to Supabase directly.

---

## 7. API / server-action surface

Next.js server actions for student flows; REST route handlers for machine/Electron + gateway callbacks.

**Student (server actions, session-authed):**
- `createDraftJob()` → job in `draft`
- `uploadFiles(jobId, files[])` → validates, stores originals, extracts pdf page counts, creates `job_files`
- `saveDocument(jobId, JobDocument)` → persists geometry, re-derives `job_pages` + metadata, status→`configured`
- `generatePreviews(jobId)` → thumbnails per page
- `quoteJob(jobId)` → runs pricing engine, returns price (no state change)
- `createPayment(jobId)` → snapshot price, status→`payment_pending`, returns gateway init params
- `listMyJobs()`, `getJob(jobId)`, `duplicateJob(jobId)` (clones document → new `draft`)

**Payment (route handler, gateway → us):**
- `POST /api/payments/callback` → **verify signature**, mark `payments.success`, job→`paid`, `is_locked=true`, generate `final.pdf`, job→`shop_received`, audit + notification.

**Shop / Electron (route handlers, shop-token authed):**
- `POST /api/shop/auth` → shop owner login → scoped token
- `GET  /api/shop/jobs?status=` → paid queue (server enforces `>= shop_received`)
- `GET  /api/shop/jobs/:id/final-url` → signed URL for `final.pdf`
- `POST /api/shop/jobs/:id/approve` | `/reject`
- `POST /api/shop/jobs/:id/status` → `printing|printed|ready_for_pickup|completed`
- `POST /api/shop/printers` → register/update `printer_config`

**PaymentProvider interface (your gateway plugs in here):**
```ts
interface PaymentProvider {
  name: string;
  createPayment(input: { jobId: string; amount: number; currency: string; }):
    Promise<{ paymentReference: string; redirectOrParams: unknown }>;
  verifyCallback(req: Request):
    Promise<{ ok: boolean; jobId: string; gatewayReference: string; status: 'success'|'failed'; raw: unknown }>;
}
```
MVP ships one impl: `CustomGatewayProvider` (your owned gateway). Nothing else in the codebase knows about the gateway.

---

## 8. Repo structure (monorepo)

```
print-project1/
├─ apps/
│  ├─ web/                     # Next.js 15 PWA (student + shop web dashboard)
│  │  ├─ app/
│  │  │  ├─ (auth)/login, register
│  │  │  ├─ (student)/dashboard, jobs/new, jobs/[id], jobs, drafts, profile
│  │  │  ├─ (shop)/shop/orders, shop/orders/[id]          # web mirror of shop views
│  │  │  └─ api/payments/callback, api/shop/*
│  │  ├─ components/           # shadcn/ui + app components
│  │  ├─ lib/                  # auth, supabase, pricing, pdf, payments
│  │  ├─ public/manifest.json, sw.js
│  │  └─ ...
│  └─ desktop/                 # Electron shop printing app
│     ├─ src/main/             # main process: printers, IPC, API client
│     ├─ src/renderer/         # React UI (reuses shared components/tokens)
│     └─ src/preload/
├─ packages/
│  ├─ shared/                  # JobDocument/geometry, zod schemas, TS types, enums, api contracts
│  └─ ui/                      # design tokens + shared primitives (optional)
├─ supabase/
│  ├─ migrations/              # SQL from §5
│  └─ seed.sql
└─ docs/
   └─ ARCHITECTURE.md          # this file
```
`packages/shared` is the contract both apps import — types, zod validators, the `JobDocument` model, status enums. Single source of truth prevents drift between web and Electron.

---

## 9. Design system (per strict UI rules)

**Tokens**
```
--bg:        #FFFFFF
--surface:   #F9FAFB (gray-50)   --surface-2: #F3F4F6 (gray-100)
--text:      #111827 (gray-900)  --text-muted: #374151 (gray-700)
--border:    #E5E7EB (gray-200)
--accent:    #0F5132  (deep green)   --accent-fg: #FFFFFF   --accent-weak: #E7F0EC
--danger:    #B42318  (used only for destructive/reject)
```
- One accent (deep green), used for primary actions and "ready/done" states. No gradients, no glass, no glow, no floating shapes.
- 8px spacing scale. Hierarchy from size/weight/spacing, not color. System/Inter font, restrained sizes.
- shadcn/ui as the primitive layer, restyled to these tokens. Cards: 1px border, minimal shadow. Buttons: solid, slightly rounded. Motion: fade + subtle hover, 150–250ms only.

**Status colors** (functional, muted): pending=gray, printing=amber-700, ready/completed=deep green, rejected=danger. Text label always accompanies the color (a11y).

---

## 10. Key screens (low-fi) + component hierarchy

**Student — New Job (mobile)**
```
┌───────────────────────────┐
│ ‹ New print job           │
│                           │
│  [ + Upload files ]       │  ← dropzone; PDF/JPG/PNG/WEBP
│  file1.pdf  12p        ⋮  │
│  photo.png   1p        ⋮  │
│                           │
│  [ Arrange pages → ]      │  ← opens editor
│                           │
│  Settings                 │
│  Paper  (A4) A3           │
│  Copies  [– 1 +]          │
│  Orient  (Portrait) Land  │
│  Color   per-page in editor│
│  Binding (None) Staple Spiral│
│                           │
│  Estimated  ₹48           │
│  [ Continue to payment ]  │
└───────────────────────────┘
```

**Editor (Canva-like, mobile-first, full scope)**
```
┌───────────────────────────┐
│ ‹ Arrange   [Preview] [Done]│
│ ┌───┐ ┌───┐ ┌───┐ ┌───┐   │  ← page thumbnails grid, drag to reorder
│ │ 1 │ │ 2 │ │ 3 │ │ + │   │
│ └───┘ └───┘ └───┘ └───┘   │
│ selected page 2:          │
│ [rotate] [dup] [delete]   │
│ color: (bw) color         │
│ [ insert image ]          │
└───────────────────────────┘
```

**Shop / Electron — Orders queue**
```
┌──────────────────────────────────────────┐
│ PrintFlow Shop     printer: HP-1020 ●online│
│ [New] Approved Printing Ready Completed    │
│ ┌────────────────────────────────────────┐│
│ │ PF-2C7K9  Rahul S.  14p ×2  ₹96        ││
│ │ paid • ref TXN8821 • 2:14pm            ││
│ │ [Preview PDF] [Approve] [Reject]        ││
│ └────────────────────────────────────────┘│
└──────────────────────────────────────────┘
```
After approve → **[Print]** (sends `final.pdf` to selected printer) → auto status `printing` → `printed` → **[Mark ready]** → student notified with token `PF-2C7K9`.

**Component tree (web, abridged)**
```
AppShell
├─ BottomNav (student) / TopNav (shop)
├─ JobWizard
│  ├─ FileUploader → FileList
│  ├─ PageEditor → PageGrid → PageCard(dnd) → PageToolbar
│  ├─ JobSettingsForm (RHF+zod)
│  └─ PriceSummary → PayButton
├─ JobList → JobCard → StatusBadge
└─ ShopBoard → OrderColumn → OrderCard → OrderActions
```

---

## 11. Roadmap (mapped to your 8 phases)

| Phase | Deliverable | Exit criteria |
|-------|-------------|---------------|
| 1 | Monorepo + Next.js PWA + Supabase + Auth.js (email/pw + Google) + users/roles/RLS + migrations | Can register/login as student & shop_owner; RBAC enforced |
| 2 | Upload + storage + job create (draft→configured) + `job_files` | Upload validated files, see them listed, job saved |
| 3 | Page-arrangement editor + preview thumbnails (shared geometry) | Reorder/rotate/delete/dup/insert; preview == final layout |
| 4 | Server PDF pipeline → `final.pdf` (source of truth) | Generated PDF matches editor for 20 real docs |
| 5 | Pricing engine (config-driven from `shop_settings`) | Quote before pay; matches settings |
| 6 | PaymentProvider layer + your gateway + callback → PAID→SHOP_RECEIVED | Paid job appears in shop; unpaid never does |
| 7 | Shop dashboard (web) — queue, approve/reject, status, pickup token | Full lifecycle to COMPLETED via web |
| 8 | Electron app — printers, download/preview/print `final.pdf`, status | One-click print on Windows; status syncs |

Cross-cutting (throughout): audit logs, notifications scaffold, PWA (manifest + service worker + installable + offline shell).

---

## 12. Deployment plan

- **Web:** Vercel (Next.js 15). Env: Supabase URL/anon/service keys, Auth.js secret + Google OAuth, gateway keys, signed-URL TTL.
- **DB/Storage:** Supabase project; run `supabase/migrations`; private buckets; RLS enabled.
- **Realtime:** Supabase Realtime channel per shop for the orders queue (web + Electron subscribe).
- **Electron:** Windows installer (electron-builder, NSIS). Auto-update later. Talks only to the web API with a scoped shop token.
- **Secrets:** service-role key server-only; Electron holds only its shop token; gateway secret only on the callback route.

---

## 13. Open risks & how we mitigate

1. **PDF fidelity** → shared geometry model (§4); Phase 4 gated on a 20-doc comparison before moving on.
2. **Shop adoption** → keep Electron trivial; ship a **web** shop dashboard (Phase 7) first so a shop can start with zero install, add Electron for one-click printing.
3. **Full editor cost** → build on the geometry model so preview and final never diverge; ship editor behind the same save contract so we can degrade gracefully if needed.
4. **Payments** → single verified server-side callback path; client never sets PAID.

---

## Approve / adjust

If this looks right, I'll start **Phase 1**: scaffold the monorepo, Next.js PWA, Supabase project + migrations, and Auth.js with the two roles. Call out anything to change first — the schema and the geometry model are the two things most expensive to change later, so scrutinize those.
```
