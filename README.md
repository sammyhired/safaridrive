# SafariDrive — Two-Sided Car Rental Platform

**Book. Pay. Drive.** A production-grade car rental marketplace for Kenya (and beyond): customers find and book cars in minutes, pay with M-Pesa or card, choose pickup / doorstep delivery / chauffeur — and track their vehicle live on a map. Owners, yards, drivers and platform admins run the whole business from one dashboard.

Built entirely on **open-source tools** — no Google Maps bills, no proprietary GPS vendor lock-in.

---

## Highlights

### Customer experience
- Search by location, category (Economy, Sedan, SUV, 4x4, Van, Luxury, Executive), price, transmission, seats
- Rental-yard map with addresses, opening hours and live availability counts
- **Three ways to get the car**:
  1. **Pickup** at a yard — no delivery fee
  2. **Delivery to your address** — distance-based fee (base + per-km, haversine-calculated)
  3. **Chauffeur** — car + professional driver at a daily rate
- **Automatic price calculator** — rental × days + delivery fee + chauffeur + extras − promo, with a full line-item breakdown; totals are always recomputed server-side (the client is never trusted)
- Extras (comprehensive insurance, child seat, additional driver, airport meet & greet), promo codes
- **M-Pesa STK Push** (Safaricom Daraja adapter with a mock/sandbox mode for demos) and card payments with Luhn validation
- Digital receipts, booking lifecycle with status badges, free cancellation policy (free ≥ 48h before start, 20% fee inside)
- **Live GPS tracking** during delivery and rental — Leaflet + OpenStreetMap map, live marker with heading, speed, ETA and distance remaining
- Two-way reviews and ratings

### Owner / business side
- Fleet management (add/edit vehicles, availability & maintenance states, per-vehicle utilisation)
- Booking inbox with role-guarded actions: accept / reject (with refund), dispatch (starts live tracking), mark picked-up / delivered / returned / complete
- Driver roster with ratings, daily rates and availability
- Expense tracking (fuel, service, insurance, repairs) and net-revenue analytics
- Revenue vs expenses charts, top-vehicles leaderboard, 6-month history

### Driver side
- Today's assignments, active job card with customer + vehicle + addresses
- One-tap status transitions (start / deliver / return) that drive the customer's live map
- Earnings summary and trip history

### Admin control centre
- Platform KPIs: users, fleet, active rentals, revenue, 10% commission take
- Revenue & bookings charts, bookings-by-status distribution
- User management (suspend / activate), promo-code CRUD

---

## Open-source stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS 4, shadcn/ui, lucide-react, Recharts, Framer Motion |
| Database | SQLite + Prisma ORM |
| Maps | **Leaflet + OpenStreetMap tiles** (zero-cost alternative to Google Maps) |
| Realtime | Socket.io (dedicated tracking microservice) |
| GPS ingest | **OSMAND-protocol compatible** (works with Traccar-compatible devices/apps such as GPSLogger — no proprietary tracker vendor required) |
| Payments | Safaricom **M-Pesa Daraja** adapter (official API; pluggable mock mode) + card |
| Auth | HMAC-signed httpOnly cookie sessions (node:crypto scrypt hashing) |
| State | TanStack Query + Zustand |

### Why this matters for Kenya ops
The proposal research priced proprietary GPS at KSh 8,500–12,500 per device plus monthly subscriptions, and Google Maps at $100–275/month. This build replaces both with open-source equivalents: any OSMAND/Traccar-compatible tracker can feed the ingest endpoint, and Leaflet/OSM maps are free — leaving M-Pesa Daraja (free to integrate, pay-per-transaction) as the only unavoidable external service.

---

## Architecture

```
Browser (single-page app at /)
  │  REST + socket.io (/?XTransformPort=3003 via gateway)
  ├────────────────────────────┐
  │                            │
Next.js app (port 3000)        Tracking service (port 3003)
  ├─ /api/* REST endpoints       ├─ socket.io live positions
  ├─ Prisma → SQLite             ├─ trip simulator (demo GPS)
  ├─ pricing engine              └─ OSMAND-compatible ingest
  ├─ M-Pesa Daraja adapter         GET /?id=..&lat=..&lon=..&speed=..&heading=..
  └─ auth (HMAC cookie)
```

- **Booking lifecycle**: `PENDING_PAYMENT → PAID → ACCEPTED → OUT_FOR_DELIVERY → ACTIVE → RETURNED → COMPLETED` (plus `REJECTED` / `CANCELLED` with refunds)
- Every state change emits notifications and (where relevant) starts/stops GPS trip simulation
- The tracking service is standalone (own package.json, hot-reload dev script) so it can be deployed/scaled independently, or replaced by a real Traccar server

