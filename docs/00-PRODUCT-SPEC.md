# PrintPass — Product Specification (Full Ecosystem)

> Status: **approved direction, pre-implementation** for everything beyond the current MVP.
> Current codebase = MVP "PrintFlow" (see [03-CODEBASE.md](03-CODEBASE.md)). This document is the
> target product. [01-ARCHITECTURE.md](01-ARCHITECTURE.md) is the technical translation;
> [02-ROADMAP.md](02-ROADMAP.md) is the delivery plan.

---

## 0. The one-line product definition

**PrintPass is not an online printing service. It is a digital operating system for stationery,
Xerox, and print shops** — printing is one module inside it. The shop owner controls their own
business rules (pricing, catalog, pickup/delivery, hours); PrintPass provides the infrastructure.

**North-star loop:**

```
Student discovers/scans shop → orders (print + stationery + services)
  → pays → shop instantly receives paid order → prints/fulfills
  → customer picks up or gets delivery → revenue + referral commission recorded
```

### Non-negotiable principles (from the founding discussion)

1. **Paid-first.** The shop never sees an unpaid job as printable. Payment verification is
   server-side only.
2. **Shop sovereignty.** The platform does not dictate prices, catalog, or delivery. Every shop
   configures its own commercial rules; the platform only charges its own platform fee.
3. **Cloud normalizes, Windows decides.** The backend says *"print this group A4/grayscale/duplex/
   2 copies"*; the Windows agent maps that to whatever printer/driver is actually on that PC.
4. **Config, not code.** Every price, fee, referral %, subscription plan, and limit is a database
   row the admin can change — never a hardcoded number.
5. **Snapshot money.** Once an order exists, its prices are snapshotted. Later pricing changes
   never rewrite financial history (immutable ledger).
6. **Zero platform margin initially.** Per-transaction profit goes to referrers; the platform's
   revenue is the shop subscription.

---

## 1. The four systems

```
                        PRINTPASS PLATFORM
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
   CUSTOMER APP          SHOP ECOSYSTEM           ADMIN PANEL
   (mobile-first PWA)    (web dashboard +          (control center)
        │                 Windows Shop Agent)          │
        │                     │                       │
        └─────────────── BACKEND + DB + STORAGE + QUEUE ──┘
                              │
                   WINDOWS SHOP AGENT (native)
                              │
                    Windows print subsystem
                              │
                          PRINTERS
```

| System | Who | Platform | Purpose |
|---|---|---|---|
| Customer App | Students / walk-in customers | Mobile PWA (+ later native wrapper) | Discover shop, order, configure print, pay, track, refer |
| Shop Panel | Shop owner + staff | Web dashboard (any browser) | Catalog, orders, printing, pricing, inventory, staff, delivery, analytics |
| Windows Shop Agent | Shop PC | Electron (Windows) | Printer detection, one-click printing, status reporting. Later: scanners, POS, receipt printers |
| Admin Panel | Platform team | Web | Users, shops, subscriptions, pricing, referrals, finance, moderation |

---

## 2. User roles (RBAC)

```
SUPER_ADMIN  — everything, including admin management
ADMIN        — platform operations (shops, users, finance, refunds, configs)
SUPPORT      — read-mostly + dispute/refund handling
SHOP_OWNER   — full control of one shop (business profile, pricing, staff, money)
SHOP_MANAGER — everything except subscription/billing and staff management
SHOP_OPERATOR— orders + printing + fulfillment only
SHOP_DELIVERY— delivery tasks only
CUSTOMER     — own orders, wallet, referrals
```

Hard rules:
- Customer can touch **only their own** orders/documents/payments/referrals.
- Shop roles are scoped to **their shop only** (all queries filtered by `shop_id`).
- The shop-visible order threshold is enforced **structurally** (status gate), not by UI hiding.
- The Windows agent authenticates with a **scoped shop token** — never a user session, and it
  never talks to the database directly.

---

