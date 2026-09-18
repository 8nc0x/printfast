# PrintPass — Delivery Roadmap

> Phased plan turning the current MVP ([03-CODEBASE.md](03-CODEBASE.md)) into the full ecosystem
> ([00-PRODUCT-SPEC.md](00-PRODUCT-SPEC.md), [01-ARCHITECTURE.md](01-ARCHITECTURE.md)).
> Stack: Next.js App Router + NextAuth + PostgreSQL/Prisma + PM2 (strict) + shadcn/ui + PayXmint.

**Status legend:** ✅ done (in MVP) · 🔨 build next · 🧭 later.

---

## Phase 0 — Foundation migration (MVP → target stack)

**Goal:** move the working MVP from Supabase/raw SQL onto the locked stack without losing
behavior. Nothing new for users yet.

- [ ] Stand up Prisma + PostgreSQL; author `schema.prisma` covering the **current MVP tables**
      (users, shops, shop_settings, print_jobs, job_files, job_pages, payments, printer_config,
      notifications, audit_logs) with data migrated from Supabase.
- [ ] Replace Supabase Storage with local-disk storage layer behind the same lib interface
      (`lib/storage`): save/read/stream + signed short-TTL URLs.
- [ ] Replace Supabase auth with NextAuth v5 credentials+Google (already NextAuth — swap data
      source to Prisma; keep `student`/`shop_owner` roles mapped to new `Role` enum).
- [ ] Rewrite `/api/shop/*` + payment callback route handlers against Prisma.
- [ ] PM2 (strict): `ecosystem.config.js` with `web` only; pm2 startup + logrotate; Nginx config.
- [ ] shadcn/ui audit — the MVP already uses it; consolidate tokens per design system.
- [ ] CI: typecheck + lint + build green.

**Exit:** feature-parity demo — upload → editor → pay (sandbox) → shop approve → print via
Electron, all on Postgres/Prisma/PM2.

## Phase 1 — PayXmint integration

- [ ] `PayxmintProvider implements PaymentProvider` (create-intent with Idempotency-Key,
      check-status, webhook verify).
- [ ] Custom checkout UI: mobile UPI deep links (upi_links), desktop QR (qr_data + qrcode.react),
      3.5s polling of our `/api/payments/status` proxy.
- [ ] Webhook route: raw-body HMAC verify, idempotent fulfillment (unique `utr`, status guard),
      200-always.
- [ ] `worker-payments` reconcile sweep for missed webhooks; EXPIRED handling.
- [ ] Keep `/dev/pay` sandbox wired to PayXmint simulator (`/api/v1/simulate-payment`).

**Exit:** ₹1 test payment end-to-end on staging with webhook + reconcile both paths proven;
duplicate webhook replayed → no double fulfillment.

## Phase 2 — Orders become the core object

- [ ] Full Prisma schema (Orders, OrderItems, CatalogItem, PricingRule, ShopDelivery, OrderEvent,
      LedgerEntry, Wallets, ReferralEvent, Subscription*).
- [ ] Order state machine (shared enums + `canTransition`) replacing job-only flow; OrderEvent
      timeline UI.
- [ ] Catalog builder (3 catalogs: printing / stationery / services) + options engine.
- [ ] Checkout: mixed cart (print + products + services), pickup vs delivery (shop config
      honored), wallet application step.
- [ ] Shop order board: unified NEW → ACCEPTED → PREPARING → READY → OUT/READY → COMPLETED, with
      print groups surfaced inside the order.

**Exit:** an order containing 1 print job + 2 notebooks + lamination completes the whole
lifecycle with delivery fee rules applied.

## Phase 3 — Money integrity (ledger + wallets + referrals)

- [ ] Immutable `LedgerEntry` (insert-only) wired into every settlement; daily export job.
- [ ] Wallets (REFERRAL/EARNINGS/PROMO/REFUND) + `WalletTxn` running balance; withdrawal requests
      with min-withdrawal config.
- [ ] Referral system: codes, `?ref=` capture at signup, customer reward credited on first
      eligible transaction, shop-referral % on subscription payments; referral dashboards both
      sides.
- [ ] `PlatformConfig` admin screen (platform fee, referral reward, commission %, validity).
- [ ] Pricing snapshot audit: verify old orders unaffected after changing rules.