## Repo layout

```
prisma/            schema + seed (demo users, yards, 16 vehicles, bookings, promos)
src/app/api/       REST endpoints (auth, vehicles, yards, quote, bookings,
                   payments, tracking, reviews, expenses, stats, users, promos)
src/components/    customer/ owner/ admin/ driver/ shared/ UI workspaces
src/lib/           types contract, pricing engine, M-Pesa adapter, auth, format helpers
android/           APK sources + build pipeline for the four side apps (see below)
mini-services/
  tracking-service/  socket.io GPS service + OSMAND ingest + simulator
docs/CONTRACTS.md    the full API + component contract used to build the app
```

---

## Android apps (APK) — one per side

Every side of the platform ships as an installable Android app. Each APK is a
lightweight (~40 KB) native shell around the SafariDrive web platform:

| App | Package | Opens |
|---|---|---|
| SafariDrive | `ke.co.safaridrive.customer` | Customer side (search / book / pay / track) |
| SafariDrive Owner | `ke.co.safaridrive.owner` | Owner & yard console |
| SafariDrive Driver | `ke.co.safaridrive.driver` | Driver / chauffeur console |
| SafariDrive Admin | `ke.co.safaridrive.admin` | Platform control centre |

On first launch each app asks for the **server address** of the SafariDrive
platform (kept in the device's localStorage), then deep-links straight into its
side via `/?app=<role>` and remembers it. If the server is unreachable the app
shows an offline screen with retry / change-server actions. Location permission
is requested on first use so the maps and "near me" features work inside the shell.

Signed APKs are distributed **free** through two channels:

1. **This site itself** — served at `/apk/` (e.g. `/apk/SafariDrive-Owner-v1.0.0.apk`).
   The header's **“Get app”** button opens a dialog with per-role download cards, a
   scannable **QR code** (so desktop users can beam the download to a phone), the
   server address to paste on first launch, and step-by-step install instructions.
   The footer also links all four APKs.
2. **GitHub Releases** — pushing a version tag (`git tag v1.0.0 && git push origin
   v1.0.0`) makes the `Android APKs` workflow build and publish all four APKs to
   [github.com/sammyhired/safaridrive/releases](https://github.com/sammyhired/safaridrive/releases).
   Anyone can install from there — no GitHub account, no fee. Direct-link pattern:
   `…/releases/latest/download/SafariDrive-Customer-v1.0.0.apk`.

> **Store comparison**: GitHub Releases and self-hosting are free forever. F-Droid
> / IzzyOnDroid are free open-source stores but impose review requirements (and a
> WebView shell pointed at a user-supplied server may not qualify). Google Play is
> **not free**: $25 one-time registration, new personal accounts need a 14-day
> closed test with 12 testers, and submissions must be AAB (not APK) — our
> `build.sh` pipeline would need an AAB target first.

### Installing on a phone
1. On the phone's browser, open the platform and tap **Get app** (header) or an
   APK link in the footer — or scan the QR code shown in the dialog from a
   desktop (also: GitHub Releases links above).
2. Allow "install unknown apps" for your browser when prompted — the APKs are
   self-signed.
3. Open the app, paste the server address shown in the dialog, done.

### Rebuilding from source
```bash
# once: Android SDK with build-tools 34 + platform 34
sdkmanager "build-tools;34.0.0" "platforms;android-34"

bash android/build.sh          # -> android/out/ + public/apk/
bash android/tools/gen-icons.mjs  # regenerate launcher/PWA icons (needs sharp)
```

The build needs no Gradle and no JDK — it drives `aapt2` / `d8` / `apksigner`
directly and falls back to the Eclipse compiler (ECJ) on a JRE-only machine.
CI does the same on `ubuntu-latest`.

### Release signing policy (important)

Signing keys are **never committed** to this repository — `android/keystore/`
is gitignored, and `build.sh` generates a fresh local keystore when one is
missing. That means:

- **CI artifacts are test-only**: each GitHub Actions run signs with an
  ephemeral key, so those APKs cannot upgrade one another. Fine for testing,
  never for distribution.
- **Releases are signed on the operator machine**: keep one private keystore
  (outside git) and sign there — `VERSION_CODE=2 VERSION_NAME=1.0.1 bash android/build.sh`.
  Losing that key means a new app listing; guard it like production credentials.
- Review `android:usesCleartextTraffic` (currently on so operators can point
  apps at `http://` LAN/staging servers — turn it off for production HTTPS).

---

## Security model

The platform is multi-sided (customers, owners, drivers, admins share one
backend), so every layer assumes the other side may be hostile:

| Layer | Controls |
|---|---|
| Sessions | HMAC-SHA256 `httpOnly` cookie with embedded expiry, `SameSite=Lax`, `secure` behind https; scrypt password hashing (timing-safe compares, and a dummy scrypt on unknown emails so login latency cannot enumerate accounts); single generic login failure; **epoch-bound tokens** — every cookie embeds the user's `sessionEpoch`, and admin suspend/reactivate bumps the epoch, revoking every live session for that user instantly (a reactivated user's old stolen cookies stay dead) |
| API surface | Every route authenticates and re-checks **object ownership** (booking/payment/tracking access limited to that booking's customer, its owner, its driver, or admin); server-side price recomputation on every booking/payment — client totals are never trusted; list endpoints hard-capped (bookings 500, vehicles 200) so no session can pull unbounded table dumps |
| Payments | M-Pesa Daraja adapter with a **fail-closed callback matrix**: only the official `stkCallback` shape is accepted in daraja mode, and `MPESA_CALLBACK_SECRET` is **required** in daraja mode (no secret configured = callbacks refused; secret compared timing-safely and accepted only via the `x-callback-secret` header, never a query string); the demo callback protocol is accepted **only** in mock mode outside production and only from the paying customer's own session; a typo'd `MPESA_MODE` is rejected instead of falling back to the mock. The card gateway is a simulation — hard-disabled in production unless `CARD_MOCK_ENABLED=true`. `completePayment` is atomic: the same payment can never complete twice, a **duplicate** payment for an already-settled booking is voided (FAILED) instead of double-billing, and FAILED attempts are terminal (a late callback cannot resurrect them); cancellation genuinely withholds the 20% late-cancellation fee (`refundedAmount` records what was actually returned) and unpaid cancels return the burned promo use |
| Booking integrity | Booking creation, availability checks, chauffeur overlap and promo burn run in a single transaction (no double-booking races); booking state transitions run transactionally — notifications and tracking calls fire only after the new status is durable; `complete` releases the vehicle only when no other blocking booking holds it |
| Rate limiting | Tiered per-IP limits in `src/proxy.ts` (Next 16 proxy convention) — 10/5min for auth, 30/5min for payments, 90/5min for quotes (429 + `Retry-After`), plus a 256 KB request-body guard before any handler parses. Limit keys are **path-normalized** (dynamic/unknown segments collapse to `:id`) so rotating IDs or spraying garbage paths cannot multiply an IP's budget, and the bucket map is hard-capped (self-healing under spray) |
| CSRF | `SameSite=Lax` cookies plus an Origin check on every state-changing request: a browser-supplied Origin whose host is neither the deployment host nor in `ALLOWED_ORIGINS` is refused (non-browser callers like Daraja callbacks pass) |
| Tracking service | `/sim/*` and `/trips/*` require the `x-internal-key` shared secret (fail-closed); `/health` reveals nothing beyond `{ok:true}`; GPS device ingest requires a per-device key `HMAC-SHA256(TRACKING_INTERNAL_KEY, "device:"+vehicleId)` — the public vehicleId alone is never a credential; socket `join-trip` requires a per-booking HMAC token (10-min TTL, expired members swept from rooms, 5 joins/10s per socket); **connection caps** (10 sockets per client IP, 500 total) stop unauthenticated connection floods; socket.io sends no cross-origin CORS headers; ingest maps are hard-capped; the service binds 127.0.0.1 by default (`BIND_HOST` to override) |
| Input hardening | Rental length capped at 365 days; delivery coordinates range-validated; JSON bodies capped at 256 KB; duplicate plate/review races mapped to friendly 400s; promo codes carry `usedCount`/`maxUses` with an atomic burn on booking |
| PII | Driver phone/licence numbers only appear for fleet managers; customers picking a chauffeur get a stripped list, and customer-facing booking payloads strip the assigned chauffeur's licence number (name + phone stay — a legitimate contact need); no card data is ever stored |
| Transport | CSP (`frame-ancestors 'none'`, `object-src 'none'`; production drops `unsafe-eval` and the `ws:`/`wss:` connect-src wildcards), `X-Frame-Options: DENY`, `nosniff`, strict Referrer-Policy, Permissions-Policy, COOP, HSTS on https, `X-Powered-By` removed; dev/prod servers bind `127.0.0.1` — always deploy behind the reverse proxy |
| Dependencies | `next-auth` removed (unused — custom HMAC sessions); transitive deps updated; remaining advisories are dev-only chains or have no fixed release yet and are not reachable through our usage |
| Repo hygiene | Secrets only via `.env` (gitignored); the tracking key is never shared in code; Android signing keys are never committed (see above) |

Known trade-offs (documented on purpose): the dev-server CSP keeps
`unsafe-inline`/`unsafe-eval` for HMR (production drops `unsafe-eval` but keeps
`unsafe-inline` because the App Router ships its flight payload as inline
scripts — a nonce-based policy is the upgrade path); in-memory rate limiting
and the tracking token TTL assume a single instance — move to Redis/shorter
TTLs when scaling horizontally; production CSP should be smoke-tested on the
first production deploy.

Deployment notes for real (non-sandbox) environments:

- Bind only via the reverse proxy — `bun run dev` / `npm start` already listen
  on `127.0.0.1`; never expose the Next port directly.
- If you replicate the sandbox's `XTransformPort` gateway pattern, whitelist
  the exact ports your mini-services use instead of forwarding to arbitrary
  localhost ports — an open forwarder turns every loopback service into
  externally-reachable surface and leaks a port-scan oracle.
- Seeding a production database requires `SEED_ADMIN_PASSWORD` (the seed
  refuses to run with the public demo password).

---

## Quickstart

```bash
bun install
cp .env.example .env          # then edit values
bun run db:push               # create SQLite schema
bun prisma/seed.ts            # demo data
bun run dev                   # app on http://localhost:3000

# in a second shell — live tracking service
cd mini-services/tracking-service
bun install
bun run dev                   # service on http://localhost:3003
```

### Demo accounts (password `demo123` — dev only)

| Role | Email |
|---|---|
| Customer | customer@safaridrive.co.ke |
| Owner | owner@safaridrive.co.ke |
| Driver | driver@safaridrive.co.ke |
| Admin | admin@safaridrive.co.ke |

Production seeding refuses this password: set `SEED_ADMIN_PASSWORD` (min 8
chars) and every seeded account uses it instead.

The seeded demo includes an **active rental with live GPS** (watch it move on the map), a confirmed chauffeur booking ready to dispatch, a paid booking awaiting owner acceptance, and 6 months of completed bookings powering the dashboards.

### Environment variables

```
DATABASE_URL=file:./db/custom.db
SESSION_SECRET=<random hex>
MPESA_MODE=mock                  # or "daraja" for the real sandbox
MPESA_CONSUMER_KEY=              # Daraja app credentials (when MPESA_MODE=daraja)
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=
MPESA_PASSKEY=
MPESA_CALLBACK_URL=
MPESA_CALLBACK_SECRET=           # REQUIRED in daraja mode (fail-closed)
CARD_MOCK_ENABLED=               # only "true" enables the simulated card gateway in production
SEED_ADMIN_PASSWORD=             # required to seed a production database
TRACKING_SERVICE_URL=http://localhost:3003
```

With `MPESA_MODE=mock`, the STK push flow is simulated end-to-end (a phone-prompt dialog lets you approve/decline with a generated receipt) — perfect for demos and tests. Switch to `daraja` with Safaricom sandbox credentials for real integration; the callback endpoint already parses Daraja's `stkCallback` payload shape.

### Connecting real GPS trackers

Any tracker that speaks the OSMAND protocol (Traccar ecosystem, GPSLogger app, most cheap GPRS trackers) can report positions. Each device must present its **per-device key** (the vehicleId alone is public and is never accepted as the only credential):

```
key = HMAC-SHA256(TRACKING_INTERNAL_KEY, "device:<vehicleId>")   (hex)

GET http://<tracking-service>:3003/?id=<vehicleId>&key=<deviceKey>&lat=-1.29&lon=36.78&timestamp=1700000000&speed=42&heading=90
POST /api/positions     { "id": "<vehicleId>", "key": "<deviceKey>", "lat": ..., "lon": ..., "speed": ..., "heading": ... }
```

Derive a device key on the service host (same `TRACKING_INTERNAL_KEY` as the app):

```bash
bun -e "console.log(require('node:crypto').createHmac('sha256', process.env.TRACKING_INTERNAL_KEY).update('device:<vehicleId>').digest('hex'))"
```

Reported positions replace the simulation for that trip and stream to the customer's map in real time.

---

## Roadmap ideas
- KYC document uploads (licence/ID verification) and vehicle inspection reports
- Security-deposit holds via M-Pesa and automated damage disputes
- SMS notifications (Africa's Talking) and push notifications
- Multi-currency and cross-border rentals
- Owner payout ledger with automated settlement

## License
MIT — see [LICENSE](./LICENSE).