## 3. Customer side

### 3.1 Entry points

1. Direct website/app
2. **Shop QR code** (fastest, primary flow) — `printpass.app/s/{shopCode}` auto-selects the shop
3. Shop-specific link (shared on WhatsApp, etc.)
4. Referral link (attaches referrer at signup)
5. Nearby-shops marketplace (later phase)

### 3.2 Customer dashboard

```
┌──────────────────────────────┐
│ PrintPass                    │
│ [ + New Order ]              │
│                              │
│ Recent Orders                │
│ #PP10452  Printing           │
│ #PP10451  Ready — token 4-2-1│
│ #PP10448  Completed          │
│                              │
│ Wallet ₹87   Referrals       │
│ Nearby Shops (later)         │
│ Profile                      │
└──────────────────────────────┘
```

### 3.3 The Order is the core object

A print job is **one item inside an order**. The customer mixes freely:

```
ORDER #PP10452 — ABC Stationery
├─ A4 B&W printing · 12 pages          ₹12
├─ Spiral binding × 1                  ₹40
├─ Notebook (A4, 200pg, hardcover) × 2  ₹60
└─ Blue pen × 3                         ₹15
Subtotal ₹127 · Delivery ₹20 · Total ₹147
```

Order fulfillment mode depends entirely on the shop's configuration:
- **Pickup** — order ready → customer collects with pickup token
- **Delivery** — shop-configured radius, fee, minimum order, free-above threshold; delivered by
  shop staff (or later a courier integration)
- **Both** — customer chooses at checkout

The shopkeeper can disable delivery entirely; PrintPass never forces a fulfillment model.

### 3.4 Print configuration (the differentiator)

- Multi-file upload (PDF/JPG/PNG/WEBP)
- Canva-like page editor: reorder, rotate, duplicate, delete, insert image, per-page **color**
- Global settings: paper size, orientation, copies, duplex (per group), quality, pages-per-sheet,
  scaling, margins
- **Per-page and per-group settings**: one job can contain
  - Group A: 8 pages — A4 / B&W / duplex / 2 copies
  - Group B: 3 pages — A4 / color / simplex / 1 copy
  - Group C: 2 pages — A3 / B&W / simplex / 1 copy
- Live price preview before payment
- Print-ready compilation happens server-side; identical-setting pages are grouped automatically

### 3.5 Checkout

- Price breakdown lines (pages × rate, add-ons, platform fee, delivery)
- Wallet credits applicable (referral earnings, promo, refunds — admin decides usability)
- Payment via the platform gateway → webhook → verified server-side → order becomes visible to shop

### 3.6 Referrals (customer → customer)

- Every customer gets a code (e.g. `ARYA123`) + share link
- Referred customer transacts → referrer earns a configurable reward (e.g. ₹1 of the ₹2 platform
  fee) credited to their **referral wallet**
- Wallet has earning/withdrawal rules (min withdrawal, validity) configured by admin
- Every referral event writes an **immutable ledger row**

---

## 4. Shop ecosystem

### 4.1 Onboarding

```
Create shop → business profile → choose category → pick plan → trial
  → build catalog → configure pricing → connect Windows agent → go live
```

- Profile: name, logo, cover, description, address, phone, WhatsApp, hours, weekly holidays,
  Google Maps location
- Category: Stationery / Xerox / Cyber Cafe / Photo Studio / College Store / Other
- Shop identity: unique **shop code** (`PP-ARYA-001`), short URL (`printpass.app/abcstationery`),
  printable QR

### 4.2 Catalog builder (products + services)

Three top-level catalogs the owner manages:

| Catalog | Examples | Notes |
|---|---|---|
| **Printing** | A4 B&W, A4 color, A3, photo/glossy, duplex, binding, lamination | Price per page/sheet; maps to the print engine |
| **Stationery** | Pens, notebooks, files, folders, paper, markers, staplers | Stock-tracked products |
| **Services** | Scanning, photocopy, spiral binding, lamination, resume typing, formatting | Flat or per-unit price |