**Exit:** double-entry check — sum of ledger per order equals gateway amount; referral money
lands and withdraws correctly.

## Phase 4 — Shop subscription + admin control center

- [ ] SubscriptionPlan CRUD (admin), trial, feature gates checked server-side, dunning cron.
- [ ] Shop onboarding wizard (profile → category → plan → trial → go-live), admin
      approve/verify/suspend flows.
- [ ] Admin dashboard: metrics, users, shops, plans, pricing, referrals, audit viewer.
- [ ] Invoices (PDF generation + numbering).
- [ ] RBAC rollout for full role set (SUPPORT, SHOP_MANAGER, SHOP_OPERATOR, SHOP_DELIVERY).

**Exit:** new shop self-serves onboarding on a trial; admin can suspend a shop and every gate
actually closes.

## Phase 5 — Print engine v2 (groups, per-page settings, Windows agent protocol)

- [ ] Extend shared geometry model to per-page/per-group settings (paper, color, sides, copies,
      quality); groups compiled server-side.
- [ ] `worker-docs` + Postgres queue (SKIP LOCKED) → final.pdf per group, retries, poison
      handling.
- [ ] Agent protocol v1 in `packages/shared`: pairing → scoped token → claim → signed file
      download → print-events → heartbeat (printer caps).
- [ ] Electron agent upgrade: multi-printer, capability probe, per-group driver mapping
      (duplex/grayscale/tray), failed-print reasons, auto-update.
- [ ] Printers panel (online/offline from heartbeats) + admin force-disconnect.

**Exit:** mixed job (B&W duplex 2 copies + color simplex + A3) prints correctly on two different
printer models with correct status flow; agent revocation blocks instantly.

## Phase 6 — Realtime + notifications

- [ ] SSE `/api/events` backed by Postgres LISTEN/NOTIFY; shop board instant new-order alert;
      customer order tracking live.
- [ ] `worker-notify` with channel adapters: in-app (done) → PWA push → email → WhatsApp.
- [ ] Notification matrix from spec implemented + admin template editor.

**Exit:** payment success → shop hears the new-order alert without refresh; student gets "ready +
token" push.

## Phase 7 — Shop growth tools

- [ ] QR studio (printable QR/poster PDFs), shop deep links, referral share sheets.
- [ ] Inventory: stock tracking, auto-deduct on completion, low-stock alerts, out-of-stock
      auto-hide.
- [ ] Shop analytics: today/revenue/pages, popular services, peak hours; staff attribution.
- [ ] Staff management UI + permission matrix enforcement.

**Exit:** shop owner runs a full day (orders, stock, staff shift, analytics) entirely in the
panel.

## Phase 8 — Hardening + launch

- [ ] Rate limits everywhere (auth/upload/payment/referral), audit completeness review, Pen-test
      pass on money paths.
- [ ] Retention/cleanup crons, backup/restore drill (pg_dump + storage + ledger export).
- [ ] Observability: /api/health, queue-depth alerting, pm2-logrotate, error tracking.
- [ ] Load test: payment webhook burst + compile queue burst.
- [ ] Play Store/Meta PWA readiness, onboarding docs for shops (1-pager + video).
- [ ] Pilot: 3–5 shops near campus, referral engine on, zero-margin fee posture.

**Exit:** pilot shops run daily for 2 weeks with <1% failed prints and no money-path incidents.

---

## 🧭 Later (tracked, not scheduled)

- Marketplace discovery (nearby shops) · native mobile wrappers · third-party courier integrations
  · scanner/POS/receipt hardware via agent v2 · GST reporting exports · multi-region deployment
  with Redis pub/sub · Hindi/local-language UI.

---

## Risk register (top 5)

| Risk | Mitigation |
|---|---|
| Webhook/payments correctness | Provider interface + idempotency tests + reconcile worker + ledger double-entry checks in CI |
| Print fidelity drift | Shared geometry model (already proven in MVP); phase 5 gated on multi-driver matrix test |
| Shop adoption | Web dashboard-first (zero install), agent only adds one-click printing; trial plans |
| Single-server SPOF under PM2 | Nightly backups + restore drill; health checks; design keeps Redis/pubsub swap-in path open |
| Referral abuse | One-referrer-forever rule, admin fraud review, payout caps/validity configurable, ledger audit |