Each item: name, description, image, price, unit, category, availability toggle, stock, min/max
qty, and a **variant/option config** (e.g. Notebook: size A4/A5, pages 100/200, cover soft/hard;
A4 printing: color, paper quality, sides, copies). The catalog is a configuration engine, not a
static list.

### 4.3 Pricing

- **The shop sets its own prices.** Shop A: A4 B&W ₹1/page. Shop B: ₹2/page. Both valid.
- Platform fee (₹1–2/transaction) is separate and platform-owned.
- Admin can define global *defaults* and optional caps/floors per region; shops override within
  permitted limits (configurable — can be unlimited).
- Print pricing keys off the group spec: paper size × color × sides × quality, plus add-ons
  (binding, lamination, photo paper) and scanning as separate services.

### 4.4 Order dashboard (operational, not complicated)

```
┌──────────────────────────────────────────────┐
│ ABC Stationery        12 new · 4 printing    │
│──────────────────────────────────────────────│
│ NEW                                          │
│ #10452 ₹147  print+stationery  DELIVERY [✔]  │
│ #10451 ₹80   print only        PICKUP   [✔]  │
│ ACCEPTED → PREPARING → READY → OUT/READY →   │
│ COMPLETED                                    │
└──────────────────────────────────────────────┘
```

- Real-time new-order alerts (WebSocket push — no refresh)
- One order screen handles print + stationery + services together
- Print orders show the **group spec** and a single **[PRINT]** button

### 4.5 Printing flow

```
[PRINT] → agent picks printer (or owner selects) → agent maps groups →
Windows spooler → driver → printer → status: PRINTING → PRINTED → READY
```

- Multiple printers per shop, each shown online/offline
- Owner does **select printer → print**; everything else is pre-attached to the job
- Print history + failed-print reasons logged per job

### 4.6 Inventory

- Stock per product; auto-deduction on completed orders
- Low-stock threshold alerts (in-app now; WhatsApp/SMS later)
- Out-of-stock items auto-hide from customer catalog

### 4.7 Staff

- Owner invites staff by phone; roles per §2
- Permission matrix enforced server-side per action
- Later: per-staff order/print attribution for analytics

### 4.8 Shop analytics

- Today: orders, revenue, pages printed, average order value
- Popular services (share %), peak-hours histogram
- Print vs stationery vs services revenue split
- Export later (CSV/Excel)

### 4.9 Shop subscription

- Plans are admin-configured rows (Starter ₹99, Pro ₹199, etc. — price/features are data)
- Feature gates (catalog size, staff count, printer count, inventory, advanced delivery,
  analytics depth) are flags on the plan, checked server-side
- Billing history, invoices, payment method management
- Trial period and coupons configurable by admin

### 4.10 Shop referrals (shop → shop)

- Owner A refers owner B → B subscribes → A earns a configurable % (e.g. 20%) of the
  subscription, recurring or first-N-months (admin-configured), into A's wallet
- Dashboard: shops referred, active subscriptions, monthly + lifetime commission

---

## 5. Admin panel (control center)

Admin configures the platform; developers deploy features, not prices.

### 5.1 Dashboard

Revenue, transactions, active shops, active users, jobs today, pages printed, pending issues,
failed jobs, refund requests.

### 5.2 Management surfaces

| Area | Capabilities |
|---|---|
| Users | Search, view, suspend/ban/restore, disputes, impersonate-with-audit (later) |
| Shops | Approve/reject/verify/suspend, edit profile, view revenue/orders/printers/devices, force-disconnect agent |
| Subscriptions | Plans CRUD, price/billing cycle, feature flags, limits, trials, coupons, comping |
| Pricing | Global defaults, platform fee, referral rules, per-region caps, pricing effective dates |
| Referrals | Customer reward ₹, shop commission %, min withdrawal, validity, payout caps, fraud review |
| Finance | Transaction ledger, settlement runs, shop payouts, refunds, gateway reconciliation, tax/GST reports |
| Moderation | Reported content, document abuse flags, banned-material workflow |
| System | Feature flags, maintenance mode, notification templates, agent release channels, audit log viewer |

### 5.3 Referral configuration (illustrative defaults — all editable)

```
Customer platform fee:        ₹2 / transaction
Customer referral reward:     ₹1 (platform keeps ₹1)
Shop referral commission:     20% of subscription
Minimum wallet withdrawal:    ₹100
Referral validity:            lifetime (configurable)
Max payout:                   unlimited (configurable)
```

---

## 6. Business model

```
REVENUE
├─ Shop subscriptions (primary; ₹99–₹199+/month, admin-configured plans)
└─ Platform fee on customer transactions (₹1–2; initially passed to referrers)

COST
└─ Gateway fees, infra, support (per-transaction cost exists regardless of order size)

GROWTH ENGINE
├─ Customer referrals: reward = platform fee share (drives adoption in colleges)
└─ Shop referrals: % of subscription (drives shop acquisition at zero CAC upfront)
```

- Phase-1 posture: **zero platform margin** — per-transaction profit is fully redirected to the
  referrer; revenue comes from subscriptions.
- Every money movement is a ledger row: `gross → platform_fee → shop_amount → referral_amount →
  gateway_fee → tax`.

---

## 7. Notifications matrix

| Event | Customer | Shop | Admin |
|---|---|---|---|
| Order created / paid | ✓ (receipt) | ✓ (new order alert, real-time) | — |
| Order accepted | ✓ | — | — |
| Printing started / printed | ✓ | — | — |
| Ready for pickup / out for delivery | ✓ (+token) | — | — |
| Completed | ✓ | — | — |
| Printer offline / print failed | — | ✓ | ✓ (if repeated) |
| Low inventory | — | ✓ | — |
| Subscription expiring / payment failed | — | ✓ | ✓ |
| New shop signup | — | — | ✓ |
| Refund/fraud alert | ✓ | — | ✓ |

Channels: in-app + PWA push (v1), then WhatsApp, email, SMS (configurable per event).

---

## 8. Screens (complete inventory)

**Customer (mobile-first):** Splash/landing · Login/Register (+referral capture) · Nearby shops ·
Shop page (catalog) · Product/configure sheet · Print editor (upload → arrange → settings →
groups) · Cart/checkout (pickup/delivery, address, wallet, pay) · Order tracking · Orders list ·
Wallet · Referrals (code, earnings, withdraw) · Profile/addresses · Notifications.

**Shop (web dashboard):** Onboarding wizard · Dashboard (today) · Orders board (new/accepted/
preparing/ready/out/completed) · Order detail (print spec + PRINT) · Printers + agent status ·
Catalog manager (3 catalogs + options) · Inventory · Pricing editor · Delivery settings · Staff
management · QR/studio (printable QR, posters) · Referrals · Subscription & billing · Analytics ·
Settings.

**Windows agent:** Login (device pairing) · Printer picker + health · Order queue (paid only) ·
One-click print w/ group progress · Print history/errors · Settings (auto-start, default printer,
offline buffer).

**Admin:** Dashboard · Users · Shops · Subscriptions/plans · Pricing config · Referral config ·
Finance (ledger, payouts, refunds) · Moderation · Notifications/templates · Feature flags ·
Audit logs · Admin management.

---

## 9. What is deliberately OUT of scope (v1)

- Marketplace discovery between colleges (start with QR/link-driven single-shop flow)
- Third-party courier API integrations (shop-managed delivery only in v1)
- Native iOS/Android apps (PWA first)
- Customer-side document editing beyond the page editor (no content redesign tools)
- Multi-currency, multi-country (INR only at launch)
- Hardware beyond printers via the agent (scanners/POS/receipt printers → later phases)
